import { beforeAll, describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { db } from "../lib/db";
import { provisionOrganization, provisionUser } from "../lib/bootstrap";
import {
  saveClient,
  saveNote,
  recordExpense,
  reviewExpense,
  reverseExpense,
  saveRetainer,
  runRecurring,
  recordOwnerTransaction,
} from "../lib/services/operations";
import {
  saveInvoice,
  issueInvoice,
  voidInvoice,
  decorateInvoice,
  invoiceInclude,
} from "../lib/services/invoices";
import {
  recordPayment,
  refundPayment,
  allocatePayment,
} from "../lib/services/payments";
import { invoicePdf, upload, download } from "../lib/services/documents";
import { reports, csv } from "../lib/services/reports";
import { transaction, journal } from "../lib/services/ledger";
import { actor, checkOrigin, type Actor } from "../lib/security";
import { auth } from "../lib/auth";
import { D, sum } from "../lib/money";
let owner: Actor;
let staff: Actor;
let accountant: Actor;
let outsider: Actor;
let clientId: string;
let invoiceId: string;
let paymentId: string;
let password: string;
let email: string;
const day = "2026-01-15";
const baseInvoice = () => ({
  clientId,
  issueDate: day,
  dueDate: "2026-02-15",
  description: "Integration service",
  lines: [
    {
      description: "Consulting",
      quantity: "2",
      unitPrice: "50",
      discountPercent: "0",
      taxPercent: "0",
    },
  ],
});
beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("/wintron_test"))
    throw new Error(
      "Integration tests require isolated wintron_test database.",
    );
  const org = await provisionOrganization("Integration Test " + randomUUID());
  password = randomUUID() + randomUUID();
  email = `test-${randomUUID()}@example.invalid`;
  const user = await provisionUser(org.id, "Test Owner", email, password);
  owner = {
    userId: user.id,
    organizationId: org.id,
    role: "OWNER",
    name: user.name,
  };
  staff = { ...owner, role: "STAFF" };
  accountant = { ...owner, role: "ACCOUNTANT" };
  const other = await provisionOrganization("Other integration organization");
  outsider = { ...owner, organizationId: other.id };
});
afterAll(() => db.$disconnect());
describe.sequential("persistent business workflow", () => {
  it("authenticates a provisioned account and rejects public signup", async () => {
    const result = await auth.api.signInEmail({ body: { email, password } });
    expect(result.user.id).toBe(owner.userId);
    await expect(
      auth.api.signInEmail({ body: { email, password: "WrongPassword123" } }),
    ).rejects.toThrow();
    await expect(
      auth.api.signUpEmail({
        body: {
          email: `public-${randomUUID()}@example.invalid`,
          name: "Public",
          password,
        },
      }),
    ).rejects.toThrow();
    await expect(actor(new Headers())).rejects.toThrow("sign in");
  });
  it("enforces origin and role controls", async () => {
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3000/api/clients", {
          method: "POST",
          headers: { origin: "https://attacker.invalid" },
        }),
      ),
    ).toThrow();
    await expect(saveClient(accountant, { name: "Denied" })).rejects.toThrow(
      "permission",
    );
  });
  it("creates and edits client, preserves history, sanitizes notes", async () => {
    const c = await saveClient(owner, {
      name: "Example Test Client",
      email: "billing@example.invalid",
    });
    clientId = c.id;
    await saveClient(
      staff,
      { name: "Example Test Client Updated", email: "billing@example.invalid" },
      clientId,
    );
    const note = await saveNote(owner, {
      clientId,
      title: "Discovery",
      content:
        "<p>Initial <strong>notes</strong><script>alert(1)</script><img src=x onerror=alert(1)></p>",
    });
    expect(note.content).not.toContain("script");
    expect(note.content).not.toContain("onerror");
    await saveNote(
      owner,
      { clientId, title: "Revised discovery", content: "<p>Revised notes</p>" },
      note.id,
    );
    expect(await db.noteRevision.count({ where: { noteId: note.id } })).toBe(1);
    await expect(
      saveNote(outsider, {
        clientId,
        title: "Cross tenant",
        content: "Not allowed",
      }),
    ).rejects.toThrow("not found");
  });
  it("creates, edits and concurrently finalizes a single durable invoice", async () => {
    const i = await saveInvoice(owner, baseInvoice());
    invoiceId = i.id;
    await saveInvoice(
      owner,
      { ...baseInvoice(), description: "Updated draft" },
      i.id,
    );
    const [first, second] = await Promise.all([
      issueInvoice(owner, i.id),
      issueInvoice(owner, i.id),
    ]);
    expect(first.number).toBe(second.number);
    expect(first.total.toFixed(2)).toBe("100.00");
    expect(
      await db.journalEntry.count({
        where: { sourceType: "INVOICE", sourceId: i.id },
      }),
    ).toBe(1);
    await expect(saveInvoice(owner, baseInvoice(), i.id)).rejects.toThrow(
      "immutable",
    );
    await expect(
      db.invoice.update({ where: { id: i.id }, data: { total: "101" } }),
    ).rejects.toThrow();
    await expect(
      db.invoiceLine.update({
        where: { id: first.lines[0].id },
        data: { description: "Mutated" },
      }),
    ).rejects.toThrow();
  });
  it("preserves issuer and client identity in generated PDF", async () => {
    await saveClient(owner, { name: "Renamed Client" }, clientId);
    const pdf = await invoicePdf(owner, invoiceId);
    expect(pdf.bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBeGreaterThan(
      0,
    );
    const i = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(JSON.stringify(i.snapshot)).toContain("Example Test Client Updated");
    await expect(invoicePdf(outsider, invoiceId)).rejects.toThrow("not found");
  });
  it("records partial and final payments without double-counting", async () => {
    const key = randomUUID();
    const payload = {
      clientId,
      amount: "30",
      receivedAt: day,
      method: "ACH",
      idempotencyKey: key,
      allocations: [{ invoiceId, amount: "30" }],
    };
    const p = await recordPayment(owner, payload);
    paymentId = p.id;
    expect((await recordPayment(owner, payload)).id).toBe(p.id);
    await expect(
      recordPayment(owner, { ...payload, amount: "31" }),
    ).rejects.toThrow("Idempotency");
    let i = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: invoiceInclude,
    });
    expect(decorateInvoice(i).displayStatus).toBe("PARTIALLY_PAID");
    expect(decorateInvoice(i).balance).toBe("70.00");
    await expect(
      recordPayment(owner, {
        ...payload,
        idempotencyKey: randomUUID(),
        amount: "80",
        allocations: [{ invoiceId, amount: "80" }],
      }),
    ).rejects.toThrow("exceeds");
    await recordPayment(owner, {
      ...payload,
      idempotencyKey: randomUUID(),
      amount: "70",
      allocations: [{ invoiceId, amount: "70" }],
    });
    i = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: invoiceInclude,
    });
    expect(decorateInvoice(i).displayStatus).toBe("PAID");
  });
  it("matches reports to ledger and excludes owner capital from operating profit", async () => {
    await recordExpense(owner, {
      vendor: "Example Vendor",
      description: "Hosting cost",
      date: day,
      amount: "20",
      category: "Hosting",
      accountCode: "5100",
      method: "ACH",
    });
    const o = await db.owner.create({
      data: {
        organizationId: owner.organizationId,
        name: "Example founder",
        percentage: "100",
      },
    });
    await recordOwnerTransaction(owner, {
      ownerId: o.id,
      kind: "CONTRIBUTION",
      amount: "1000",
      date: day,
      notes: "Initial capital",
    });
    await recordOwnerTransaction(owner, {
      ownerId: o.id,
      kind: "DISTRIBUTION",
      amount: "100",
      date: day,
      notes: "Owner distribution",
    });
    const r = await reports(
      owner,
      new Date("2026-01-01"),
      new Date("2026-12-31"),
    );
    expect(r.revenue).toBe("100.00");
    expect(r.expensesTotal).toBe("20.00");
    expect(r.profit).toBe("80.00");
    expect(r.cashBalance).toBe("980.00");
    expect(D(r.assets).eq(D(r.liabilities).plus(r.equity))).toBe(true);
    for (const e of r.entries)
      expect(
        sum(e.lines.map((l) => l.debit.toString())).eq(
          sum(e.lines.map((l) => l.credit.toString())),
        ),
      ).toBe(true);
  });
  it("refunds are traceable and reopen the invoice balance", async () => {
    const p = await db.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { allocations: true },
    });
    await refundPayment(owner, p.id, {
      allocationId: p.allocations[0].id,
      amount: "10",
      date: "2026-01-16",
      reason: "Partial customer refund",
    });
    await expect(
      refundPayment(owner, p.id, {
        allocationId: p.allocations[0].id,
        amount: "30",
        date: "2026-01-16",
        reason: "Excess refund",
      }),
    ).rejects.toThrow("exceeds");
    const i = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: invoiceInclude,
    });
    expect(decorateInvoice(i).balance).toBe("10.00");
    await expect(
      voidInvoice(
        owner,
        invoiceId,
        "Invalid paid void",
        new Date("2026-01-17"),
      ),
    ).rejects.toThrow("Refund all");
  });
  it("supports unapplied cash and subsequent allocations", async () => {
    const p = await recordPayment(owner, {
      clientId,
      amount: "10",
      receivedAt: "2026-01-17",
      method: "CASH",
      idempotencyKey: randomUUID(),
    });
    await allocatePayment(owner, p.id, invoiceId, "10", new Date("2026-01-17"));
    const i = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: invoiceInclude,
    });
    expect(decorateInvoice(i).displayStatus).toBe("PAID");
  });
  it("reverses invoices and expenses without deleting originals", async () => {
    const invoice = await saveInvoice(owner, baseInvoice());
    await issueInvoice(owner, invoice.id);
    await voidInvoice(
      owner,
      invoice.id,
      "Invoice issued in error",
      new Date("2026-01-20"),
    );
    const expense = await recordExpense(owner, {
      vendor: "V",
      description: "Incorrect charge",
      date: day,
      amount: "15",
      category: "Other",
      accountCode: "5990",
      method: "CASH",
    });
    await reverseExpense(
      owner,
      expense.id,
      new Date("2026-01-21"),
      "Erroneous expense correction",
    );
    expect(
      (await reports(owner, new Date("2026-01-01"), new Date("2026-12-31")))
        .profit,
    ).toBe("80.00");
  });
  it("prevents unbalanced and mutable journals at the database level", async () => {
    await expect(
      transaction((tx) =>
        journal(
          tx,
          owner,
          {
            date: new Date(day),
            memo: "Bad",
            sourceType: "TEST",
            sourceId: randomUUID(),
          },
          [
            { code: "1000", debit: "10" },
            { code: "3000", credit: "9" },
          ],
        ),
      ),
    ).rejects.toThrow("balanced");
    const account = await db.ledgerAccount.findFirstOrThrow({
      where: { organizationId: owner.organizationId, code: "1000" },
    });
    await expect(
      db.journalEntry.create({
        data: {
          organizationId: owner.organizationId,
          date: new Date(day),
          memo: "Bad direct insert",
          sourceType: "TEST",
          sourceId: randomUUID(),
          actorId: owner.userId,
          lines: { create: { accountId: account.id, debit: "5", credit: "0" } },
        },
      }),
    ).rejects.toThrow();
    const entry = await db.journalEntry.findFirstOrThrow({
      where: { organizationId: owner.organizationId },
    });
    await expect(
      db.journalEntry.update({
        where: { id: entry.id },
        data: { memo: "tampered" },
      }),
    ).rejects.toThrow();
  });
  it("generates recurring drafts exactly once per billing period, including concurrent runs", async () => {
    const r = await saveRetainer(owner, {
      clientId,
      name: "Monthly maintenance",
      services: "Test services",
      amount: "50",
      frequency: "MONTHLY",
      startDate: "2026-01-31",
      nextInvoiceDate: "2026-01-31",
    });
    await Promise.all([
      runRecurring(owner, new Date("2026-03-31")),
      runRecurring(owner, new Date("2026-03-31")),
    ]);
    const invoices = await db.invoice.findMany({
      where: { retainerId: r.id },
      orderBy: { billingPeriod: "asc" },
    });
    expect(invoices).toHaveLength(3);
    expect(invoices.every((i) => i.status === "DRAFT")).toBe(true);
    expect(invoices[1].billingPeriod?.toISOString().slice(0, 10)).toBe(
      "2026-02-28",
    );
    await runRecurring(owner, new Date("2026-03-31"));
    expect(await db.invoice.count({ where: { retainerId: r.id } })).toBe(3);
  });
  it("validates private document content and enforces organization access", async () => {
    const pdf = await invoicePdf(owner, invoiceId);
    const form = new FormData();
    form.set("clientId", clientId);
    form.set(
      "file",
      new File([new Uint8Array(pdf.bytes)], "contract.pdf", {
        type: "application/pdf",
      }),
    );
    const doc = await upload(owner, form);
    expect((await download(owner, doc.id)).bytes.equals(pdf.bytes)).toBe(true);
    await expect(download(outsider, doc.id)).rejects.toThrow("not found");
    const bad = new FormData();
    bad.set("clientId", clientId);
    bad.set("file", new File(["<script>bad</script>"], "file.pdf"));
    await expect(upload(owner, bad)).rejects.toThrow("Allowed files");
  });
  it("neutralizes spreadsheet formula injection", () => {
    expect(csv([['=HYPERLINK("https://evil")']])).toContain("'=HYPERLINK");
  });
});

