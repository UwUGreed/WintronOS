import { leadConfigured } from "./leads";
import { smtpConfiguration } from "../smtp";
import { z } from "zod";
import { db } from "../db";
import { authorize, AppError, type Actor } from "../security";
import { transaction, audit, clientInOrg } from "./ledger";
import { date, money } from "../validation";
const text = z.string().trim().max(500);
const optionalDate = z
  .union([date, z.literal("")])
  .optional()
  .transform((v) => v || null);
const url = z
  .union([
    z.url().refine((v) => /^https?:/.test(v), "Use an http or https URL."),
    z.literal(""),
  ])
  .default("");
export const stages = [
  "NEW",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;
const prospectSchema = z
  .object({
    name: text.min(1),
    industry: text.default(""),
    location: text.default(""),
    website: url,
    email: z.union([z.email(), z.literal("")]).default(""),
    phone: text.default(""),
    sourceUrl: url,
    evidence: z.string().trim().max(10000).default(""),
    qualification: z.string().trim().max(10000).default(""),
    observedAt: optionalDate,
    status: z.enum(["SAVED", "QUALIFIED", "DISMISSED"]).default("SAVED"),
  })
  .refine((v) => v.status !== "QUALIFIED" || v.qualification.length > 0, {
    message: "Explain your qualification before qualifying this prospect.",
    path: ["qualification"],
  });
export function prospectIdentity(v: {
  name: string;
  website: string;
  email: string;
}) {
  return v.website
    ? `web:${new URL(v.website).hostname.toLowerCase().replace(/^www\./, "")}`
    : v.email
      ? `email:${v.email.toLowerCase()}`
      : `name:${v.name.toLowerCase().replace(/\s+/g, " ").trim()}`;
}
export async function workspaceData(a: Actor) {
  const organizationId = a.organizationId;
  const [prospects, opportunities, projects, searches, jobs] =
    await Promise.all([
      db.prospect.findMany({
        where: { organizationId },
        include: { opportunity: true },
        orderBy: { createdAt: "desc" },
      }),
      db.opportunity.findMany({
        where: { organizationId },
        include: {
          prospect: true,
          client: true,
          notes: { orderBy: { createdAt: "desc" } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      db.project.findMany({
        where: { client: { organizationId } },
        include: {
          client: true,
          tasks: { orderBy: { createdAt: "asc" } },
          documents: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      db.savedSearch.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      }),
      a.role === "OWNER"
        ? db.jobRun.findMany({
            where: { organizationId },
            orderBy: { createdAt: "desc" },
            take: 50,
          })
        : Promise.resolve([]),
    ]);
  return {
    prospects,
    opportunities,
    projects,
    searches,
    jobs,
    integrations: {
      leadProvider: leadConfigured(),
      stripe: false,
      inbox: false,
      smtp: smtpConfiguration().configured,
    },
  };
}
export async function saveProspect(a: Actor, raw: unknown, id?: string) {
  authorize(a, "write");
  const data = prospectSchema.parse(raw);
  return transaction(async (tx) => {
    if (
      id &&
      !(await tx.prospect.findFirst({
        where: { id, organizationId: a.organizationId },
      }))
    )
      throw new AppError("Prospect not found.", 404);
    const identityKey = prospectIdentity(data);
    const duplicate = await tx.prospect.findFirst({
      where: {
        organizationId: a.organizationId,
        id: id ? { not: id } : undefined,
        OR: [
          { identityKey },
          { name: { equals: data.name, mode: "insensitive" } },
          ...(data.email
            ? [{ email: { equals: data.email, mode: "insensitive" as const } }]
            : []),
        ],
      },
    });
    if (duplicate)
      throw new AppError(
        `This prospect already exists: ${duplicate.name}. Open the existing record.`,
        409,
      );
    const client = await tx.client.findFirst({
      where: {
        organizationId: a.organizationId,
        OR: [
          { name: { equals: data.name, mode: "insensitive" } },
          ...(data.email
            ? [{ email: { equals: data.email, mode: "insensitive" as const } }]
            : []),
          ...(data.website
            ? [
                {
                  website: {
                    equals: data.website,
                    mode: "insensitive" as const,
                  },
                },
              ]
            : []),
        ],
      },
    });
    if (!id && client)
      throw new AppError(
        `An existing client matches: ${client.name}. Open Clients to continue.`,
        409,
      );
    const result = id
      ? await tx.prospect.update({
          where: { id },
          data: { ...data, identityKey },
        })
      : await tx.prospect.create({
          data: { ...data, identityKey, organizationId: a.organizationId },
        });
    await audit(
      tx,
      a,
      id ? "UPDATED" : "CREATED",
      "PROSPECT",
      result.id,
      data.name,
    );
    return result;
  });
}
export async function convertProspect(a: Actor, id: string) {
  authorize(a, "write");
  return transaction(async (tx) => {
    const prospect = await tx.prospect.findFirst({
      where: { id, organizationId: a.organizationId },
      include: { opportunity: true },
    });
    if (!prospect) throw new AppError("Prospect not found.", 404);
    if (prospect.opportunity) return prospect.opportunity;
    if (prospect.status !== "QUALIFIED")
      throw new AppError(
        "Qualify this prospect with your reasoning before adding it to the pipeline.",
      );
    const result = await tx.opportunity.create({
      data: {
        organizationId: a.organizationId,
        prospectId: id,
        name: prospect.name,
        stage: "QUALIFIED",
        ownerName: a.name,
      },
    });
    await audit(
      tx,
      a,
      "CREATED",
      "OPPORTUNITY",
      result.id,
      `${prospect.name} added to pipeline`,
    );
    return result;
  });
}
export async function saveOpportunity(a: Actor, raw: unknown, id?: string) {
  authorize(a, "write");
  const data = z
    .object({
      name: text.min(1),
      stage: z.enum(stages).default("NEW"),
      ownerName: text.default(""),
      value: money.default("0"),
      followUp: optionalDate,
      clientId: text.default(""),
      lossReason: text.default(""),
    })
    .refine((v) => v.stage !== "LOST" || v.lossReason.length >= 5, {
      message: "Explain why this opportunity was lost (at least 5 characters).",
      path: ["lossReason"],
    })
    .refine((v) => v.stage !== "WON" || !!v.clientId, {
      message: "Link a client before marking this opportunity won.",
      path: ["clientId"],
    })
    .parse(raw);
  return transaction(async (tx) => {
    if (
      id &&
      !(await tx.opportunity.findFirst({
        where: { id, organizationId: a.organizationId },
      }))
    )
      throw new AppError("Opportunity not found.", 404);
    if (data.clientId) await clientInOrg(tx, a, data.clientId);
    const values = { ...data, clientId: data.clientId || null };
    const result = id
      ? await tx.opportunity.update({ where: { id }, data: values })
      : await tx.opportunity.create({
          data: { ...values, organizationId: a.organizationId },
        });
    await audit(
      tx,
      a,
      id ? "UPDATED" : "CREATED",
      "OPPORTUNITY",
      result.id,
      `${data.name} · ${data.stage}`,
      data.clientId || undefined,
    );
    return result;
  });
}
export async function addOpportunityNote(a: Actor, id: string, raw: unknown) {
  authorize(a, "write");
  const { content } = z
    .object({ content: z.string().trim().min(1).max(10000) })
    .parse(raw);
  return transaction(async (tx) => {
    const opp = await tx.opportunity.findFirst({
      where: { id, organizationId: a.organizationId },
    });
    if (!opp) throw new AppError("Opportunity not found.", 404);
    const note = await tx.opportunityNote.create({
      data: { opportunityId: id, content, authorName: a.name },
    });
    await audit(
      tx,
      a,
      "CREATED",
      "OPPORTUNITY_NOTE",
      note.id,
      `Note added to ${opp.name}`,
      opp.clientId || undefined,
    );
    return note;
  });
}
export async function saveTask(a: Actor, raw: unknown, id?: string) {
  authorize(a, "write");
  const data = z
    .object({
      projectId: text.min(1),
      title: text.min(1),
      ownerName: text.default(""),
      dueDate: optionalDate,
      completed: z.boolean().default(false),
    })
    .parse(raw);
  return transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: {
        id: data.projectId,
        client: { organizationId: a.organizationId },
      },
    });
    if (!project) throw new AppError("Project not found.", 404);
    if (
      id &&
      !(await tx.projectTask.findFirst({
        where: { id, projectId: data.projectId },
      }))
    )
      throw new AppError("Task not found.", 404);
    const task = id
      ? await tx.projectTask.update({ where: { id }, data })
      : await tx.projectTask.create({ data });
    await audit(
      tx,
      a,
      id ? "UPDATED" : "CREATED",
      "TASK",
      task.id,
      `${data.title} · ${data.completed ? "completed" : "open"}`,
      project.clientId,
    );
    return task;
  });
}
export async function saveSearch(a: Actor, raw: unknown) {
  authorize(a, "write");
  const data = z
    .object({ name: text.min(1), query: text, industry: text, location: text })
    .parse(raw);
  return db.savedSearch.create({
    data: { ...data, organizationId: a.organizationId },
  });
}
export async function saveProposal(a: Actor, raw: unknown, id?: string) {
  authorize(a, "write");
  const data = z
    .object({
      clientId: text.min(1),
      title: text.min(1),
      content: z.string().trim().min(1).max(20000),
    })
    .parse(raw);
  return transaction(async (tx) => {
    await clientInOrg(tx, a, data.clientId);
    if (
      id &&
      !(await tx.proposal.findFirst({ where: { id, clientId: data.clientId } }))
    )
      throw new AppError("Proposal not found.", 404);
    const proposal = id
      ? await tx.proposal.update({ where: { id }, data })
      : await tx.proposal.create({ data });
    await audit(
      tx,
      a,
      id ? "UPDATED" : "CREATED",
      "PROPOSAL",
      proposal.id,
      `Draft proposal: ${data.title}`,
      data.clientId,
    );
    return proposal;
  });
}
