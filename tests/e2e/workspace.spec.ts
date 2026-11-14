import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
async function login(page: Page) {
  if (existsSync(".data/e2e-owner-session.json")) {
    const stored = JSON.parse(
      readFileSync(".data/e2e-owner-session.json", "utf8"),
    );
    await page.context().addCookies(stored.cookies);
    await page.goto("/");
  } else {
    const credentials = JSON.parse(
      readFileSync(".data/e2e-credentials.json", "utf8"),
    );
    await page.goto("/login");
    await page.getByLabel("Email address").fill(credentials.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(credentials.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
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
    page.getByRole("heading", { name: "Discover businesses", exact: true }),
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

test("integration status shows setup needs, development labels, and protected diagnostics", async ({
  page,
  browser,
}) => {
  const anonymous = await browser.newContext({
    baseURL: "http://localhost:43817",
  });
  expect((await anonymous.request.get("/api/integrations/smtp")).status()).toBe(
    401,
  );
  expect(
    (await anonymous.request.get("/api/integrations/leads")).status(),
  ).toBe(401);
  await anonymous.close();
  await login(page);
  await page.goto("/?module=prospecting");
  await expect(
    page.getByText("Under development", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View integration setup" }).click();
  await expect(
    page.getByRole("tab", { name: "Integrations", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const smtp = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Invoice email", exact: true }),
  });
  await expect(smtp.getByText("Setup required", { exact: true })).toBeVisible();
  await expect(
    smtp.getByRole("button", { name: "Check connection", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".integration-under_development")).toHaveCount(6);
  await expect(
    page.getByText("Adding credentials will not enable them.", {
      exact: false,
    }),
  ).toBeVisible();
  const status = await (
    await page.request.get("/api/integrations/smtp")
  ).json();
  expect(status.state).toBe("SETUP_REQUIRED");
  expect(status).not.toHaveProperty("pass");
  expect(status).not.toHaveProperty("configHash");
  expect(
    (
      await page.request.post("/api/integrations/smtp/check", {
        headers,
        data: {},
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post("/api/integrations/smtp/check", {
        headers: { origin: "https://untrusted.invalid" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  for (const width of [1448, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.data/integrations-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});

test("SMTP diagnostics UI handles provider failures and retry without claiming delivery", async ({
  page,
}) => {
  await login(page);
  let current = {
    state: "VERIFICATION_REQUIRED",
    configured: true,
    issues: [],
    checkedAt: null as string | null,
    detail:
      "Configuration is present. Check the connection before sending an invoice.",
    lastAcceptedAt: null,
  };
  let attempts = 0;
  await page.route("**/api/integrations/smtp", (route) =>
    route.fulfill({ json: current }),
  );
  await page.route("**/api/integrations/smtp/check", async (route) => {
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 250));
    current = {
      ...current,
      state: attempts === 1 ? "ERROR" : "CONNECTION_VERIFIED",
      checkedAt: new Date().toISOString(),
      detail:
        attempts === 1
          ? "Connection check failed. Review the SMTP host, port, TLS settings, and credentials, then retry."
          : "SMTP connection, TLS, and configured authentication verified. No email sent; recipient delivery is not verified.",
    };
    await route.fulfill({ json: current });
  });
  await page.goto("/?module=settings&section=integrations");
  await expect(
    page.getByText("Needs verification", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .dblclick();
  await expect(
    page.getByText("Connection failed", { exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(1);
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expect(
    page.getByText("Connection verified", { exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(2);
  await expect(
    page.getByText("No successful send recorded", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Connection verified", { exact: true }),
  ).toBeVisible();
});

test("lead discovery previews sources, handles failures, and saves only reviewed prospects", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/workspace", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.integrations.leadProvider = true;
    await route.fulfill({ response, json });
  });
  const suffix = randomUUID();
  const sourceUrl = `https://discovery-${suffix}.example.invalid/about`;
  let calls = 0;
  await page.route("**/api/integrations/leads/search", async (route) => {
    calls++;
    const input = route.request().postDataJSON();
    expect(input.query).toBe("independent dentists");
    expect(input.location).toBe("Charleston");
    if (calls === 1) {
      await route.fulfill({
        status: 502,
        json: { error: "Brave Search is unavailable. Try again later." },
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      json: {
        query: "independent dentists Charleston",
        page: input.page,
        more: input.page === 0,
        searchedAt: new Date().toISOString(),
        remainingToday: 100 - calls,
        results:
          input.page === 0
            ? [
                {
                  title: "Fictional search result title",
                  url: sourceUrl,
                  description:
                    "Unverified provider excerpt about dental services.",
                  existingProspectId: null,
                },
              ]
            : [],
      },
    });
  });
  await page.goto("/?module=prospecting");
  await page
    .getByLabel("Search terms", { exact: true })
    .fill("independent dentists");
  await page.getByLabel("Search location", { exact: true }).fill("Charleston");
  await page
    .getByRole("button", { name: "Search businesses", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Brave Search is unavailable",
  );
  await expect(page.getByLabel("Search terms", { exact: true })).toHaveValue(
    "independent dentists",
  );
  await page
    .getByRole("button", { name: "Search businesses", exact: true })
    .dblclick();
  await expect(
    page.getByRole("heading", { name: "Fictional search result title" }),
  ).toBeVisible();
  expect(calls).toBe(2);
  await expect(
    page.getByText("Search excerpt · not verified business facts", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: ".data/lead-discovery-results.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Review & save prospect", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Review discovered business",
    exact: true,
  });
  await expect(dialog.getByLabel("Source URL", { exact: true })).toHaveValue(
    sourceUrl,
  );
  await expect(dialog.getByLabel("Website", { exact: true })).toHaveValue("");
  await expect(dialog.getByLabel("Sourced facts", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    dialog.getByLabel("Qualification reasoning", { exact: true }),
  ).toHaveValue("");
  await expect(dialog.getByLabel("Email", { exact: true })).toHaveValue("");
  await expect(
    dialog.getByLabel("Source checked on", { exact: true }),
  ).toHaveValue("");
  const name = "Fictional reviewed business " + suffix;
  await dialog.getByLabel("Business name", { exact: true }).fill(name);
  await dialog.getByLabel("Website", { exact: true }).fill(sourceUrl);
  await dialog
    .getByLabel("Sourced facts", { exact: true })
    .fill("Fictional observed fact recorded by the reviewer.");
  await dialog
    .getByLabel("Source checked on", { exact: true })
    .fill("2026-11-12");
  await dialog
    .getByRole("button", { name: "Save prospect", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("button", { name: "Open saved prospect", exact: true })
    .click();
  const details = page.getByRole("dialog", { name, exact: true });
  await expect(
    details.getByText("Fictional observed fact recorded by the reviewer.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    details.getByRole("button", { name: "Add to pipeline", exact: true }),
  ).toBeDisabled();
  await details
    .getByRole("button", { name: "Close details", exact: true })
    .click();
  await page.getByRole("button", { name: "Next results", exact: true }).click();
  await expect(
    page.getByText("No matching sources", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next results", exact: true }),
  ).toBeDisabled();
  const workspace = await (await page.request.get("/api/workspace")).json();
  const saved = workspace.prospects.filter(
    (p: { name: string }) => p.name === name,
  );
  expect(saved).toHaveLength(1);
  expect(saved[0].evidence).toBe(
    "Fictional observed fact recorded by the reviewer.",
  );
  expect(saved[0].status).toBe("SAVED");
  expect(saved[0].qualification).toBe("");
  expect(saved[0].email).toBe("");
});
