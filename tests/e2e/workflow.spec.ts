import { test, expect } from "@playwright/test";
import { readFileSync, existsSync, chmodSync } from "node:fs";
import { createHmac } from "node:crypto";
const credentials = () =>
  JSON.parse(readFileSync(".data/e2e-credentials.json", "utf8")) as {
    email: string;
    password: string;
    accountantEmail: string;
    mfaEmail: string;
  };
async function login(page: import("@playwright/test").Page, email?: string) {
  const c = credentials();
  if (!email && existsSync(".data/e2e-owner-session.json")) {
    const stored = JSON.parse(
      readFileSync(".data/e2e-owner-session.json", "utf8"),
    );
    await page.context().addCookies(stored.cookies);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Good/ })).toBeVisible();
    return;
  }
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email || c.email);
  await page.getByLabel("Password", { exact: true }).fill(c.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  if (!email) {
    await page.context().storageState({ path: ".data/e2e-owner-session.json" });
    chmodSync(".data/e2e-owner-session.json", 0o600);
  }
}
test("complete client, invoice, payment, expense and recurring billing workflow", async ({
  page,
}) => {
  await login(page);
  await expect(page.getByText("Your next invoice starts here")).toBeVisible();
  await page.screenshot({ path: ".data/dashboard-empty.png", fullPage: true });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Clients", exact: true })
    .click();
  await page.getByRole("button", { name: "Add client", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Company name").fill("Example E2E Company");
  await dialog.getByLabel("Email address").fill("billing@example.invalid");
  await dialog.getByLabel("Primary contact").fill("Example Contact");
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "EX Example E2E Company" }).click();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Note title").fill("Discovery meeting");
  await dialog
    .getByLabel("Note content")
    .fill("Review website goals and security requirements.");
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByText("Discovery meeting")).toBeVisible();
  await page.getByRole("tab", { name: "Invoices", exact: true }).click();
  await page
    .getByRole("button", { name: "Create invoice", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("Example website project");
  await dialog.getByLabel("Line 1 description").fill("Website design");
  await dialog.getByLabel("Line 1 unitPrice").fill("100.00");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("button", { name: "Draft invoice", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Issue invoice", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Issue this invoice?" })
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: /INV-/ }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/INV-.*\.pdf/);
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Record payment" });
  await dialog.getByLabel("Amount received (USD)").fill("40");
  await dialog.getByLabel("Allocation amount 1").fill("40");
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("dialog").getByText("partially paid", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Record payment" });
  await expect(dialog.getByLabel("Amount received (USD)")).toHaveValue("60.00");
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("dialog").getByText("paid", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Reports", exact: true })
    .click();
  await expect(page.getByText("$100.00").first()).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Expenses", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record expense", exact: true })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Vendor", { exact: true })
    .fill("Example Hosting Vendor");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("Hosting subscription");
  await dialog.getByLabel("Amount (USD)", { exact: true }).fill("20");
  await dialog.getByLabel("Category", { exact: true }).selectOption("Hosting");
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByText("Example Hosting Vendor")).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Retainers", exact: true })
    .click();
  await page.getByRole("button", { name: "Add retainer", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Client", { exact: true })
    .selectOption({ label: "Example E2E Company" });
  await dialog.getByLabel("Contract name").fill("Example maintenance");
  await dialog.getByLabel("Recurring price (USD)").fill("50");
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByText("Example maintenance")).toBeVisible();
  await page.getByRole("button", { name: "Run billing" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm" })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /Invoices/ })
    .click();
  await expect(page.getByText("Example maintenance")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Example maintenance")).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Reports", exact: true })
    .click();
  await expect(page.getByText("$80.00").first()).toBeVisible();
  for (const module of ["Payments", "Taxes", "Settings"]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: module, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: module, exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Dashboard", exact: true })
    .click();
  await page.screenshot({
    path: ".data/dashboard-populated.png",
    fullPage: true,
  });
  await page.getByLabel("Search workspace").fill("Discovery");
  await expect(
    page.getByRole("button", { name: "Discovery meeting Note" }),
  ).toBeVisible();
});
test("read-only role and origin protections are enforced by the server", async ({
  page,
}) => {
  await login(page, credentials().accountantEmail);
  const denied = await page.request.post("/api/clients", {
    headers: { origin: "http://localhost:43817" },
    data: { name: "Unauthorized" },
  });
  expect(denied.status()).toBe(403);
  const csrf = await page.request.post("/api/clients", {
    headers: { origin: "https://attacker.invalid" },
    data: { name: "Cross site" },
  });
  expect(csrf.status()).toBe(403);
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin: "http://localhost:43817" },
    data: {
      name: "Uninvited",
      email: "uninvited@example.invalid",
      password: credentials().password,
    },
  });
  expect(signup.ok()).toBe(false);
});
test("mobile navigation, keyboard search and form validation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Clients", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Clients", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add client", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save record" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.keyboard.press("Control+k");
  await expect(page.getByLabel("Search workspace")).toBeFocused();
  await page.screenshot({ path: ".data/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, ""))
    bits += alphabet.indexOf(c.toUpperCase()).toString(2).padStart(5, "0");
  const key = Buffer.from(
    (bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
test("TOTP enrollment, challenge and recovery code lifecycle", async ({
  page,
}) => {
  await login(page, credentials().mfaEmail);
  const headers = { origin: "http://localhost:43817" };
  const enrollment = await page.request.post("/api/auth/two-factor/enable", {
    headers,
    data: { password: credentials().password },
  });
  expect(enrollment.ok()).toBe(true);
  const data = await enrollment.json();
  const secret = new URL(data.totpURI).searchParams.get("secret")!;
  expect(data.backupCodes.length).toBeGreaterThan(0);
  const verify = await page.request.post("/api/auth/two-factor/verify-totp", {
    headers,
    data: { code: totp(secret) },
  });
  expect(verify.ok()).toBe(true);
  await page.request.post("/api/auth/sign-out", { headers, data: {} });
  await page.goto("/login");
  await page.getByLabel("Email address").fill(credentials().mfaEmail);
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials().password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Verify your identity" }),
  ).toBeVisible();
  expect((await page.request.get("/api/state")).status()).toBe(401);
  await page.getByRole("button", { name: "Use a recovery code" }).click();
  await page.getByLabel("Recovery code").fill(data.backupCodes[0]);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByRole("heading", { name: /Good/ })).toBeVisible();
});
test("failed data requests show a recoverable error without fabricated metrics", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/state?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Database temporarily unavailable" }),
    }),
  );
  await page.reload();
  await expect(page.locator(".global-error")).toContainText(
    "Database temporarily unavailable",
  );
  await page.unroute("**/api/state?**");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".global-error")).toBeHidden();
  await expect(page.getByText("Period revenue", { exact: true })).toBeVisible();
});
test("authentication is rate limited", async ({ request }) => {
  let status = 0;
  for (let i = 0; i < 7; i++) {
    const response = await request.post("/api/auth/sign-in/email", {
      headers: { origin: "http://localhost:43817" },
      data: {
        email: "invalid@example.invalid",
        password: "Incorrect-long-password",
      },
    });
    status = response.status();
    if (status === 429) break;
  }
  expect(status).toBe(429);
});
