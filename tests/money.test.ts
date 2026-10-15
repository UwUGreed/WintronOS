import { describe, it, expect } from "vitest";
import {
  calculateInvoice,
  D,
  nextBillingDate,
  remaining,
  validateAllocations,
  reserve,
  ownerAllocations,
} from "../lib/money";
import {
  clientSchema,
  invoiceSchema,
  expenseSchema,
  date,
} from "../lib/validation";
const line = {
  description: "Service",
  quantity: "3",
  unitPrice: "19.99",
  discountPercent: "10",
  taxPercent: "6",
  jurisdiction: "Configured test jurisdiction",
  serviceCategory: "Services",
};
describe("financial calculations", () => {
  it("rounds discount and tax per line with decimal half-up arithmetic", () => {
    const result = calculateInvoice([line]);
    expect(result.subtotal).toBe("59.97");
    expect(result.discount).toBe("6.00");
    expect(result.tax).toBe("3.24");
    expect(result.total).toBe("57.21");
  });
  it("keeps decimal precision for fractional quantities", () =>
    expect(
      calculateInvoice([
        {
          ...line,
          quantity: "0.1",
          unitPrice: "0.2",
          discountPercent: "0",
          taxPercent: "0",
        },
      ]).total,
    ).toBe("0.02"));
  it("tracks partial and refunded balances", () => {
    expect(remaining("100.00", ["30.00"]).toFixed(2)).toBe("70.00");
    expect(remaining("100", ["30", "70"], ["10"]).toFixed(2)).toBe("10.00");
  });
  it("rejects payment over-allocation", () => {
    expect(() =>
      validateAllocations("10", [{ amount: "11", balance: "20" }]),
    ).toThrow();
    expect(() =>
      validateAllocations("20", [{ amount: "15", balance: "10" }]),
    ).toThrow();
    expect(() =>
      validateAllocations("20", [{ amount: "10", balance: "10" }]),
    ).not.toThrow();
  });
  it("anchors end-of-month schedules without drifting", () => {
    let next = nextBillingDate(new Date("2024-01-31"), "MONTHLY", 31);
    expect(next.toISOString().slice(0, 10)).toBe("2024-02-29");
    next = nextBillingDate(next, "MONTHLY", 31);
    expect(next.toISOString().slice(0, 10)).toBe("2024-03-31");
    expect(
      nextBillingDate(new Date("2024-02-29"), "ANNUAL", 29)
        .toISOString()
        .slice(0, 10),
    ).toBe("2025-02-28");
  });
  it("does not create a negative reserve from a loss", () => {
    expect(reserve("-100", "25").toFixed(2)).toBe("0.00");
    expect(reserve("100.05", "25").toFixed(2)).toBe("25.01");
  });
  it("allocates owner profit exactly including rounding residual", () => {
    const result = ownerAllocations("0.01", [
      { id: "a", percentage: "50" },
      { id: "b", percentage: "50" },
    ]);
    expect(D(result[0].amount).plus(result[1].amount).toFixed(2)).toBe("0.01");
    expect(() =>
      ownerAllocations("100", [{ id: "a", percentage: "40" }]),
    ).toThrow();
  });
  it("validates calendar dates and disallows javascript websites", () => {
    expect(() => date.parse("2026-02-30")).toThrow();
    expect(() =>
      clientSchema.parse({ name: "A", website: "javascript:alert(1)" }),
    ).toThrow();
  });
  it("requires a jurisdiction for sales tax and preserves accountant review", () => {
    expect(() =>
      invoiceSchema.parse({
        clientId: "c",
        issueDate: "2026-01-01",
        dueDate: "2026-01-02",
        description: "x",
        lines: [{ ...line, jurisdiction: "" }],
      }),
    ).toThrow();
    expect(
      expenseSchema.parse({
        vendor: "V",
        description: "D",
        date: "2026-01-01",
        amount: "10",
        category: "Hardware",
        accountCode: "5300",
        method: "CASH",
      }).reviewRequired,
    ).toBe(true);
  });
});
it("allocates losses to all owners without clamping to zero", () => {
  const allocations = ownerAllocations("-100", [
    { id: "a", percentage: "60" },
    { id: "b", percentage: "40" },
  ]);
  expect(allocations.map((a) => a.amount)).toEqual(["-60.00", "-40.00"]);
});

it("uses the South Carolina calendar date across UTC midnight", async () => {
  const { businessDateKey, businessDate } = await import("../lib/dates");
  expect(businessDateKey(new Date("2026-10-16T01:00:00Z"))).toBe("2026-10-15");
  expect(businessDate(new Date("2026-10-16T01:00:00Z")).toISOString()).toBe(
    "2026-10-15T00:00:00.000Z",
  );
});
