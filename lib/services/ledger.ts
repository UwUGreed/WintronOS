import { Prisma } from "@prisma/client";
import { db } from "../db";
import { D, sum } from "../money";
import { AppError, type Actor } from "../security";
export type Tx = Prisma.TransactionClient;
export const chart = [
  ["1000", "Operating cash", "ASSET"],
  ["1010", "Tax reserve cash", "ASSET"],
  ["1100", "Accounts receivable", "ASSET"],
  ["2000", "Unapplied customer payments", "LIABILITY"],
  ["2100", "Sales tax payable", "LIABILITY"],
  ["2200", "Income tax payable", "LIABILITY"],
  ["3000", "Owner capital", "EQUITY"],
  ["3100", "Owner distributions", "EQUITY"],
  ["4000", "Service revenue", "REVENUE"],
  ["5000", "Software subscriptions", "EXPENSE"],
  ["5100", "Hosting", "EXPENSE"],
  ["5200", "Domain purchases", "EXPENSE"],
  ["5300", "Hardware", "EXPENSE"],
  ["5400", "Marketing", "EXPENSE"],
  ["5500", "Professional services", "EXPENSE"],
  ["5600", "Office expenses", "EXPENSE"],
  ["5700", "Travel", "EXPENSE"],
  ["5800", "Contractor expenses", "EXPENSE"],
  ["5900", "Insurance", "EXPENSE"],
  ["5990", "Other expenses", "EXPENSE"],
  ["6000", "Entity income tax expense", "EXPENSE"],
];
export async function initializeAccounts(tx: Tx, organizationId: string) {
  for (const [code, name, type] of chart)
    await tx.ledgerAccount.upsert({
      where: { organizationId_code: { organizationId, code } },
      create: { organizationId, code, name, type },
      update: {},
    });
}
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 20000,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2034" &&
        attempt < 3
      )
        continue;
      throw e;
    }
  }
  throw new AppError("Concurrent update. Please retry.", 409);
}
export async function audit(
  tx: Tx,
  a: Actor,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  clientId?: string,
  before?: unknown,
  after?: unknown,
) {
  return tx.auditEvent.create({
    data: {
      organizationId: a.organizationId,
      actorId: a.userId,
      action,
      entityType,
      entityId,
      summary,
      clientId,
      before: before ? JSON.parse(JSON.stringify(before)) : undefined,
      after: after ? JSON.parse(JSON.stringify(after)) : undefined,
    },
  });
}
export async function journal(
  tx: Tx,
  a: Actor,
  input: {
    date: Date;
    memo: string;
    sourceType: string;
    sourceId: string;
    reversalOf?: string;
  },
  lines: { code: string; debit?: string; credit?: string }[],
) {
  if (
    lines.length < 2 ||
    !sum(lines.map((l) => l.debit || "0")).eq(
      sum(lines.map((l) => l.credit || "0")),
    ) ||
    sum(lines.map((l) => l.debit || "0")).lte(0)
  )
    throw new AppError(
      "Journal must contain balanced positive debit and credit totals.",
    );
  const accounts = await tx.ledgerAccount.findMany({
    where: {
      organizationId: a.organizationId,
      code: { in: lines.map((l) => l.code) },
    },
  });
  return tx.journalEntry.create({
    data: {
      ...input,
      organizationId: a.organizationId,
      actorId: a.userId,
      lines: {
        create: lines.map((l) => {
          const account = accounts.find((x) => x.code === l.code);
          if (!account) throw new AppError("Unknown ledger account.");
          if (
            D(l.debit || 0).lt(0) ||
            D(l.credit || 0).lt(0) ||
            (D(l.debit || 0).gt(0) && D(l.credit || 0).gt(0))
          )
            throw new AppError("Invalid journal line.");
          return {
            accountId: account.id,
            debit: l.debit || "0",
            credit: l.credit || "0",
          };
        }),
      },
    },
  });
}
export async function reverseJournal(
  tx: Tx,
  a: Actor,
  sourceType: string,
  sourceId: string,
  date: Date,
  reason: string,
) {
  const entry = await tx.journalEntry.findUnique({
    where: {
      organizationId_sourceType_sourceId: {
        organizationId: a.organizationId,
        sourceType,
        sourceId,
      },
    },
    include: { lines: { include: { account: true } } },
  });
  if (!entry) throw new AppError("Original journal not found.", 404);
  return journal(
    tx,
    a,
    {
      date,
      memo: reason,
      sourceType: "REVERSAL",
      sourceId: entry.id,
      reversalOf: entry.id,
    },
    entry.lines.map((l) => ({
      code: l.account.code,
      debit: l.credit.toFixed(2),
      credit: l.debit.toFixed(2),
    })),
  );
}
export async function clientInOrg(tx: Tx, a: Actor, id: string) {
  const c = await tx.client.findFirst({
    where: { id, organizationId: a.organizationId },
  });
  if (!c) throw new AppError("Client not found.", 404);
  return c;
}
export async function notify(
  tx: Tx,
  a: Actor,
  key: string,
  title: string,
  message: string,
  target: string,
) {
  return tx.notification.upsert({
    where: { organizationId_key: { organizationId: a.organizationId, key } },
    update: {},
    create: { organizationId: a.organizationId, key, title, message, target },
  });
}
