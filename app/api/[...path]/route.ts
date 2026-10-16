import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  actor,
  authorize,
  checkOrigin,
  AppError,
  type Actor,
} from "@/lib/security";
import * as schemas from "@/lib/validation";
import { reports, csv } from "@/lib/services/reports";
import {
  saveInvoice,
  issueInvoice,
  voidInvoice,
  invoiceInclude,
  decorateInvoice,
} from "@/lib/services/invoices";
import {
  recordPayment,
  refundPayment,
  allocatePayment,
} from "@/lib/services/payments";
import {
  saveClient,
  saveNote,
  recordExpense,
  reviewExpense,
  reverseExpense,
  saveRetainer,
  runRecurring,
  recordOwnerTransaction,
  recordTaxPayment,
  refreshNotifications,
} from "@/lib/services/operations";
import {
  invoicePdf,
  makePdf,
  sendInvoice,
  upload,
  download,
} from "@/lib/services/documents";
import {
  transaction,
  audit,
  clientInOrg,
  journal,
} from "@/lib/services/ledger";
import { D, sum } from "@/lib/money";
import { readLimited, readMultipart } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function body(request: Request) {
  const raw = new TextDecoder().decode(await readLimited(request, 200000));
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("Invalid JSON request.");
  }
}
function range(request: NextRequest) {
  const to = schemas.date.parse(
    request.nextUrl.searchParams.get("to") ||
      new Date().toISOString().slice(0, 10),
  );
  const from = schemas.date.parse(
    request.nextUrl.searchParams.get("from") ||
      `${to.getUTCFullYear()}-${String(to.getUTCMonth() + 1).padStart(2, "0")}-01`,
  );
  if (from > to) throw new AppError("Start date must precede end date.");
  return { from, to };
}
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const [resource, id, action] = (await context.params).path;
  const method = request.method;
  try {
    if (resource === "health" && method === "GET") {
      await db.$queryRaw`SELECT 1`;
      return json({ status: "ok" });
    }
    if (resource === "me" && method === "GET") {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) throw new AppError("Please sign in.", 401);
      return json({
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          twoFactorEnabled: session.user.twoFactorEnabled,
        },
        memberships: await db.membership.findMany({
          where: { userId: session.user.id, active: true },
          select: { role: true },
        }),
      });
    }
    const a = await actor(request.headers);
    const organizationId = a.organizationId;
    if (method !== "GET") checkOrigin(request);
    if (method === "GET") {
      if (resource === "state") {
        const { from, to } = range(request);
        const [report, organization, clients, activity, notifications] =
          await Promise.all([
            reports(a, from, to),
            db.organization.findUniqueOrThrow({
              where: { id: organizationId },
            }),
            db.client.findMany({
              where: { organizationId },
              orderBy: { name: "asc" },
            }),
            db.auditEvent.findMany({
              where: { organizationId },
              orderBy: { createdAt: "desc" },
              take: 30,
            }),
            db.notification.findMany({
              where: { organizationId },
              include: { reads: { where: { userId: a.userId } } },
              orderBy: { createdAt: "desc" },
              take: 50,
            }),
          ]);
        return json({
          actor: a,
          organization,
          clients,
          activity,
          notifications,
          ...report,
        });
      }
      if (resource === "clients" && id) {
        const client = await db.client.findFirst({
          where: { id, organizationId },
          include: {
            contacts: true,
            notes: {
              include: { revisions: true },
              orderBy: { updatedAt: "desc" },
            },
            projects: true,
            documents: true,
            retainers: true,
            payments: true,
            invoices: { include: invoiceInclude },
          },
        });
        if (!client) throw new AppError("Client not found.", 404);
        const activity = await db.auditEvent.findMany({
          where: { organizationId, clientId: id },
          orderBy: { createdAt: "desc" },
          take: 200,
        });
        return json({
          ...client,
          invoices: client.invoices.map(decorateInvoice),
          activity,
        });
      }
      if (resource === "invoices" && id && action === "pdf") {
        const result = await invoicePdf(a, id);
        return new Response(new Uint8Array(result.bytes), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${result.filename}"`,
            "Cache-Control": "no-store",
          },
        });
      }
      if (resource === "documents" && id) {
        const { doc, bytes } = await download(a, id);
        const preview = action === "preview";
        if (action && !preview) throw new AppError("Endpoint not found.", 404);
        if (
          preview &&
          !["application/pdf", "image/png", "image/jpeg"].includes(doc.mimeType)
        )
          throw new AppError(
            "Preview is available for PDF, PNG and JPEG files. Download this document to open it.",
            415,
          );
        return new Response(new Uint8Array(bytes), {
          headers: {
            "Content-Type": doc.mimeType,
            "Content-Disposition": `${preview ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
          },
        });
      }
      if (resource === "search") {
        const q = (request.nextUrl.searchParams.get("q") || "")
          .trim()
          .slice(0, 100);
        if (q.length < 2) return json([]);
        const contains = { contains: q, mode: "insensitive" as const };
        const [clients, invoices, projects, notes] = await Promise.all([
          db.client.findMany({
            where: {
              organizationId,
              OR: [{ name: contains }, { email: contains }],
            },
            take: 8,
          }),
          db.invoice.findMany({
            where: {
              organizationId,
              OR: [{ number: contains }, { description: contains }],
            },
            take: 8,
          }),
          db.project.findMany({
            where: {
              client: { organizationId },
              OR: [{ name: contains }, { description: contains }],
            },
            take: 8,
          }),
          db.$queryRaw<
            { id: string; clientId: string; title: string }[]
          >`SELECT n.id, n."clientId", n.title FROM "ClientNote" n JOIN "Client" c ON c.id=n."clientId" WHERE c."organizationId"=${organizationId} AND (to_tsvector('english', n.title || ' ' || n.content) @@ plainto_tsquery('english', ${q}) OR n.title ILIKE ${"%" + q + "%"}) ORDER BY n."updatedAt" DESC LIMIT 8`,
        ]);
        return json([
          ...clients.map((c) => ({
            id: c.id,
            label: c.name,
            kind: "Client",
            module: "clients",
          })),
          ...invoices.map((i) => ({
            id: i.id,
            label: `${i.number || "Draft"} · ${i.description}`,
            kind: "Invoice",
            module: "invoices",
          })),
          ...projects.map((p) => ({
            id: p.clientId,
            label: p.name,
            kind: "Project",
            module: "clients",
          })),
          ...notes.map((n) => ({
            id: n.clientId,
            label: n.title,
            kind: "Note",
            module: "clients",
          })),
        ]);
      }
      if (resource === "reports") {
        const { from, to } = range(request);
        const r = await reports(a, from, to);
        const type = request.nextUrl.searchParams.get("type") || "ledger";
        let rows: unknown[][];
        switch (type) {
          case "profit-loss":
            rows = [
              ["Account", "Net expense / (revenue)"],
              ...r.accountBalances
                .filter((x) => ["REVENUE", "EXPENSE"].includes(x.type))
                .map((x) => [x.name, x.periodBalance]),
              ["Net profit", r.profit],
            ];
            break;
          case "balance-sheet":
            rows = [
              ["Account", "Balance"],
              ...r.accountBalances
                .filter((x) => !["REVENUE", "EXPENSE"].includes(x.type))
                .map((x) => [x.name, x.balance]),
              ["Retained earnings", r.retainedEarnings],
              ["Assets", r.assets],
              ["Liabilities", r.liabilities],
              ["Equity including earnings", r.equity],
            ];
            break;
          case "cash-flow":
            rows = [
              ["Source", "Cash movement"],
              ...r.entries.map((e) => [
                e.memo,
                sum(
                  e.lines
                    .filter((l) => l.account.code === "1000")
                    .map((l) =>
                      D(l.debit.toString())
                        .minus(l.credit.toString())
                        .toString(),
                    ),
                ).toFixed(2),
              ]),
              ["Total", r.cashMovement],
            ];
            break;
          case "aging":
            rows = [
              ["Invoice", "Client", "Due date", "Current outstanding balance"],
              ...r.invoices
                .filter((i) => i.status === "ISSUED" && D(i.balance).gt(0))
                .map((i) => [
                  i.number,
                  i.client.name,
                  i.dueDate.toISOString().slice(0, 10),
                  i.balance,
                ]),
            ];
            break;
          case "clients":
            rows = [
              ["Client", "Recognized revenue"],
              ...r.revenueByClient.map((c) => [c.name, c.revenue]),
            ];
            break;
          case "services":
            rows = [
              ["Service category", "Recognized revenue"],
              ...r.revenueByService.map((x) => [x.name, x.revenue]),
            ];
            break;
          case "retainers":
            rows = [
              ["Period recognized retainer revenue", r.retainerRevenue],
              ["Monthly contract run rate", r.mrr],
              ["Client", "Contract", "Frequency", "Amount", "Status"],
              ...r.retainers.map((x) => [
                x.client.name,
                x.name,
                x.frequency,
                x.amount,
                x.status,
              ]),
            ];
            break;
          case "owners":
            rows = [
              ["Owner", "Date", "Kind", "Amount", "Notes"],
              ...r.owners.flatMap((o) =>
                o.transactions
                  .filter((t) => t.date >= from && t.date <= to)
                  .map((t) => [
                    o.name,
                    t.date.toISOString().slice(0, 10),
                    t.kind,
                    t.amount,
                    t.notes,
                  ]),
              ),
            ];
            break;
          case "expenses":
            rows = [
              ["Category", "Book expense"],
              ...r.accountBalances
                .filter((x) => x.type === "EXPENSE")
                .map((x) => [x.name, x.periodBalance]),
            ];
            break;
          case "trial-balance":
            rows = [
              ["Code", "Account", "Debit balance", "Credit balance"],
              ...r.accountBalances.map((x) => [
                x.code,
                x.name,
                D.max(0, x.balance).toFixed(2),
                D.max(0, D(x.balance).negated()).toFixed(2),
              ]),
            ];
            break;
          default:
            rows = [
              ["Date", "Journal ID", "Memo", "Account", "Debit", "Credit"],
              ...r.entries.flatMap((e) =>
                e.lines.map((l) => [
                  e.date.toISOString().slice(0, 10),
                  e.id,
                  e.memo,
                  `${l.account.code} ${l.account.name}`,
                  l.debit,
                  l.credit,
                ]),
              ),
            ];
        }
        if (request.nextUrl.searchParams.get("format") === "pdf")
          return new Response(
            new Uint8Array(
              await makePdf(
                `${type} · ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
                rows.map((row) => row.join(" | ")),
              ),
            ),
            {
              headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${type}.pdf"`,
                "Cache-Control": "no-store",
              },
            },
          );
        return new Response(csv(rows), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${type}.csv"`,
            "Cache-Control": "no-store",
          },
        });
      }
      if (resource === "settings") {
        authorize(a, "owner");
        const [users, audits, jobs, accounts] = await Promise.all([
          db.membership.findMany({
            where: { organizationId },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  twoFactorEnabled: true,
                  sessions: {
                    select: {
                      id: true,
                      createdAt: true,
                      expiresAt: true,
                      userAgent: true,
                    },
                  },
                },
              },
            },
          }),
          db.auditEvent.findMany({
            where: { organizationId },
            orderBy: { createdAt: "desc" },
            take: 200,
          }),
          db.jobRun.findMany({
            where: { organizationId },
            orderBy: { createdAt: "desc" },
            take: 20,
          }),
          db.ledgerAccount.findMany({
            where: { organizationId },
            orderBy: { code: "asc" },
          }),
        ]);
        return json({
          users,
          audits,
          jobs,
          accounts,
          smtpConfigured: !!process.env.SMTP_HOST && !!process.env.SMTP_FROM,
          mfaRequired: process.env.REQUIRE_MFA === "true",
          version: "1.0.0",
          database: "Connected",
          storage: "Private local filesystem",
        });
      }
      throw new AppError("Endpoint not found.", 404);
    }
    if (method === "POST" || method === "PATCH") {
      if (resource === "documents")
        return json(await upload(a, await readMultipart(request)), 201);
      const raw = await body(request);
      if (resource === "clients") return json(await saveClient(a, raw, id));
      if (resource === "notes") return json(await saveNote(a, raw, id));
      if (resource === "invoices") {
        if (!id || !action) return json(await saveInvoice(a, raw, id));
        if (action === "issue") return json(await issueInvoice(a, id));
        if (action === "void") {
          const data = schemas.reasonSchema.parse(raw);
          return json(await voidInvoice(a, id, data.reason, data.date));
        }
        if (action === "send") return json(await sendInvoice(a, id));
        if (action === "duplicate") {
          authorize(a, "write");
          const invoice = await db.invoice.findFirst({
            where: { id, organizationId },
            include: invoiceInclude,
          });
          if (!invoice) throw new AppError("Invoice not found.", 404);
          const today = new Date().toISOString().slice(0, 10);
          return json(
            await saveInvoice(a, {
              ...invoice,
              issueDate: today,
              dueDate: today,
              lines: invoice.lines.map((l) => ({
                ...l,
                quantity: l.quantity.toString(),
                unitPrice: l.unitPrice.toString(),
                discountPercent: l.discountPercent.toString(),
                taxPercent: l.taxPercent.toString(),
              })),
            }),
          );
        }
        if (action === "delivery") {
          authorize(a, "write");
          const data = z
            .object({
              recipient: z.email(),
              status: z.enum(["SENT", "DELIVERED"]),
              notes: z.string().max(500),
            })
            .parse(raw);
          return json(
            await transaction(async (tx) => {
              const invoice = await tx.invoice.findFirst({
                where: { id, organizationId, status: "ISSUED" },
              });
              if (!invoice)
                throw new AppError("Issued invoice not found.", 404);
              const event = await tx.invoiceDelivery.create({
                data: {
                  invoiceId: id,
                  recipient: data.recipient,
                  status: data.status,
                  actorId: a.userId,
                },
              });
              await audit(
                tx,
                a,
                "DELIVERY",
                "INVOICE",
                id,
                `${data.status}: ${data.notes}`,
                invoice.clientId,
              );
              return event;
            }),
          );
        }
      }
      if (resource === "payments") {
        if (!id) return json(await recordPayment(a, raw));
        if (action === "refund") return json(await refundPayment(a, id, raw));
        if (action === "allocate") {
          const data = z
            .object({
              invoiceId: z.string(),
              amount: schemas.money,
              date: schemas.date,
            })
            .parse(raw);
          return json(
            await allocatePayment(
              a,
              id,
              data.invoiceId,
              data.amount,
              data.date,
            ),
          );
        }
        if (action === "reconcile") {
          authorize(a, "owner");
          const data = z.object({ reconciled: z.boolean() }).parse(raw);
          return json(
            await transaction(async (tx) => {
              const p = await tx.payment.findFirst({
                where: { id, organizationId },
              });
              if (!p) throw new AppError("Payment not found.", 404);
              const result = await tx.payment.update({ where: { id }, data });
              await audit(
                tx,
                a,
                "RECONCILED",
                "PAYMENT",
                id,
                data.reconciled
                  ? "Marked reconciled"
                  : "Reopened reconciliation",
                p.clientId,
              );
              return result;
            }),
          );
        }
      }
      if (resource === "expenses") {
        if (!id) return json(await recordExpense(a, raw));
        if (action === "review") return json(await reviewExpense(a, id, raw));
        if (action === "reverse") {
          const data = schemas.reasonSchema.parse(raw);
          return json(await reverseExpense(a, id, data.date, data.reason));
        }
      }
      if (resource === "retainers") {
        if (id === "run") return json(await runRecurring(a));
        if (action === "time") {
          authorize(a, "write");
          const data = z
            .object({
              date: schemas.date,
              minutes: z.coerce.number().int().positive().max(1440),
              description: z.string().min(1).max(1000),
            })
            .parse(raw);
          return json(
            await transaction(async (tx) => {
              if (
                !(await tx.retainer.findFirst({
                  where: { id, organizationId },
                }))
              )
                throw new AppError("Retainer not found.", 404);
              return tx.timeEntry.create({
                data: { ...data, retainerId: id, actorId: a.userId },
              });
            }),
          );
        }
        return json(await saveRetainer(a, raw, id));
      }
      if (resource === "projects" || resource === "contacts") {
        authorize(a, "write");
        return json(
          await transaction(async (tx) => {
            if (resource === "projects") {
              const data = schemas.projectSchema.parse(raw);
              await clientInOrg(tx, a, data.clientId);
              if (
                id &&
                !(await tx.project.findFirst({
                  where: { id, clientId: data.clientId },
                }))
              )
                throw new AppError("Project not found.", 404);
              const result = id
                ? await tx.project.update({ where: { id }, data })
                : await tx.project.create({ data });
              await audit(
                tx,
                a,
                id ? "UPDATED" : "CREATED",
                "PROJECT",
                result.id,
                data.name,
                data.clientId,
              );
              return result;
            }
            const data = schemas.contactSchema.parse(raw);
            await clientInOrg(tx, a, data.clientId);
            return tx.contact.create({ data });
          }),
        );
      }
      if (resource === "organization") {
        authorize(a, "owner");
        const data = schemas.organizationSchema.parse(raw);
        return json(
          await transaction(async (tx) => {
            const before = await tx.organization.findUniqueOrThrow({
              where: { id: organizationId },
            });
            const result = await tx.organization.update({
              where: { id: organizationId },
              data,
            });
            await audit(
              tx,
              a,
              "UPDATED",
              "ORGANIZATION",
              organizationId,
              "Updated organization settings",
              undefined,
              before,
              result,
            );
            return result;
          }),
        );
      }
      if (resource === "tax-config") {
        authorize(a, "owner");
        const data = schemas.taxSchema.parse(raw);
        return json(
          await transaction(async (tx) => {
            const config = await tx.taxConfiguration.create({
              data: { ...data, organizationId, createdBy: a.userId },
            });
            await audit(
              tx,
              a,
              "CREATED",
              "TAX_CONFIGURATION",
              config.id,
              "Created a new version of tax reserve assumptions",
            );
            return config;
          }),
        );
      }
      if (resource === "tax-payments")
        return json(await recordTaxPayment(a, raw));
      if (resource === "owner-transactions")
        return json(await recordOwnerTransaction(a, raw));
      if (resource === "owners") {
        authorize(a, "owner");
        const data = schemas.ownerSchema.parse(raw);
        return json(
          await transaction(async (tx) => {
            if (
              id &&
              !(await tx.owner.findFirst({ where: { id, organizationId } }))
            )
              throw new AppError("Owner not found.", 404);
            const others = await tx.owner.findMany({
              where: { organizationId, ...(id ? { id: { not: id } } : {}) },
            });
            if (
              sum(others.map((o) => o.percentage.toString()))
                .plus(data.percentage)
                .gt(100)
            )
              throw new AppError("Combined ownership cannot exceed 100%.");
            const result = id
              ? await tx.owner.update({ where: { id }, data })
              : await tx.owner.create({ data: { ...data, organizationId } });
            await audit(
              tx,
              a,
              "SAVED",
              "OWNER",
              result.id,
              "Updated owner configuration",
              undefined,
              undefined,
              result,
            );
            return result;
          }),
        );
      }
      if (resource === "journals") {
        authorize(a, "owner");
        const data = z
          .object({
            date: schemas.date,
            memo: z.string().min(5).max(1000),
            lines: z
              .array(
                z.object({
                  code: z.string(),
                  debit: schemas.money,
                  credit: schemas.money,
                }),
              )
              .min(2)
              .max(100),
          })
          .parse(raw);
        return json(
          await transaction(async (tx) => {
            const result = await journal(
              tx,
              a,
              {
                date: data.date,
                memo: data.memo,
                sourceType: "ADJUSTMENT",
                sourceId: randomUUID(),
              },
              data.lines,
            );
            await audit(
              tx,
              a,
              "POSTED",
              "JOURNAL",
              result.id,
              `Accountant-reviewed adjustment: ${data.memo}`,
            );
            return result;
          }),
        );
      }
      if (resource === "notifications") {
        if (id === "refresh") {
          await refreshNotifications(a);
          return json({ ok: true });
        }
        if (
          !(await db.notification.findFirst({ where: { id, organizationId } }))
        )
          throw new AppError("Notification not found.", 404);
        return json(
          await db.notificationRead.upsert({
            where: {
              notificationId_userId: { notificationId: id, userId: a.userId },
            },
            update: {},
            create: { notificationId: id, userId: a.userId },
          }),
        );
      }
      if (resource === "users") {
        authorize(a, "owner");
        if (!id) {
          const data = schemas.userSchema.parse(raw);
          const password = await hashPassword(data.password);
          return json(
            await transaction(async (tx) => {
              const userId = randomUUID();
              const user = await tx.user.create({
                data: {
                  id: userId,
                  email: data.email.toLowerCase(),
                  name: data.name,
                  emailVerified: true,
                  accounts: {
                    create: {
                      id: randomUUID(),
                      accountId: userId,
                      providerId: "credential",
                      password,
                    },
                  },
                  memberships: { create: { organizationId, role: data.role } },
                },
                select: { id: true, email: true, name: true },
              });
              await audit(
                tx,
                a,
                "CREATED",
                "USER",
                user.id,
                `Provisioned ${data.role} account: ${user.email}`,
              );
              return user;
            }),
          );
        }
        const data = z
          .object({
            role: z.enum(["OWNER", "STAFF", "ACCOUNTANT"]),
            active: z.boolean(),
          })
          .parse(raw);
        return json(
          await transaction(async (tx) => {
            const m = await tx.membership.findFirst({
              where: { organizationId, userId: id },
            });
            if (!m) throw new AppError("User not found.", 404);
            if (id === a.userId)
              throw new AppError("Another owner must change your own access.");
            const result = await tx.membership.update({
              where: { id: m.id },
              data,
            });
            await tx.session.deleteMany({ where: { userId: id } });
            await audit(
              tx,
              a,
              "UPDATED",
              "USER",
              id,
              "Updated access and revoked sessions",
            );
            return result;
          }),
        );
      }
      if (resource === "sessions") {
        authorize(a, "owner");
        const session = await db.session.findFirst({
          where: { id, user: { memberships: { some: { organizationId } } } },
        });
        if (!session) throw new AppError("Session not found.", 404);
        await db.session.delete({ where: { id } });
        return json({ ok: true });
      }
      throw new AppError("Endpoint not found.", 404);
    }
    throw new AppError("Method not allowed.", 405);
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    if (error instanceof AppError)
      return json({ error: error.message }, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        return json(
          { error: "This record already exists. Refresh before retrying." },
          409,
        );
      if (error.code === "P2003")
        return json({ error: "A linked record is invalid." }, 400);
    }
    console.error("Request failed", {
      resource,
      method,
      kind: error instanceof Error ? error.name : "Unknown",
    });
    return json(
      {
        error:
          "The operation could not be completed. No partial financial changes were committed. Check server health and try again.",
      },
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
