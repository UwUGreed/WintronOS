import { businessDate } from "../dates";
import { db } from "../db";
import { D, sum, reserve } from "../money";
import type { Actor } from "../security";
import { invoiceInclude, decorateInvoice } from "./invoices";
export async function reports(a: Actor, from: Date, to: Date) {
  const organizationId = a.organizationId;
  const [
    accounts,
    entries,
    invoices,
    payments,
    expenses,
    retainers,
    owners,
    taxConfig,
    taxPayments,
  ] = await Promise.all([
    db.ledgerAccount.findMany({
      where: { organizationId },
      orderBy: { code: "asc" },
    }),
    db.journalEntry.findMany({
      where: { organizationId, date: { lte: to } },
      include: { lines: { include: { account: true } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    db.invoice.findMany({
      where: { organizationId },
      include: invoiceInclude,
      orderBy: { createdAt: "desc" },
    }),
    db.payment.findMany({
      where: { organizationId },
      include: {
        client: true,
        allocations: { include: { invoice: true, refunds: true } },
        refunds: true,
      },
      orderBy: { receivedAt: "desc" },
    }),
    db.expense.findMany({
      where: { organizationId },
      include: {
        client: true,
        documents: true,
        reviews: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { date: "desc" },
    }),
    db.retainer.findMany({
      where: { organizationId },
      include: { client: true },
      orderBy: { nextInvoiceDate: "asc" },
    }),
    db.owner.findMany({
      where: { organizationId },
      include: { transactions: true },
    }),
    db.taxConfiguration.findFirst({
      where: {
        organizationId,
        effectiveDate: { lte: to },
        taxYear: to.getUTCFullYear(),
      },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    }),
    db.taxPayment.findMany({
      where: { organizationId, date: { gte: from, lte: to } },
    }),
  ]);
  const periodEntries = entries.filter((e) => e.date >= from);
  const periodLines = periodEntries.flatMap((e) => e.lines);
  const allLines = entries.flatMap((e) => e.lines);
  const balance = (code: string, period = false) => {
    const lines = (period ? periodLines : allLines).filter(
      (l) => l.account.code === code,
    );
    return sum(lines.map((l) => l.debit.toString())).minus(
      sum(lines.map((l) => l.credit.toString())),
    );
  };
  const accountBalances = accounts.map((account) => ({
    ...account,
    debit: sum(
      periodLines
        .filter((l) => l.accountId === account.id)
        .map((l) => l.debit.toString()),
    ).toFixed(2),
    credit: sum(
      periodLines
        .filter((l) => l.accountId === account.id)
        .map((l) => l.credit.toString()),
    ).toFixed(2),
    balance: balance(account.code).toFixed(2),
    periodBalance: balance(account.code, true).toFixed(2),
  }));
  const revenue = sum(
    accountBalances
      .filter((l) => l.type === "REVENUE")
      .map((l) => D(l.periodBalance).negated().toString()),
  );
  const expense = sum(
    accountBalances
      .filter((l) => l.type === "EXPENSE")
      .map((l) => l.periodBalance),
  );
  const profit = revenue.minus(expense);
  const currentInvoices = invoices.map(decorateInvoice);
  const outstanding = currentInvoices.filter(
    (i) => i.status === "ISSUED" && D(i.balance).gt(0),
  );
  const periodPayments = payments.filter(
    (p) => p.receivedAt >= from && p.receivedAt <= to,
  );
  const cashCollected = sum(
    periodPayments.map((p) => p.amount.toString()),
  ).minus(
    sum(
      payments.flatMap((p) =>
        p.refunds
          .filter((r) => r.date >= from && r.date <= to)
          .map((r) => r.amount.toString()),
      ),
    ),
  );
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(
      Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11 + index, 1),
    );
    const next = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
    );
    const lines = entries
      .filter((e) => e.date >= date && e.date < next)
      .flatMap((e) => e.lines);
    return {
      month: date.toLocaleDateString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
      year: date.getUTCFullYear(),
      revenue: sum(
        lines
          .filter((l) => l.account.type === "REVENUE")
          .map((l) =>
            D(l.credit.toString()).minus(l.debit.toString()).toString(),
          ),
      ).toFixed(2),
      expenses: sum(
        lines
          .filter((l) => l.account.type === "EXPENSE")
          .map((l) =>
            D(l.debit.toString()).minus(l.credit.toString()).toString(),
          ),
      ).toFixed(2),
    };
  });
  const mrr = sum(
    retainers
      .filter(
        (r) =>
          r.status === "ACTIVE" &&
          r.startDate <= to &&
          (!r.endDate || r.endDate >= to),
      )
      .map((r) =>
        D(r.amount.toString())
          .div({ MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 }[r.frequency] || 1)
          .toString(),
      ),
  );
  const reserves = taxConfig
    ? {
        federal: reserve(
          profit,
          taxConfig.federalReservePercent.toString(),
        ).toFixed(2),
        state: reserve(
          profit,
          taxConfig.stateReservePercent.toString(),
        ).toFixed(2),
        selfEmployment: reserve(
          profit,
          taxConfig.selfEmploymentReservePercent.toString(),
        ).toFixed(2),
      }
    : null;
  const target = reserves ? sum(Object.values(reserves)) : D(0);
  const aging = [
    "Current",
    "1–30 days",
    "31–60 days",
    "61–90 days",
    "90+ days",
  ].map((label, index) => ({
    label,
    total: sum(
      outstanding
        .filter((i) => {
          const days = Math.floor(
            (businessDate().getTime() - i.dueDate.getTime()) / 86400000,
          );
          return index === 0
            ? days <= 0
            : index === 1
              ? days > 0 && days <= 30
              : index === 2
                ? days > 30 && days <= 60
                : index === 3
                  ? days > 60 && days <= 90
                  : days > 90;
        })
        .map((i) => i.balance),
    ).toFixed(2),
  }));
  const revenueByClient = Array.from(new Set(invoices.map((i) => i.clientId)))
    .map((clientId) => {
      const list = invoices.filter((i) => i.clientId === clientId);
      const ids = new Set(list.map((i) => i.id));
      const originalIds = new Set(
        entries
          .filter((e) => e.sourceType === "INVOICE" && ids.has(e.sourceId))
          .map((e) => e.id),
      );
      const lines = periodEntries
        .filter(
          (e) =>
            (e.sourceType === "INVOICE" && ids.has(e.sourceId)) ||
            (e.sourceType === "REVERSAL" && originalIds.has(e.sourceId)),
        )
        .flatMap((e) => e.lines)
        .filter((l) => l.account.code === "4000");
      return {
        clientId,
        name: list[0].client.name,
        revenue: sum(
          lines.map((l) =>
            D(l.credit.toString()).minus(l.debit.toString()).toString(),
          ),
        ).toFixed(2),
      };
    })
    .sort((x, y) => D(y.revenue).cmp(x.revenue));
  const serviceTotals = new Map<string, ReturnType<typeof D>>();
  let retainerRevenue = D(0);
  for (const entry of periodEntries) {
    const original =
      entry.sourceType === "REVERSAL"
        ? entries.find((e) => e.id === entry.sourceId)
        : entry;
    const invoice =
      original?.sourceType === "INVOICE"
        ? invoices.find((i) => i.id === original.sourceId)
        : null;
    if (!invoice) continue;
    const sign = entry.sourceType === "REVERSAL" ? -1 : 1;
    for (const line of invoice.lines) {
      const amount = D(line.subtotal.toString())
        .minus(line.discount.toString())
        .mul(sign);
      serviceTotals.set(
        line.serviceCategory,
        (serviceTotals.get(line.serviceCategory) || D(0)).plus(amount),
      );
      if (invoice.retainerId) retainerRevenue = retainerRevenue.plus(amount);
    }
  }
  const adjustments = revenue.minus(sum([...serviceTotals.values()]));
  if (!adjustments.isZero())
    serviceTotals.set("Reviewed journal adjustments", adjustments);
  const revenueByService = [...serviceTotals].map(([name, value]) => ({
    name,
    revenue: value.toFixed(2),
  }));
  const totalEarned = sum(
    accountBalances
      .filter((l) => l.type === "REVENUE")
      .map((l) => D(l.balance).negated().toString()),
  ).minus(
    sum(
      accountBalances.filter((l) => l.type === "EXPENSE").map((l) => l.balance),
    ),
  );
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    basis: "Accrual · posted journals",
    revenueByService,
    retainerRevenue: retainerRevenue.toFixed(2),
    revenue: revenue.toFixed(2),
    expensesTotal: expense.toFixed(2),
    profit: profit.toFixed(2),
    cashCollected: cashCollected.toFixed(2),
    cashBalance: balance("1000").toFixed(2),
    outstanding: sum(outstanding.map((i) => i.balance)).toFixed(2),
    unpaidCount: outstanding.length,
    overdue: sum(
      outstanding
        .filter((i) => i.dueDate < businessDate())
        .map((i) => i.balance),
    ).toFixed(2),
    monthly,
    mrr: mrr.toFixed(2),
    arr: mrr.mul(12).toFixed(2),
    accountBalances,
    entries: periodEntries,
    invoices: currentInvoices,
    payments,
    expenses,
    retainers,
    owners,
    taxConfig,
    taxPayments,
    reserves,
    reserveTarget: target.toFixed(2),
    remainingReserve: taxConfig
      ? D.max(0, target.minus(taxConfig.earmarked.toString())).toFixed(2)
      : null,
    aging,
    revenueByClient,
    retainedEarnings: totalEarned.toFixed(2),
    assets: sum(
      accountBalances.filter((l) => l.type === "ASSET").map((l) => l.balance),
    ).toFixed(2),
    liabilities: sum(
      accountBalances
        .filter((l) => l.type === "LIABILITY")
        .map((l) => D(l.balance).negated().toString()),
    ).toFixed(2),
    equity: sum(
      accountBalances
        .filter((l) => l.type === "EQUITY")
        .map((l) => D(l.balance).negated().toString()),
    )
      .plus(totalEarned)
      .toFixed(2),
    cashMovement: balance("1000", true).toFixed(2),
  };
}
export function csv(rows: unknown[][]) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let v = String(value ?? "");
          if (/^[=+@\t\r]/.test(v) || (/^[-]/.test(v) && !/^-[0-9.]+$/.test(v)))
            v = "'" + v;
          return '"' + v.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
}
