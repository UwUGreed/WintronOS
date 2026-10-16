import { businessDate } from "../dates";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { db } from "../db";
import { AppError, authorize, type Actor } from "../security";
import {
  clientSchema,
  noteSchema,
  expenseSchema,
  expenseReviewSchema,
  retainerSchema,
  ownerTransactionSchema,
  taxPaymentSchema,
} from "../validation";
import { D, nextBillingDate } from "../money";
import {
  transaction,
  audit,
  journal,
  reverseJournal,
  clientInOrg,
  notify,
  type Tx,
} from "./ledger";
import { createDraft } from "./invoices";
export async function saveClient(a: Actor, raw: unknown, id?: string) {
  authorize(a, "write");
  const data = clientSchema.parse(raw);
  return transaction(async (tx) => {
    const before = id ? await clientInOrg(tx, a, id) : undefined;
    const result = id
      ? await tx.client.update({ where: { id }, data })
      : await tx.client.create({
          data: { ...data, organizationId: a.organizationId },
        });
    await audit(
      tx,
      a,
      id ? "UPDATED" : "CREATED",
      "CLIENT",
      result.id,
      `${id ? "Updated" : "Added"} client: ${data.name}`,
      result.id,
      before,
      result,
    );
    return result;
  });
}
export async function saveNote(a: Actor, raw: unknown, id?: string) {
  authorize(a, "write");
  const data = noteSchema.parse(raw);
  data.content = sanitizeHtml(data.content, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "ul",
      "ol",
      "li",
      "h3",
      "blockquote",
      "a",
    ],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["https", "http"],
  });
  if (
    !sanitizeHtml(data.content, {
      allowedTags: [],
      allowedAttributes: {},
    }).trim()
  )
    throw new AppError("Note cannot be empty.");
  return transaction(async (tx) => {
    await clientInOrg(tx, a, data.clientId);
    if (id) {
      const old = await tx.clientNote.findFirst({
        where: { id, clientId: data.clientId },
      });
      if (!old) throw new AppError("Note not found.", 404);
      await tx.noteRevision.create({
        data: {
          noteId: id,
          title: old.title,
          content: old.content,
          authorId: a.userId,
        },
      });
    }
    const result = id
      ? await tx.clientNote.update({ where: { id }, data })
      : await tx.clientNote.create({ data: { ...data, authorId: a.userId } });
    await audit(
      tx,
      a,
      id ? "UPDATED" : "CREATED",
      "NOTE",
      result.id,
      `${id ? "Updated" : "Added"} note: ${data.title}`,
      data.clientId,
    );
    return result;
  });
}
async function expenseInTx(
  tx: Tx,
  a: Actor,
  data: z.infer<typeof expenseSchema>,
  sourceExpenseId?: string,
) {
  if (data.clientId) await clientInOrg(tx, a, data.clientId);
  if (
    data.projectId &&
    !(await tx.project.findFirst({
      where: {
        id: data.projectId,
        client: { organizationId: a.organizationId },
        ...(data.clientId ? { clientId: data.clientId } : {}),
      },
    }))
  )
    throw new AppError("Project not found.", 404);
  const expense = await tx.expense.create({
    data: {
      ...data,
      clientId: data.clientId || null,
      projectId: data.projectId || null,
      organizationId: a.organizationId,
      recordedBy: a.userId,
      sourceExpenseId,
      nextDate: data.recurringInterval
        ? nextBillingDate(
            data.date,
            data.recurringInterval,
            data.date.getUTCDate(),
          )
        : null,
    },
  });
  await journal(
    tx,
    a,
    {
      date: data.date,
      memo: `${data.vendor}: ${data.description}`,
      sourceType: "EXPENSE",
      sourceId: expense.id,
    },
    [
      { code: data.accountCode, debit: data.amount },
      { code: data.paymentAccount, credit: data.amount },
    ],
  );
  await audit(
    tx,
    a,
    "RECORDED",
    "EXPENSE",
    expense.id,
    `Recorded expense: ${data.vendor}, $${data.amount}`,
    data.clientId,
  );
  return expense;
}
export async function recordExpense(a: Actor, raw: unknown) {
  authorize(a, "write");
  const data = expenseSchema.parse(raw);
  return transaction((tx) => expenseInTx(tx, a, data));
}
export async function reviewExpense(a: Actor, id: string, raw: unknown) {
  authorize(a, "owner");
  const data = expenseReviewSchema.parse(raw);
  return transaction(async (tx) => {
    const expense = await tx.expense.findFirst({
      where: { id, organizationId: a.organizationId },
    });
    if (!expense) throw new AppError("Expense not found.", 404);
    if (expense.reversedAt)
      throw new AppError("Reversed expenses cannot be reviewed.");
    if (expense.reviewRequired === data.reviewRequired)
      throw new AppError(
        "Review status has already changed. Refresh the expense.",
        409,
      );
    const review = await tx.expenseReview.create({
      data: {
        expenseId: id,
        ...data,
        reviewerId: a.userId,
        reviewerName: a.name,
      },
    });
    await tx.expense.update({
      where: { id },
      data: { reviewRequired: data.reviewRequired },
    });
    await audit(
      tx,
      a,
      data.reviewRequired ? "REVIEW_REOPENED" : "REVIEWED",
      "EXPENSE",
      id,
      `${data.reviewRequired ? "Reopened review" : "Reviewed expense"}: ${expense.vendor}. ${data.notes}`,
      expense.clientId || undefined,
      { reviewRequired: expense.reviewRequired },
      { reviewRequired: data.reviewRequired, reviewId: review.id },
    );
    return review;
  });
}
export async function reverseExpense(
  a: Actor,
  id: string,
  date: Date,
  reason: string,
) {
  authorize(a, "owner");
  return transaction(async (tx) => {
    const e = await tx.expense.findFirst({
      where: { id, organizationId: a.organizationId },
    });
    if (!e || e.reversedAt)
      throw new AppError("Expense not found or already reversed.");
    if (date < e.date)
      throw new AppError("Reversal date cannot precede expense.");
    await reverseJournal(tx, a, "EXPENSE", id, date, reason);
    await tx.expense.update({
      where: { id },
      data: { reversedAt: date, nextDate: null },
    });
    await audit(
      tx,
      a,
      "REVERSED",
      "EXPENSE",
      id,
      reason,
      e.clientId || undefined,
    );
    return { ok: true };
  });
}
export async function saveRetainer(a: Actor, raw: unknown, id?: string) {
  authorize(a, "write");
  const input = retainerSchema.parse(raw);
  const { hours, ...rest } = input;
  return transaction(async (tx) => {
    await clientInOrg(tx, a, input.clientId);
    const before = id
      ? await tx.retainer.findFirst({
          where: { id, organizationId: a.organizationId },
        })
      : null;
    if (id && !before) throw new AppError("Retainer not found.", 404);
    const data = {
      ...rest,
      hours: hours || null,
      billingDay: input.nextInvoiceDate.getUTCDate(),
    };
    const r = id
      ? await tx.retainer.update({ where: { id }, data })
      : await tx.retainer.create({
          data: { ...data, organizationId: a.organizationId },
        });
    await audit(
      tx,
      a,
      id ? "UPDATED" : "CREATED",
      "RETAINER",
      r.id,
      `${id ? "Updated" : "Created"} retainer: ${r.name}`,
      r.clientId,
      before,
      r,
    );
    return r;
  });
}
export async function runRecurring(a: Actor, asOf?: Date) {
  authorize(a, "write");
  const cutoff = asOf
    ? new Date(asOf.toISOString().slice(0, 10))
    : businessDate();
  const ids = await db.retainer.findMany({
    where: {
      organizationId: a.organizationId,
      status: "ACTIVE",
      nextInvoiceDate: { lte: cutoff },
    },
    select: { id: true },
  });
  const created: string[] = [];
  for (const { id } of ids) {
    const result = await transaction(async (tx) => {
      const r = await tx.retainer.findFirst({
        where: { id, organizationId: a.organizationId, status: "ACTIVE" },
      });
      if (!r) return [];
      const results: string[] = [];
      let period = r.nextInvoiceDate;
      for (
        let n = 0;
        n < 120 && period <= cutoff && (!r.endDate || period <= r.endDate);
        n++
      ) {
        if (
          !(await tx.invoice.findUnique({
            where: {
              retainerId_billingPeriod: {
                retainerId: id,
                billingPeriod: period,
              },
            },
          }))
        ) {
          const due = new Date(period);
          due.setUTCDate(due.getUTCDate() + r.paymentTerms);
          const org = await tx.organization.findUniqueOrThrow({
            where: { id: a.organizationId },
          });
          const inv = await createDraft(
            tx,
            a,
            {
              clientId: r.clientId,
              description: r.name,
              issueDate: period,
              dueDate: due,
              notes: r.services,
              terms: org.terms,
              paymentInstructions: org.paymentInstructions,
              lines: [
                {
                  description: r.name,
                  quantity: "1",
                  unitPrice: r.amount.toFixed(2),
                  discountPercent: "0",
                  taxPercent: "0",
                  jurisdiction: "",
                  serviceCategory: "Retainer",
                },
              ],
            },
            { retainerId: id, billingPeriod: period },
          );
          results.push(inv.id);
        }
        period = nextBillingDate(period, r.frequency, r.billingDay);
      }
      await tx.retainer.update({
        where: { id },
        data: { nextInvoiceDate: period },
      });
      return results;
    });
    created.push(...result);
  }
  const recurringExpenses = await db.expense.findMany({
    where: {
      organizationId: a.organizationId,
      reversedAt: null,
      sourceExpenseId: null,
      nextDate: { lte: cutoff },
    },
  });
  for (const original of recurringExpenses)
    await transaction(async (tx) => {
      const e = await tx.expense.findUniqueOrThrow({
        where: { id: original.id },
      });
      let period = e.nextDate;
      if (!period || !e.recurringInterval) return;
      for (let n = 0; n < 120 && period <= cutoff; n++) {
        if (
          !(await tx.expense.findUnique({
            where: {
              sourceExpenseId_date: { sourceExpenseId: e.id, date: period },
            },
          }))
        )
          await expenseInTx(
            tx,
            a,
            {
              vendor: e.vendor,
              description: e.description,
              date: period,
              paymentAccount: e.paymentAccount as "1000" | "1010",
              amount: e.amount.toFixed(2),
              category: e.category as z.infer<typeof expenseSchema>["category"],
              accountCode: e.accountCode as z.infer<
                typeof expenseSchema
              >["accountCode"],
              method: e.method as z.infer<typeof expenseSchema>["method"],
              reviewRequired: true,
              notes: e.notes,
              clientId: e.clientId || undefined,
              projectId: e.projectId || undefined,
              recurringInterval: null,
            },
            e.id,
          );
        period = nextBillingDate(
          period,
          e.recurringInterval,
          e.date.getUTCDate(),
        );
      }
      await tx.expense.update({
        where: { id: e.id },
        data: { nextDate: period },
      });
    });
  await transaction(async (tx) => {
    await tx.jobRun.create({
      data: {
        organizationId: a.organizationId,
        kind: "RECURRING",
        status: "SUCCESS",
        detail: `Created ${created.length} draft invoices`,
      },
    });
    await audit(
      tx,
      a,
      "GENERATED",
      "RETAINER",
      "scheduler",
      `Recurring run: ${created.length} draft invoices`,
    );
  });
  return { created };
}
export async function recordOwnerTransaction(a: Actor, raw: unknown) {
  authorize(a, "owner");
  const data = ownerTransactionSchema.parse(raw);
  return transaction(async (tx) => {
    if (
      !(await tx.owner.findFirst({
        where: { id: data.ownerId, organizationId: a.organizationId },
      }))
    )
      throw new AppError("Owner not found.", 404);
    const record = await tx.ownerTransaction.create({
      data: { ...data, organizationId: a.organizationId, actorId: a.userId },
    });
    const contribution = data.kind === "CONTRIBUTION";
    await journal(
      tx,
      a,
      {
        date: data.date,
        memo: data.notes,
        sourceType: "OWNER",
        sourceId: record.id,
      },
      contribution
        ? [
            { code: "1000", debit: data.amount },
            { code: "3000", credit: data.amount },
          ]
        : [
            { code: "3100", debit: data.amount },
            { code: "1000", credit: data.amount },
          ],
    );
    await audit(
      tx,
      a,
      "RECORDED",
      "OWNER",
      record.id,
      `Owner ${data.kind.toLowerCase()}: $${data.amount}`,
    );
    return record;
  });
}
export async function recordTaxPayment(a: Actor, raw: unknown) {
  authorize(a, "owner");
  const data = taxPaymentSchema.parse(raw);
  return transaction(async (tx) => {
    const record = await tx.taxPayment.create({
      data: { ...data, organizationId: a.organizationId, actorId: a.userId },
    });
    await journal(
      tx,
      a,
      {
        date: data.date,
        memo: `${data.jurisdiction} tax payment ${data.reference}`,
        sourceType: "TAX_PAYMENT",
        sourceId: record.id,
      },
      [
        {
          code: data.kind === "SALES_TAX" ? "2100" : "2200",
          debit: data.amount,
        },
        { code: "1000", credit: data.amount },
      ],
    );
    await audit(
      tx,
      a,
      "RECORDED",
      "TAX_PAYMENT",
      record.id,
      `Recorded ${data.jurisdiction} tax payment: $${data.amount}`,
    );
    return record;
  });
}
export async function refreshNotifications(a: Actor) {
  const soon = businessDate();
  soon.setUTCDate(soon.getUTCDate() + 7);
  const invoices = await db.invoice.findMany({
    where: {
      organizationId: a.organizationId,
      status: "ISSUED",
      dueDate: { lte: soon },
    },
    include: { allocations: { include: { refunds: true } } },
  });
  const { decorateInvoice } = await import("./invoices");
  await transaction(async (tx) => {
    for (const i of invoices) {
      if (D(decorateInvoice(i).balance).lte(0)) continue;
      await notify(
        tx,
        a,
        `due:${i.id}`,
        i.dueDate < businessDate() ? "Invoice overdue" : "Invoice due soon",
        `${i.number} · Due ${i.dueDate.toISOString().slice(0, 10)}`,
        "invoices",
      );
    }
    const retainers = await tx.retainer.findMany({
      where: {
        organizationId: a.organizationId,
        status: "ACTIVE",
        endDate: { lte: soon, gte: new Date() },
      },
    });
    for (const r of retainers)
      await notify(
        tx,
        a,
        `renewal:${r.id}:${r.endDate?.toISOString()}`,
        "Contract renewal approaching",
        r.name,
        "retainers",
      );
  });
}
