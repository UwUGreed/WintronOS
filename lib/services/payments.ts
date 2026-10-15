import { createHash } from "node:crypto";
import { paymentSchema, refundSchema } from "../validation";
import { D, sum, validateAllocations } from "../money";
import { AppError, authorize, type Actor } from "../security";
import { transaction, audit, journal, clientInOrg, notify } from "./ledger";
import { decorateInvoice, invoiceInclude } from "./invoices";
export async function recordPayment(a: Actor, raw: unknown) {
  authorize(a, "write");
  const data = paymentSchema.parse(raw);
  const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  return transaction(async (tx) => {
    const prior = await tx.payment.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: a.organizationId,
          idempotencyKey: data.idempotencyKey,
        },
      },
    });
    if (prior) {
      if (prior.requestHash !== hash)
        throw new AppError(
          "Idempotency key already used for different payment details.",
          409,
        );
      return prior;
    }
    await clientInOrg(tx, a, data.clientId);
    const invoices = await tx.invoice.findMany({
      where: {
        organizationId: a.organizationId,
        clientId: data.clientId,
        id: { in: data.allocations.map((l) => l.invoiceId) },
        status: "ISSUED",
      },
      include: invoiceInclude,
    });
    if (invoices.length !== data.allocations.length)
      throw new AppError(
        "Allocations must reference issued invoices for this client.",
      );
    const allocations = data.allocations.map((l) => {
      const invoice = invoices.find((i) => i.id === l.invoiceId)!;
      if (data.receivedAt < invoice.issueDate)
        throw new AppError(
          "Use an unapplied payment for receipts before invoice issuance.",
        );
      return { amount: l.amount, balance: decorateInvoice(invoice).balance };
    });
    try {
      validateAllocations(data.amount, allocations);
    } catch (e) {
      throw new AppError((e as Error).message);
    }
    const payment = await tx.payment.create({
      data: {
        ...data,
        allocations: { create: data.allocations },
        organizationId: a.organizationId,
        recordedBy: a.userId,
        requestHash: hash,
      },
    });
    const allocated = sum(data.allocations.map((x) => x.amount));
    const unapplied = D(data.amount).minus(allocated);
    const lines = [
      { code: data.paymentAccount, debit: data.amount },
      ...(allocated.gt(0)
        ? [{ code: "1100", credit: allocated.toFixed(2) }]
        : []),
      ...(unapplied.gt(0)
        ? [{ code: "2000", credit: unapplied.toFixed(2) }]
        : []),
    ];
    await journal(
      tx,
      a,
      {
        date: data.receivedAt,
        memo: `Payment ${data.reference || payment.id}`,
        sourceType: "PAYMENT",
        sourceId: payment.id,
      },
      lines,
    );
    await audit(
      tx,
      a,
      "RECORDED",
      "PAYMENT",
      payment.id,
      `Payment received: $${D(data.amount).toFixed(2)} via ${data.method}`,
      data.clientId,
    );
    await notify(
      tx,
      a,
      `payment:${payment.id}`,
      "Payment recorded",
      `$${D(data.amount).toFixed(2)} received`,
      "payments",
    );
    return payment;
  });
}
export async function refundPayment(a: Actor, id: string, raw: unknown) {
  authorize(a, "owner");
  const data = refundSchema.parse(raw);
  return transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id, organizationId: a.organizationId },
      include: { allocations: { include: { refunds: true } }, refunds: true },
    });
    if (!payment) throw new AppError("Payment not found.", 404);
    if (data.date < payment.receivedAt)
      throw new AppError("Refund date cannot precede receipt date.");
    let available = D(payment.amount.toString())
      .minus(sum(payment.allocations.map((x) => x.amount.toString())))
      .minus(
        sum(
          payment.refunds
            .filter((r) => !r.allocationId)
            .map((r) => r.amount.toString()),
        ),
      );
    if (data.allocationId) {
      const allocation = payment.allocations.find(
        (x) => x.id === data.allocationId,
      );
      if (!allocation) throw new AppError("Allocation not found.");
      available = D(allocation.amount.toString()).minus(
        sum(allocation.refunds.map((r) => r.amount.toString())),
      );
    }
    if (D(data.amount).gt(available))
      throw new AppError("Refund exceeds the available payment amount.");
    const refund = await tx.refund.create({
      data: {
        ...data,
        allocationId: data.allocationId || null,
        paymentId: id,
        actorId: a.userId,
      },
    });
    await journal(
      tx,
      a,
      {
        date: data.date,
        memo: `Refund: ${data.reason}`,
        sourceType: "REFUND",
        sourceId: refund.id,
      },
      [
        { code: data.allocationId ? "1100" : "2000", debit: data.amount },
        { code: payment.paymentAccount, credit: data.amount },
      ],
    );
    await audit(
      tx,
      a,
      "REFUNDED",
      "PAYMENT",
      id,
      `Refunded $${data.amount}: ${data.reason}`,
      payment.clientId,
    );
    return refund;
  });
}
export async function allocatePayment(
  a: Actor,
  id: string,
  invoiceId: string,
  amount: string,
  date: Date,
) {
  authorize(a, "write");
  return transaction(async (tx) => {
    const p = await tx.payment.findFirst({
      where: { id, organizationId: a.organizationId },
      include: { allocations: true, refunds: true },
    });
    const i = await tx.invoice.findFirst({
      where: {
        id: invoiceId,
        organizationId: a.organizationId,
        status: "ISSUED",
      },
      include: invoiceInclude,
    });
    if (!p || !i || p.clientId !== i.clientId)
      throw new AppError("Payment and invoice must belong to the same client.");
    if (date < p.receivedAt || date < i.issueDate)
      throw new AppError(
        "Allocation date cannot precede payment or invoice date.",
      );
    const available = D(p.amount.toString())
      .minus(sum(p.allocations.map((x) => x.amount.toString())))
      .minus(
        sum(
          p.refunds
            .filter((r) => !r.allocationId)
            .map((r) => r.amount.toString()),
        ),
      );
    if (
      D(amount).lte(0) ||
      D(amount).gt(available) ||
      D(amount).gt(decorateInvoice(i).balance)
    )
      throw new AppError(
        "Allocation exceeds available funds or invoice balance.",
      );
    if (p.allocations.some((x) => x.invoiceId === invoiceId))
      throw new AppError(
        "This payment already has an allocation to this invoice.",
      );
    const allocation = await tx.paymentAllocation.create({
      data: {
        organizationId: a.organizationId,
        paymentId: id,
        invoiceId,
        amount,
      },
    });
    await journal(
      tx,
      a,
      {
        date,
        memo: `Apply payment to ${i.number}`,
        sourceType: "ALLOCATION",
        sourceId: allocation.id,
      },
      [
        { code: "2000", debit: amount },
        { code: "1100", credit: amount },
      ],
    );
    await audit(
      tx,
      a,
      "ALLOCATED",
      "PAYMENT",
      id,
      `Applied $${amount} to ${i.number}`,
      p.clientId,
    );
    return allocation;
  });
}
