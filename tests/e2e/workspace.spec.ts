import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
async function login(page: Page) {
  const stored = JSON.parse(
    readFileSync(".data/e2e-owner-session.json", "utf8"),
  );
  await page.context().addCookies(stored.cookies);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good/ })).toBeVisible();
}
const headers = { origin: "http://localhost:43817" };
test("prospect research, saved filters, qualification, duplicate detection and pipeline persistence", async ({
  page,
}) => {
  await login(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Prospecting", exact: true })
    .click();
  await expect(
    page.getByText("External lead search needs a provider"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add prospect", exact: true })
    .first()
    .click();
  let panel = page.getByRole("dialog");
  await panel.getByLabel("Business name").fill("Fictional Research Studio");
  await panel
    .getByLabel("Website", { exact: true })
    .fill("https://research.example.invalid");
  await panel.getByLabel("Industry", { exact: true }).fill("Design");
  await panel.getByLabel("Location", { exact: true }).fill("Charleston");
  await panel
    .getByLabel("Source URL")
    .fill("https://research.example.invalid/about");
  await panel.getByLabel("Source checked on").fill("2026-11-10");
  await panel
    .getByLabel("Sourced facts")
    .fill("Fictional test evidence: website lists design services.");
  await panel
    .getByRole("button", { name: "Save prospect", exact: true })
    .click();
  await expect(panel).toBeHidden();
  await page.getByLabel("Search saved prospects").fill("Research");
  await page.getByLabel("Industry", { exact: true }).fill("Design");
  await page.getByRole("button", { name: "Save search", exact: true }).click();
  panel = page.getByRole("dialog");
  await panel.getByLabel("Search name").fill("Design research");
  await panel.getByRole("button", { name: "Save search", exact: true }).click();
  await page
    .getByRole("button", { name: "Fictional Research Studio", exact: true })
    .click();
  panel = page.getByRole("dialog");
  await expect(
    panel.getByRole("link", { name: "View source" }),
  ).toHaveAttribute("href", "https://research.example.invalid/about");
  await expect(
    panel.getByRole("button", { name: "Add to pipeline" }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "Edit / qualify prospect" }).click();
  await panel.getByLabel("Status", { exact: true }).selectOption("QUALIFIED");
  await panel.getByRole("button", { name: "Save changes" }).click();
  await expect(panel.getByRole("alert")).toContainText("qualification");
  await expect(panel.getByLabel("Business name")).toHaveValue(
    "Fictional Research Studio",
  );
  await panel
    .getByLabel("Qualification reasoning")
    .fill("Fictional assessment: potential fit for a website review.");
  await panel.getByRole("button", { name: "Save changes" }).click();
  await expect(
    panel.getByRole("button", { name: "Add to pipeline" }),
  ).toBeEnabled();
  await panel.getByRole("button", { name: "Add to pipeline" }).click();
  await expect(
    panel.getByRole("button", { name: "Open pipeline" }),
  ).toBeVisible();
  await page.screenshot({ path: ".data/prospect-detail.png", fullPage: true });
  await panel.getByRole("button", { name: "Close details" }).click();
  await expect(
    page.getByRole("button", {
      name: "Fictional Research Studio",
      exact: true,
    }),
  ).toBeFocused();
  await expect(page.getByLabel("Search saved prospects")).toHaveValue(
    "Research",
  );
  await expect(page.getByLabel("Industry", { exact: true })).toHaveValue(
    "Design",
  );
  await page
    .getByRole("button", { name: "Add prospect", exact: true })
    .first()
    .click();
  panel = page.getByRole("dialog");
  await panel.getByLabel("Business name").fill("Different name");
  await panel
    .getByLabel("Website", { exact: true })
    .fill("https://www.research.example.invalid/");
  await panel.getByRole("button", { name: "Save prospect" }).click();
  await expect(panel.getByRole("alert")).toContainText("already exists");
  page.once("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Pipeline", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fictional Research Studio", exact: true })
    .click();
  panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "Change stage / follow-up" }).click();
  await panel.getByLabel("Stage", { exact: true }).selectOption("PROPOSAL");
  await panel.getByLabel("Next follow-up").fill("2026-11-10");
  await panel.getByRole("button", { name: "Save changes" }).click();
  await panel.getByRole("button", { name: "Add note", exact: true }).click();
  await panel
    .getByLabel("Opportunity note")
    .fill("Discovery complete. Prepare the proposed scope.");
  await panel.getByRole("button", { name: "Save note" }).click();
  await expect(
    panel.getByText("Discovery complete. Prepare the proposed scope."),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "Kanban view" }).click();
  await expect(
    page
      .locator(".kanban-column")
      .filter({ has: page.getByRole("heading", { name: /^Proposal/ }) })
      .getByText("Fictional Research Studio"),
  ).toBeVisible();
  await page.screenshot({ path: ".data/pipeline-board.png", fullPage: true });
  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: "Fictional Research Studio" }),
  ).toContainText("proposal");
  const response = await page.request.get("/api/workspace");
  const data = await response.json();
  expect(
    data.opportunities.filter(
      (o: { name: string }) => o.name === "Fictional Research Studio",
    ),
  ).toHaveLength(1);
  expect(
    data.opportunities.find(
      (o: { name: string }) => o.name === "Fictional Research Studio",
    ).notes[0].content,
  ).toContain("Discovery complete");
  const opportunity = data.opportunities.find(
    (o: { name: string }) => o.name === "Fictional Research Studio",
  );
  await page.goto(`/?module=pipeline&record=${opportunity.id}`);
  panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "Create linked client" }).click();
  const clientForm = page.getByRole("dialog", { name: "Add client" });
  await expect(clientForm.getByLabel("Company name")).toHaveValue(
    "Fictional Research Studio",
  );
  await clientForm.getByRole("button", { name: "Save record" }).click();
  await expect(clientForm).toBeHidden();
  await panel.getByRole("button", { name: "Mark won", exact: true }).click();
  await panel.getByRole("button", { name: "Save changes" }).click();
  await expect(panel.getByText("won", { exact: true })).toBeVisible();
  const linked = (
    await (await page.request.get("/api/workspace")).json()
  ).opportunities.find((o: { id: string }) => o.id === opportunity.id);
  expect(linked.clientId).toBeTruthy();
  expect(linked.stage).toBe("WON");
  expect(errors).toEqual([]);
});
test("client proposal, project tasks, failed-save recovery and safe billing rule preview", async ({
  page,
}) => {
  await login(page);
  const created = await page.request.post("/api/clients", {
    headers,
    data: { name: "Fictional Delivery Client" },
  });
  expect(created.ok()).toBeTruthy();
  const client = await created.json();
  await page.goto(`/?module=clients&client=${client.id}`);
  await page
    .getByRole("button", { name: "Prepare proposal", exact: true })
    .click();
  let panel = page.getByRole("dialog");
  await panel.getByLabel("Proposal title").fill("Website discovery");
  await panel
    .getByLabel("Scope, deliverables, and proposed terms")
    .fill(
      "Document the requirements. This is a test draft, not an accepted offer.",
    );
  await panel.getByRole("button", { name: "Save draft proposal" }).click();
  await expect(panel).toBeHidden();
  await expect(
    page.getByRole("button", { name: /Draft proposal.*Website discovery/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start project" }).click();
  panel = page.getByRole("dialog");
  await panel.getByLabel("Project name").fill("Fictional delivery project");
  await panel.getByLabel("Project owner").fill("Example Owner");
  await panel.getByLabel("Due date").fill("2026-12-01");
  await page.route("**/api/projects", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Temporary test failure. Retry your save.",
      }),
    }),
  );
  await panel.getByRole("button", { name: "Save record" }).click();
  await expect(
    panel.getByText("Temporary test failure. Retry your save."),
  ).toBeVisible();
  await expect(panel.getByLabel("Project name")).toHaveValue(
    "Fictional delivery project",
  );
  await page.unroute("**/api/projects");
  await panel.getByRole("button", { name: "Save record" }).click();
  await expect(panel).toBeHidden();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Projects", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fictional delivery project", exact: true })
    .click();
  panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "Add task" }).click();
  await panel.getByLabel("Task title").fill("Confirm deliverables");
  await panel.getByLabel("Task due date").fill("2026-11-10");
  await panel.getByRole("button", { name: "Save task" }).click();
  await panel.getByRole("checkbox", { name: /Confirm deliverables/ }).check();
  await expect(
    panel.getByRole("heading", { name: "Tasks · 1 of 1 complete" }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Edit project / status" }).click();
  await page
    .getByRole("dialog")
    .last()
    .getByLabel("Status", { exact: true })
    .selectOption("COMPLETED");
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Save changes" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close details" })
    .click();
  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: "Fictional delivery project" }),
  ).toContainText("completed");
  const workflow = await (await page.request.get("/api/workspace")).json();
  expect(
    workflow.projects.find(
      (p: { name: string }) => p.name === "Fictional delivery project",
    ).tasks[0].completed,
  ).toBe(true);
  await page.goto("/?module=automations");
  await page.getByRole("button", { name: "Configure billing rule" }).click();
  panel = page.getByRole("dialog");
  await panel.getByLabel("Client", { exact: true }).selectOption(client.id);
  await panel.getByLabel("Contract name").fill("Fictional paused rule");
  await panel.getByLabel("Recurring price (USD)").fill("30");
  await expect(
    panel.getByLabel("Contract status", { exact: true }),
  ).toHaveValue("PAUSED");
  await panel.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Fictional paused rule" }),
  ).toContainText("paused");
  await page.getByRole("button", { name: "Preview due billing" }).click();
  await expect(
    page.getByText("Preview only · no records created"),
  ).toBeVisible();
  const ruleRow = page
    .getByRole("row")
    .filter({ hasText: "Fictional paused rule" });
  await ruleRow.getByRole("button", { name: "Configure", exact: true }).click();
  panel = page.getByRole("dialog");
  await panel
    .getByLabel("Contract status", { exact: true })
    .selectOption("ACTIVE");
  await panel.getByLabel("Next invoice date").fill("2027-01-01");
  await panel.getByRole("button", { name: "Save changes" }).click();
  await ruleRow.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(ruleRow).toContainText("paused");
  await expect(
    page.getByRole("heading", { name: "Run history" }),
  ).toBeVisible();
  const stored = await (
    await page.request.get(`/api/clients/${client.id}`)
  ).json();
  expect(stored.proposals[0].status).toBe("DRAFT");
  expect(stored.projects[0].status).toBe("COMPLETED");
});
test("all workspace routes, financial drilldowns, navigation history and responsive screenshots", async ({
  page,
}) => {
  await login(page);
  const errors: string[] = [];
  const failed: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().includes("/api/"))
      failed.push(`${r.status()} ${r.url()}`);
  });
  const modules = [
    "overview",
    "prospecting",
    "pipeline",
    "clients",
    "projects",
    "money",
    "automations",
    "settings",
    "invoices",
    "payments",
    "expenses",
    "reconciliation",
    "reports",
    "taxes",
    "retainers",
  ];
  for (const module of modules) {
    await page.goto(`/?module=${module}`);
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(page.locator(".global-error")).toHaveCount(0);
    await expect(
      page.locator("main .card, main .overview-metrics").first(),
    ).toBeVisible();
  }
  await page.goto("/?module=overview");
  await page.getByRole("button", { name: /Outstanding invoices/ }).click();
  await expect(page.getByLabel("Filter status")).toHaveValue("OUTSTANDING");
  await page.goBack();
  await expect(page.getByRole("heading", { name: /Good/ })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("Filter status")).toHaveValue("OUTSTANDING");
  await page.reload();
  await expect(page.getByLabel("Filter status")).toHaveValue("OUTSTANDING");
  await page
    .getByRole("button", {
      name: /Collected payments.*Received in reporting period/,
    })
    .click();
  await expect(page.getByLabel("Payment date range")).toHaveValue("PERIOD");
  const state = await (await page.request.get("/api/state")).json();
  const period = state.payments.filter(
    (p: { receivedAt: string }) =>
      p.receivedAt.slice(0, 10) >= state.from.slice(0, 10) &&
      p.receivedAt.slice(0, 10) <= state.to.slice(0, 10),
  );
  const gross = period.reduce(
    (n: number, p: { amount: string }) => n + Number(p.amount),
    0,
  );
  await expect(
    page.locator(".overview-metric").filter({ hasText: "Collected payments" }),
  ).toContainText(
    gross.toLocaleString("en-US", { style: "currency", currency: "USD" }),
  );
  await page
    .getByRole("navigation", { name: "Money sections" })
    .getByRole("button", { name: "Reconciliation", exact: true })
    .click();
  const reconcile = page
    .getByRole("button", { name: "Mark reconciled", exact: true })
    .first();
  if (await reconcile.count()) {
    await reconcile.click();
    await page.getByLabel("Reconciliation filter").selectOption("ALL");
    await expect(
      page.getByRole("button", { name: "Reconciled · undo" }).first(),
    ).toBeVisible();
  }
  for (const width of [1448, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const module of [
      "overview",
      "prospecting",
      "pipeline",
      "projects",
      "money",
      "automations",
      "settings",
    ]) {
      await page.goto(`/?module=${module}`);
      await expect(
        page.locator("main .card, main .overview-metrics").first(),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (["overview", "prospecting", "money"].includes(module))
        await page.screenshot({
          path: `.data/workspace-${module}-${width}.png`,
          fullPage: true,
        });
    }
  }
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});
test("settings categories, safe staff controls, notifications and all financial report exports", async ({
  page,
}) => {
  await login(page);
  await page.goto("/?module=settings");
  await page.getByLabel("Business phone").count();
  for (const tab of [
    "Organization",
    "Staff & access",
    "Account security",
    "Financial",
    "Integrations",
    "System & audit",
  ]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(
      page.getByRole("tab", { name: tab, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  }
  await page.getByRole("tab", { name: "Staff & access", exact: true }).click();
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("Fictional Audit Staff");
  await dialog
    .getByLabel("Email", { exact: true })
    .fill(`audit-${randomUUID()}@example.invalid`);
  await dialog
    .getByLabel("Temporary password (14+ characters)")
    .fill(randomUUID() + randomUUID());
  await dialog.getByRole("button", { name: "Save record" }).click();
  const staff = page
    .getByRole("row")
    .filter({ hasText: "Fictional Audit Staff" });
  await staff
    .getByLabel("Role for Fictional Audit Staff")
    .selectOption("ACCOUNTANT");
  await staff.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(
    staff.getByRole("button", { name: "Enable", exact: true }),
  ).toBeVisible();
  await staff.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(
    staff.getByRole("button", { name: "Disable", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Organization", exact: true }).click();
  await page.getByLabel("Business phone").count();
  await page.getByLabel("Phone", { exact: true }).fill("555-0100");
  await page.getByRole("button", { name: "Save organization" }).click();
  await page.reload();
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue(
    "555-0100",
  );
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/?module=reports");
  for (const report of [
    "profit-loss",
    "balance-sheet",
    "cash-flow",
    "ledger",
    "trial-balance",
    "aging",
    "clients",
    "services",
    "expenses",
    "retainers",
    "owners",
  ]) {
    await page.getByLabel("Report type").selectOption(report);
    for (const format of ["CSV", "PDF"]) {
      const link = page.getByRole("link", {
        name: `Export ${format}`,
        exact: true,
      });
      const href = await link.getAttribute("href");
      const response = await page.request.get(href!);
      expect(response.ok()).toBeTruthy();
      expect((await response.body()).length).toBeGreaterThan(10);
      expect(response.headers()["content-type"]).toContain(
        format === "PDF" ? "application/pdf" : "text/csv",
      );
    }
  }
  await page
    .getByRole("button", { name: /Accounting revenue.*Accrual basis/ })
    .click();
  await expect(page.getByLabel("Report type")).toHaveValue("profit-loss");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toContain(".csv");
  await page.getByRole("button", { name: "Quick create", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Quick create" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Record expense", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Vendor", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});
test("partially paid overdue invoices reconcile to the summary and duplicate clicks are guarded", async ({
  page,
}) => {
  await login(page);
  const client = await (
    await page.request.post("/api/clients", {
      headers,
      data: { name: "Fictional overdue client" },
    })
  ).json();
  const draftResponse = await page.request.post("/api/invoices", {
    headers,
    data: {
      clientId: client.id,
      description: "Overdue regression invoice",
      issueDate: "2026-01-01",
      dueDate: "2026-01-02",
      lines: [
        {
          description: "Fictional service",
          quantity: "1",
          unitPrice: "100",
          discountPercent: "0",
          taxPercent: "0",
        },
      ],
    },
  });
  expect(draftResponse.ok()).toBeTruthy();
  const invoice = await draftResponse.json();
  expect(
    (
      await page.request.post(`/api/invoices/${invoice.id}/issue`, {
        headers,
        data: {},
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await page.request.post("/api/payments", {
        headers,
        data: {
          clientId: client.id,
          amount: "40",
          receivedAt: "2026-01-02",
          method: "ACH",
          idempotencyKey: randomUUID(),
          allocations: [{ invoiceId: invoice.id, amount: "40" }],
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/?module=money&tab=invoices");
  await page
    .getByRole("button", {
      name: /Overdue invoices.*Current past-due balances/,
    })
    .click();
  const row = page
    .getByRole("row")
    .filter({ hasText: "Overdue regression invoice" });
  await expect(row).toContainText("partially paid");
  await expect(row).toContainText("overdue");
  await expect(
    row.getByRole("cell", { name: "$60.00", exact: true }),
  ).toBeVisible();
  const state = await (await page.request.get("/api/state")).json();
  const balance = state.invoices
    .filter(
      (i: { status: string; balance: string; dueDate: string }) =>
        i.status === "ISSUED" &&
        Number(i.balance) > 0 &&
        i.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10),
    )
    .reduce((n: number, i: { balance: string }) => n + Number(i.balance), 0);
  expect(Number(state.overdue)).toBe(balance);
  await row.getByRole("button").click();
  const before = state.invoices.length;
  await page.route(`**/api/invoices/${invoice.id}/duplicate`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Duplicate", exact: true })
    .dblclick();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/state")).json()).invoices.length,
    )
    .toBe(before + 1);
  await expect(page.getByRole("status")).toContainText("Changes saved");
  expect(
    (await (await page.request.get("/api/state")).json()).invoices.length,
  ).toBe(before + 1);
});
