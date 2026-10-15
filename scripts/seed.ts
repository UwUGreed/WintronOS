import "./env";
import { db } from "../lib/db";
import { provisionOrganization } from "../lib/bootstrap";
import {
  saveClient,
  saveNote,
  recordExpense,
  saveRetainer,
} from "../lib/services/operations";
import { saveInvoice, issueInvoice } from "../lib/services/invoices";
import { recordPayment } from "../lib/services/payments";
import { randomUUID } from "node:crypto";
async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    !process.argv.includes("--development-only")
  )
    throw new Error(
      "Explicit development-only seed required: npm run db:seed -- --development-only",
    );
  let org = await db.organization.findFirst();
  if (!org) org = await provisionOrganization();
  if (await db.client.count({ where: { organizationId: org.id } }))
    throw new Error(
      "Seed requires an empty client database; existing records will not be changed.",
    );
  const actor = {
    organizationId: org.id,
    userId: "development-seed",
    role: "OWNER" as const,
    name: "Development seed",
  };
  const names = [
    "Example Cedar Studio",
    "Example Harbor Analytics",
    "Example Juniper Labs",
    "Example Beacon Services",
  ];
  for (let i = 0; i < names.length; i++) {
    const client = await saveClient(actor, {
      name: names[i],
      contactName: `Example Contact ${i + 1}`,
      email: `client${i + 1}@example.invalid`,
      industry: ["Design", "Analytics", "Technology", "Professional services"][
        i
      ],
      tags: ["FICTIONAL DEVELOPMENT DATA"],
    });
    await saveNote(actor, {
      clientId: client.id,
      title: "Fictional discovery notes",
      content: "<p>Development-only sample. This is not a real client.</p>",
    });
    const current = new Date();
    const issue = new Date(
      Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth(),
        Math.min(i + 1, current.getUTCDate()),
      ),
    );
    const due = new Date(issue);
    due.setUTCDate(due.getUTCDate() + 30);
    const invoice = await saveInvoice(actor, {
      clientId: client.id,
      description: [
        "Website development",
        "SEO services",
        "Security review",
        "Software consulting",
      ][i],
      issueDate: issue.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      lines: [
        {
          description: "Fictional sample service",
          quantity: "1",
          unitPrice: String(1250 + i * 500),
        },
      ],
    });
    await issueInvoice(actor, invoice.id);
    if (i % 2 === 0)
      await recordPayment(actor, {
        clientId: client.id,
        amount: invoice.total.toFixed(2),
        receivedAt: issue.toISOString().slice(0, 10),
        method: "ACH",
        reference: "DEVELOPMENT SAMPLE",
        idempotencyKey: randomUUID(),
        allocations: [
          { invoiceId: invoice.id, amount: invoice.total.toFixed(2) },
        ],
      });
    await saveRetainer(actor, {
      clientId: client.id,
      name: "Example ongoing maintenance",
      services: "Fictional sample contract",
      amount: String(200 + i * 150),
      frequency: "MONTHLY",
      startDate: issue.toISOString().slice(0, 10),
      nextInvoiceDate: due.toISOString().slice(0, 10),
    });
  }
  await recordExpense(actor, {
    vendor: "Example Cloud Vendor",
    description: "Fictional development expense",
    date: new Date().toISOString().slice(0, 10),
    amount: "89.00",
    category: "Hosting",
    accountCode: "5100",
    method: "CARD",
  });
  console.log(
    "Created clearly labeled fictional development records. No accounts or credentials were seeded.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
