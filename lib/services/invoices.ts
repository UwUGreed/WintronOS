import { z } from "zod";
import { invoiceSchema } from "../validation";
import { calculateInvoice, D, remaining, invoiceStatus } from "../money";
import { AppError, authorize, type Actor } from "../security";
import {
  audit,
  journal,
  reverseJournal,
  transaction,
  clientInOrg,
  type Tx,
} from "./ledger";
export const invoiceInclude = {
  client: true,
  lines: { orderBy: { position: "asc" as const } },
  allocations: { include: { refunds: true } },
  deliveries: { orderBy: { createdAt: "desc" as const } },
};
export function decorateInvoice<
  T extends {
    status: string;
    total: { toString(): string };
    dueDate: Date;
    allocations: {
      amount: { toString(): string };
      refunds: { amount: { toString(): string } }[];
    }[];
  },
>(invoice: T) {
  const balance = remaining(
    invoice.total.toString(),
    invoice.allocations.map((x) => x.amount.toString()),
    invoice.allocations.flatMap((x) =>
      x.refunds.map((r) => r.amount.toString()),
    ),
  );
  return {
    ...invoice,
    balance: invoice.status === "VOID" ? "0.00" : balance.toFixed(2),
    displayStatus: invoiceStatus(
      { ...invoice, total: invoice.total.toString() },
      balance,
    ),
  };
}
export async function createDraft(
  tx: Tx,
  a: Actor,
  data: z.infer<typeof invoiceSchema>,
  extra?: { retainerId: string; billingPeriod: Date },
) {
  await clientInOrg(tx, a, data.clientId);
  const { lines, ...totals } = calculateInvoice(data.lines);
  if (D(totals.total).lte(0))
    throw new AppError("Invoice total must be greater than zero.");
  const invoice = await tx.invoice.create({
    data: {
      ...data,
      ...totals,
      ...extra,
      organizationId: a.organizationId,
      createdBy: a.userId,
      lines: { create: lines },
    },
    include: invoiceInclude,
  });
  await audit(
    tx,
    a,
    "CREATED",
    "INVOICE",
    invoice.id,
    `Created draft: ${data.description}`,
    data.clientId,
  );
  return invoice;
}
export async function saveInvoice(a: Actor, raw: unknown, id?: string) {
  authorize(a, "write");
  const data = invoiceSchema.parse(raw);
  return transaction(async (tx) => {
    if (!id) return createDraft(tx, a, data);
    const existing = await tx.invoice.findFirst({
      where: { id, organizationId: a.organizationId },
      include: invoiceInclude,
    });
    if (!existing) throw new AppError("Invoice not found.", 404);
    if (existing.status !== "DRAFT")
      throw new AppError(
        "Issued invoices are immutable. Void and replace with a reason.",
        409,
      );
    await clientInOrg(tx, a, data.clientId);
    const { lines, ...totals } = calculateInvoice(data.lines);
    if (D(totals.total).lte(0))
      throw new AppError("Invoice total must be greater than zero.");
    await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
    const updated = await tx.invoice.update({
      where: { id },
      data: { ...data, ...totals, lines: { create: lines } },
      include: invoiceInclude,
    });
    await audit(
      tx,
      a,
      "UPDATED",
      "INVOICE",
      id,
      "Updated draft invoice",
      data.clientId,
      existing,
      updated,
    );
    return updated;
  });
}
export async function issueInvoice(a: Actor, id: string) {
  authorize(a, "write");
  return transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id, organizationId: a.organizationId },
      include: invoiceInclude,
    });
    if (!invoice) throw new AppError("Invoice not found.", 404);
    if (invoice.status !== "DRAFT") return invoice;
    const org = await tx.organization.update({
      where: { id: a.organizationId },
      data: { nextInvoice: { increment: 1 } },
    });
    const number = `${org.invoicePrefix}-${invoice.issueDate.getUTCFullYear()}-${String(org.nextInvoice - 1).padStart(5, "0")}`;
    const snapshot = {
      organization: {
        name: org.name,
        address: org.address,
        email: org.email,
        phone: org.phone,
        website: org.website,
      },
      client: {
        name: invoice.client.name,
        billingAddress: invoice.client.billingAddress,
        email: invoice.client.email,
      },
    };
    const updated = await tx.invoice.update({
      where: { id },
      data: { status: "ISSUED", number, issuedAt: new Date(), snapshot },
      include: invoiceInclude,
    });
    const lines = [
      { code: "1100", debit: invoice.total.toFixed(2) },
      {
        code: "4000",
        credit: D(invoice.subtotal.toString())
          .minus(invoice.discount.toString())
          .toFixed(2),
      },
    ];
    if (invoice.tax.gt(0))
      lines.push({ code: "2100", credit: invoice.tax.toFixed(2) });
    await journal(
      tx,
      a,
      {
        date: invoice.issueDate,
        memo: `Issued ${number}`,
        sourceType: "INVOICE",
        sourceId: id,
      },
      lines,
    );
    await audit(
      tx,
      a,
      "ISSUED",
      "INVOICE",
      id,
      `Issued ${number}`,
      invoice.clientId,
    );
    return updated;
  });
}
export async function voidInvoice(
  a: Actor,
  id: string,
  reason: string,
  date: Date,
) {
  authorize(a, "owner");
  return transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id, organizationId: a.organizationId },
      include: invoiceInclude,
    });
    if (!invoice || invoice.status !== "ISSUED")
      throw new AppError("Only issued invoices can be voided.");
    const net = invoice.allocations.reduce(
      (v, l) =>
        v
          .plus(l.amount.toString())
          .minus(l.refunds.reduce((s, r) => s.plus(r.amount.toString()), D(0))),
      D(0),
    );
    if (!net.eq(0))
      throw new AppError(
        "Refund all allocated payments before voiding this invoice.",
      );
    if (date < invoice.issueDate)
      throw new AppError("Correction date cannot precede the original entry.");
    await reverseJournal(tx, a, "INVOICE", id, date, reason);
    const updated = await tx.invoice.update({
      where: { id },
      data: { status: "VOID", voidReason: reason },
    });
    await audit(
      tx,
      a,
      "VOIDED",
      "INVOICE",
      id,
      `Voided ${invoice.number}: ${reason}`,
      invoice.clientId,
    );
    return updated;
  });
}
