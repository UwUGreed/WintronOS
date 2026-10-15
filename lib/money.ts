import { businessDate } from "./dates";
import Decimal from "decimal.js";
Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });
export const D = Object.assign((value: Decimal.Value) => new Decimal(value), {
  max: Decimal.max,
});
export const cents = (value: Decimal.Value) => D(value).toDecimalPlaces(2);
export const sum = (values: Decimal.Value[]) =>
  values.reduce<Decimal>((s, v) => s.plus(v), D(0));
export type LineInput = {
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxPercent: string;
  jurisdiction: string;
  serviceCategory: string;
};
export function calculateInvoice(input: LineInput[]) {
  const lines = input.map((line, position) => {
    const subtotal = cents(D(line.quantity).mul(line.unitPrice));
    const discount = cents(subtotal.mul(line.discountPercent).div(100));
    const tax = cents(subtotal.minus(discount).mul(line.taxPercent).div(100));
    return {
      ...line,
      position,
      subtotal: subtotal.toFixed(2),
      discount: discount.toFixed(2),
      tax: tax.toFixed(2),
      total: subtotal.minus(discount).plus(tax).toFixed(2),
    };
  });
  return {
    lines,
    subtotal: sum(lines.map((l) => l.subtotal)).toFixed(2),
    discount: sum(lines.map((l) => l.discount)).toFixed(2),
    tax: sum(lines.map((l) => l.tax)).toFixed(2),
    total: sum(lines.map((l) => l.total)).toFixed(2),
  };
}
export function remaining(
  total: Decimal.Value,
  allocations: Decimal.Value[],
  refunds: Decimal.Value[] = [],
) {
  return cents(D(total).minus(sum(allocations)).plus(sum(refunds)));
}
export function validateAllocations(
  amount: Decimal.Value,
  allocations: { amount: string; balance: string }[],
) {
  if (
    allocations.some((x) => D(x.amount).lte(0) || D(x.amount).gt(x.balance)) ||
    sum(allocations.map((x) => x.amount)).gt(amount)
  )
    throw new Error("Allocation exceeds the payment or invoice balance.");
}
export function reserve(profit: Decimal.Value, percent: Decimal.Value) {
  return cents(Decimal.max(0, D(profit)).mul(percent).div(100));
}
export function ownerAllocations(
  profit: Decimal.Value,
  owners: { id: string; percentage: Decimal.Value }[],
) {
  if (!sum(owners.map((o) => o.percentage)).eq(100))
    throw new Error("Owner percentages must total 100%.");
  let allocated = D(0);
  return owners.map((o, i) => {
    const amount =
      i === owners.length - 1
        ? cents(D(profit).minus(allocated))
        : cents(D(profit).mul(o.percentage).div(100));
    allocated = allocated.plus(amount);
    return { id: o.id, amount: amount.toFixed(2) };
  });
}
export function nextBillingDate(
  date: Date,
  frequency: string,
  anchorDay: number,
) {
  const months = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 }[frequency];
  if (!months) throw new Error("Invalid billing frequency");
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const last = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(anchorDay, last));
  return next;
}
export function invoiceStatus(
  invoice: { status: string; total: Decimal.Value; dueDate: Date },
  balance: Decimal.Value,
) {
  if (invoice.status === "DRAFT" || invoice.status === "VOID")
    return invoice.status;
  if (D(balance).eq(0)) return "PAID";
  if (D(balance).lt(invoice.total)) return "PARTIALLY_PAID";
  return invoice.dueDate < businessDate() ? "OVERDUE" : "ISSUED";
}
