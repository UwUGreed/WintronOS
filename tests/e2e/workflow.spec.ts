import { PDFDocument } from "pdf-lib";
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
  await page.goto("/?module=reports");
  await expect(page.getByText("$100.00").first()).toBeVisible();
  await page.goto("/?module=expenses");
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
  await page.goto("/?module=retainers");
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
  await page.goto("/?module=invoices");
  await expect(page.getByText("Example maintenance")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Example maintenance")).toBeVisible();
  await page.goto("/?module=reports");
  await expect(page.getByText("$80.00").first()).toBeVisible();
  for (const module of ["Payments", "Taxes", "Settings"]) {
    await page.goto("/?module=" + module.toLowerCase());
    await expect(
      page.getByRole("heading", {
        name: module === "Settings" ? "Settings" : "Money",
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.goto("/?module=dashboard");
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
  expect((await page.request.get("/api/integrations/leads")).status()).toBe(
    200,
  );
  expect(
    (
      await page.request.post("/api/integrations/leads/search", {
        headers: { origin: "http://localhost:43817" },
        data: { query: "dentists" },
      })
    ).status(),
  ).toBe(403);
  expect((await page.request.get("/api/integrations/smtp")).status()).toBe(403);
  expect(
    (
      await page.request.post("/api/integrations/smtp/check", {
        headers: { origin: "http://localhost:43817" },
        data: {},
      })
    ).status(),
  ).toBe(403);
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
  await expect(
    page.getByText("Outstanding invoices", { exact: true }),
  ).toBeVisible();
});
test("receipt previews, client PDFs and auditable expense review", async ({
  page,
  browser,
}) => {
  await login(page);
  const headers = { origin: "http://localhost:43817" };
  const state = await (await page.request.get("/api/state")).json();
  let client = state.clients[0];
  if (!client) {
    const response = await page.request.post("/api/clients", {
      headers,
      data: { name: "Example E2E Company", email: "billing@example.invalid" },
    });
    expect(response.ok()).toBeTruthy();
    client = await response.json();
  }
  const created = await page.request.post("/api/expenses", {
    headers,
    data: {
      vendor: "Receipt Preview Vendor",
      description: "Review workflow",
      amount: "12",
      date: new Date().toISOString().slice(0, 10),
      category: "Hosting",
      accountCode: "5100",
      method: "ACH",
      clientId: client.id,
    },
  });
  expect(created.ok()).toBeTruthy();
  const expense = await created.json();
  const upload = await page.request.post("/api/documents", {
    headers,
    multipart: {
      expenseId: expense.id,
      file: {
        name: "receipt.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0mUAAAAASUVORK5CYII=",
          "base64",
        ),
      },
    },
  });
  expect(upload.ok()).toBeTruthy();
  const receipt = await upload.json();
  await page.goto("/?module=expenses");
  await page.reload();
  const row = page
    .getByRole("row")
    .filter({ hasText: "Receipt Preview Vendor" });
  await row.getByRole("button", { name: "View receipt" }).click();
  let dialog = page.getByRole("dialog");
  const receiptImage = dialog.getByRole("img", { name: "receipt.png" });
  await expect(receiptImage).toBeVisible();
  await expect
    .poll(() =>
      receiptImage.evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(dialog.getByText("125%")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Download", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("receipt.png");
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: "Review", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Mark reviewed" }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Review notes", { exact: true })
    .fill("Verified receipt, amount and business purpose.");
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(
    dialog.getByText("Verified receipt, amount and business purpose.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Reopen review" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(row.getByText("reviewed", { exact: true })).toBeVisible();
  await page.reload();
  await expect(row.getByText("reviewed", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Review details" }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Reason to reopen review")
    .fill("Need an itemized receipt for follow-up.");
  await dialog.getByRole("button", { name: "Reopen review" }).click();
  await expect(
    dialog.getByText("Need an itemized receipt for follow-up.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Verified receipt, amount and business purpose.", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(row.getByText("review required", { exact: true })).toBeVisible();

  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Fictional receipt preview", { x: 48, y: 740 });
  pdf.addPage().drawText("Second receipt page", { x: 48, y: 740 });
  const pdfUpload = await page.request.post("/api/documents", {
    headers,
    multipart: {
      clientId: client.id,
      file: {
        name: "preview.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(await pdf.save()),
      },
    },
  });
  expect(pdfUpload.ok()).toBeTruthy();
  const doc = await pdfUpload.json();
  const inline = await page.request.get(`/api/documents/${doc.id}/preview`);
  expect(inline.headers()["content-disposition"]).toMatch(/^inline/);
  expect(inline.headers()["cache-control"]).toBe("no-store");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Clients", exact: true })
    .click();
  await page.getByRole("button", { name: "EX Example E2E Company" }).click();
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "preview.pdf" })
    .getByRole("button", { name: "View document" })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await expect(dialog.getByText("Page 1 of 2")).toBeVisible();
  await expect(
    dialog.getByText("Fictional receipt preview", { exact: true }),
  ).toBeAttached();
  await dialog.getByRole("button", { name: "Next page" }).click();
  await expect(dialog.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await expect(dialog.getByText("Page 2 of 2")).toBeVisible();
  await expect(
    dialog.getByText("Second receipt page", { exact: true }),
  ).toBeAttached();
  // Confirm the PDF actually paints visible content, not just a completed load.
  await expect
    .poll(() =>
      dialog.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, Math.floor(canvas.height / 2)).data;
        let darkPixels = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] < 200 && pixels[i + 3] > 0) darkPixels++;
        return darkPixels;
      }),
    )
    .toBeGreaterThan(100);
  await page.screenshot({ path: ".data/document-preview.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      dialog
        .locator("canvas")
        .evaluate((canvas: HTMLCanvasElement) => canvas.width),
    )
    .toBeLessThan(390);
  await expect(dialog.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".data/document-preview-mobile.png" });
  await page.setViewportSize({ width: 1448, height: 1086 });
  await page.keyboard.press("Escape");

  const anonymous = await browser.newContext();
  expect(
    (
      await anonymous.request.get(
        `http://localhost:43817/api/documents/${receipt.id}/preview`,
      )
    ).status(),
  ).toBe(401);
  await anonymous.close();
  const accountantPage = await page.context().browser()!.newPage();
  await login(accountantPage, credentials().accountantEmail);
  expect(
    (
      await accountantPage.request.get(`/api/documents/${doc.id}/preview`)
    ).status(),
  ).toBe(200);
  const denied = await accountantPage.request.post(
    `/api/expenses/${expense.id}/review`,
    { headers, data: { reviewRequired: false, notes: "Not authorized" } },
  );
  expect(denied.status()).toBe(403);
  await accountantPage.context().close();
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