it("allocates one payment across multiple invoices and preserves payment-account postings", async () => {
  const first = await saveInvoice(owner, baseInvoice());
  const second = await saveInvoice(owner, baseInvoice());
  await issueInvoice(owner, first.id);
  await issueInvoice(owner, second.id);
  const payment = await recordPayment(owner, {
    clientId,
    amount: "200",
    receivedAt: day,
    method: "WIRE",
    paymentAccount: "1010",
    idempotencyKey: randomUUID(),
    allocations: [
      { invoiceId: first.id, amount: "100" },
      { invoiceId: second.id, amount: "100" },
    ],
  });
  for (const id of [first.id, second.id]) {
    const invoice = await db.invoice.findUniqueOrThrow({
      where: { id },
      include: invoiceInclude,
    });
    expect(decorateInvoice(invoice).displayStatus).toBe("PAID");
  }
  const entry = await db.journalEntry.findFirstOrThrow({
    where: { sourceType: "PAYMENT", sourceId: payment.id },
    include: { lines: { include: { account: true } } },
  });
  expect(
    entry.lines.find((line) => line.account.code === "1010")?.debit.toFixed(2),
  ).toBe("200.00");
});

it("records immutable expense reviews without changing financial postings", async () => {
  const expense = await recordExpense(owner, {
    vendor: "Review Test Vendor",
    description: "Receipt review",
    date: day,
    amount: "17",
    category: "Hosting",
    accountCode: "5100",
    method: "ACH",
  });
  const before = await db.journalEntry.findMany({
    where: { sourceId: expense.id },
    include: { lines: true },
  });
  await expect(
    reviewExpense(staff, expense.id, {
      reviewRequired: false,
      notes: "Receipt checked",
    }),
  ).rejects.toThrow("permission");
  await expect(
    reviewExpense(accountant, expense.id, {
      reviewRequired: false,
      notes: "Receipt checked",
    }),
  ).rejects.toThrow("permission");
  await expect(
    reviewExpense(outsider, expense.id, {
      reviewRequired: false,
      notes: "Receipt checked",
    }),
  ).rejects.toThrow("not found");
  await expect(
    reviewExpense(owner, expense.id, { reviewRequired: false, notes: "    " }),
  ).rejects.toThrow();
  const completed = await reviewExpense(owner, expense.id, {
    reviewRequired: false,
    notes: "Receipt, amount and business purpose checked.",
  });
  expect(completed.reviewerId).toBe(owner.userId);
  expect(completed.reviewerName).toBe(owner.name);
  expect(
    (await db.expense.findUniqueOrThrow({ where: { id: expense.id } }))
      .reviewRequired,
  ).toBe(false);
  await expect(
    reviewExpense(owner, expense.id, {
      reviewRequired: false,
      notes: "Duplicate submission",
    }),
  ).rejects.toThrow("already changed");
  await reviewExpense(owner, expense.id, {
    reviewRequired: true,
    notes: "Need an itemized receipt.",
  });
  const updated = await db.expense.findUniqueOrThrow({
    where: { id: expense.id },
    include: { reviews: true },
  });
  expect(updated.reviewRequired).toBe(true);
  expect(updated.reviews).toHaveLength(2);
  expect(
    await db.journalEntry.findMany({
      where: { sourceId: expense.id },
      include: { lines: true },
    }),
  ).toEqual(before);
  expect(
    await db.auditEvent.count({
      where: {
        entityId: expense.id,
        action: { in: ["REVIEWED", "REVIEW_REOPENED"] },
      },
    }),
  ).toBe(2);
  await expect(
    db.expenseReview.update({
      where: { id: completed.id },
      data: { notes: "Changed review" },
    }),
  ).rejects.toThrow();
  await expect(
    db.expenseReview.delete({ where: { id: completed.id } }),
  ).rejects.toThrow();
  await expect(
    db.expense.update({ where: { id: expense.id }, data: { amount: "18" } }),
  ).rejects.toThrow();
  await reverseExpense(
    owner,
    expense.id,
    new Date(day),
    "Close review test expense",
  );
  await expect(
    reviewExpense(owner, expense.id, {
      reviewRequired: false,
      notes: "Review reversed expense",
    }),
  ).rejects.toThrow("Reversed");
});
