import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { provisionOrganization } from "../lib/bootstrap";
import {
  saveProspect,
  convertProspect,
  saveOpportunity,
  addOpportunityNote,
  saveTask,
  saveProposal,
  workspaceData,
} from "../lib/services/workspace";
import { saveClient } from "../lib/services/operations";
import type { Actor } from "../lib/security";
let owner: Actor;
let outsider: Actor;
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).pathname !== "/wintron_test")
    throw new Error("Isolated database required");
  const org = await provisionOrganization(
    "Workspace regression " + randomUUID(),
  );
  const other = await provisionOrganization(
    "Workspace isolation " + randomUUID(),
  );
  owner = {
    userId: "workspace-test",
    organizationId: org.id,
    name: "Test Owner",
    role: "OWNER",
  };
  outsider = { ...owner, organizationId: other.id };
});
afterAll(() => db.$disconnect());
describe.sequential("workspace persistence and access boundaries", () => {
  it("preserves owner-only access to existing job history", async () => {
    await db.jobRun.create({
      data: {
        organizationId: owner.organizationId,
        kind: "TEST",
        status: "FAILED",
        detail: "Owner-only diagnostic",
      },
    });
    expect((await workspaceData(owner)).jobs).toHaveLength(1);
    expect(
      (await workspaceData({ ...owner, role: "STAFF" })).jobs,
    ).toHaveLength(0);
    expect(
      (await workspaceData({ ...owner, role: "ACCOUNTANT" })).jobs,
    ).toHaveLength(0);
  });
  it("deduplicates prospects across website variants and retries of conversion", async () => {
    const p = await saveProspect(owner, {
      name: "Research business",
      website: "https://www.example.invalid/about",
      qualification: "Observed a service gap",
      status: "QUALIFIED",
    });
    await expect(
      saveProspect(owner, {
        name: "Alternate business name",
        website: "https://example.invalid/",
      }),
    ).rejects.toThrow(/already exists/);
    const [a, b] = await Promise.all([
      convertProspect(owner, p.id),
      convertProspect(owner, p.id),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.opportunity.count({ where: { prospectId: p.id } })).toBe(1);
    await expect(convertProspect(outsider, p.id)).rejects.toThrow("not found");
    await expect(
      saveProspect({ ...owner, role: "ACCOUNTANT" }, { name: "Blocked" }),
    ).rejects.toThrow("permission");
  });
  it("requires qualification reasoning and factual stage requirements", async () => {
    await expect(
      saveProspect(owner, { name: "No reason", status: "QUALIFIED" }),
    ).rejects.toThrow(/qualification/);
    const p = await saveProspect(owner, { name: "Unqualified" });
    await expect(convertProspect(owner, p.id)).rejects.toThrow(/Qualify/);
    await expect(
      saveOpportunity(owner, { name: "Won without a client", stage: "WON" }),
    ).rejects.toThrow(/Link a client/);
    await expect(
      saveOpportunity(owner, { name: "Lost without a reason", stage: "LOST" }),
    ).rejects.toThrow(/why/);
  });
  it("persists stages, notes, follow-up and linked clients within the organization", async () => {
    const c = await saveClient(owner, { name: "Linked client" });
    const o = await saveOpportunity(owner, {
      name: "Delivery",
      clientId: c.id,
      stage: "NEW",
      value: "123.45",
    });
    await saveOpportunity(
      owner,
      {
        name: o.name,
        clientId: c.id,
        stage: "WON",
        value: "123.45",
        followUp: "2026-12-15",
      },
      o.id,
    );
    await addOpportunityNote(owner, o.id, { content: "Scope confirmed" });
    const result = (await workspaceData(owner)).opportunities.find(
      (x) => x.id === o.id,
    )!;
    expect(result.stage).toBe("WON");
    expect(result.notes[0].content).toBe("Scope confirmed");
    expect(result.followUp?.toISOString()).toContain("2026-12-15");
    await expect(
      saveOpportunity(outsider, { name: "Cross org", clientId: c.id }),
    ).rejects.toThrow();
    await expect(
      addOpportunityNote(outsider, o.id, { content: "Cross org note" }),
    ).rejects.toThrow("not found");
    expect((await workspaceData(outsider)).opportunities).toHaveLength(0);
  });
  it("scopes project tasks and proposal drafts, with audit evidence", async () => {
    const c = await saveClient(owner, { name: "Task client" });
    const p = await db.project.create({
      data: { name: "Delivery", clientId: c.id },
    });
    const task = await saveTask(owner, {
      projectId: p.id,
      title: "Milestone",
      dueDate: "2026-12-10",
    });
    await saveTask(
      owner,
      { projectId: p.id, title: task.title, completed: true },
      task.id,
    );
    expect(
      (await db.projectTask.findUniqueOrThrow({ where: { id: task.id } }))
        .completed,
    ).toBe(true);
    await expect(
      saveTask(outsider, { projectId: p.id, title: "Denied" }),
    ).rejects.toThrow("not found");
    const proposal = await saveProposal(owner, {
      clientId: c.id,
      title: "Offer",
      content: "Deliverable scope",
    });
    expect(proposal.status).toBe("DRAFT");
    await expect(
      saveProposal(outsider, {
        clientId: c.id,
        title: "Denied",
        content: "No",
      }),
    ).rejects.toThrow();
    expect(
      await db.auditEvent.count({
        where: { organizationId: owner.organizationId, clientId: c.id },
      }),
    ).toBeGreaterThanOrEqual(3);
  });
});
