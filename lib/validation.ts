import { z } from "zod";
const text = z.string().trim().max(500);
const short = text.min(1);
const long = z.string().max(20000);
export const money = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,2})?$/,
    "Use a positive amount with up to two decimal places.",
  );
const positiveMoney = money.refine(
  (v) => Number(v) > 0,
  "Amount must be greater than zero.",
);
const percent = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,4})?$/)
  .refine((v) => Number(v) <= 100, "Percentage cannot exceed 100.");
const decimal = z.string().regex(/^\d{1,8}(\.\d{1,4})?$/);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Invalid calendar date.",
  )
  .transform((v) => new Date(v + "T00:00:00Z"));
const optionalDate = z
  .union([date, z.literal("")])
  .optional()
  .transform((v) => v || null);
const email = z.union([z.email().max(254), z.literal("")]).default("");
export const clientSchema = z.object({
  name: short,
  tradeName: text.default(""),
  industry: text.default(""),
  website: z
    .union([z.url().refine((v) => /^https?:/.test(v)), z.literal("")])
    .default(""),
  contactName: text.default(""),
  email,
  phone: text.default(""),
  billingAddress: long.default(""),
  serviceAddress: long.default(""),
  status: z.enum(["ACTIVE", "LEAD", "INACTIVE"]).default("ACTIVE"),
  leadSource: text.default(""),
  tags: z.array(text).max(30).default([]),
  paymentTerms: z.coerce.number().int().min(0).max(365).default(30),
  billingPreferences: long.default(""),
});
export const noteSchema = z.object({
  clientId: short,
  title: short,
  content: long.min(1),
  tags: z.array(text).max(30).default([]),
});
export const lineSchema = z
  .object({
    description: short,
    quantity: decimal.refine((v) => Number(v) > 0),
    unitPrice: decimal,
    discountPercent: percent.default("0"),
    taxPercent: percent.default("0"),
    jurisdiction: text.default(""),
    serviceCategory: text.default("Services"),
  })
  .refine((v) => Number(v.taxPercent) === 0 || v.jurisdiction.length > 0, {
    message: "Specify a transaction jurisdiction for taxed lines.",
    path: ["jurisdiction"],
  });
export const invoiceSchema = z
  .object({
    clientId: short,
    issueDate: date,
    dueDate: date,
    description: short,
    notes: long.default(""),
    terms: long.default(""),
    paymentInstructions: long.default(""),
    lines: z.array(lineSchema).min(1).max(100),
  })
  .refine((v) => v.dueDate >= v.issueDate, {
    message: "Due date must be on or after issue date.",
    path: ["dueDate"],
  });
export const paymentSchema = z
  .object({
    clientId: short,
    amount: positiveMoney,
    receivedAt: date,
    method: z.enum(["ACH", "WIRE", "CHECK", "CASH", "CARD", "OTHER"]),
    reference: text.default(""),
    notes: long.default(""),
    paymentAccount: z.enum(["1000", "1010"]).default("1000"),
    idempotencyKey: z.string().min(8).max(100),
    allocations: z
      .array(z.object({ invoiceId: short, amount: positiveMoney }))
      .max(100)
      .default([]),
  })
  .refine(
    (v) =>
      new Set(v.allocations.map((a) => a.invoiceId)).size ===
      v.allocations.length,
    "An invoice can only appear once per payment.",
  );
export const categories = [
  "Software subscriptions",
  "Hosting",
  "Domain purchases",
  "Hardware",
  "Marketing",
  "Professional services",
  "Office expenses",
  "Travel",
  "Contractor expenses",
  "Insurance",
  "Other",
] as const;
export const expenseSchema = z.object({
  vendor: short,
  description: short,
  date,
  amount: positiveMoney,
  category: z.enum(categories),
  paymentAccount: z.enum(["1000", "1010"]).default("1000"),
  accountCode: z.enum([
    "5000",
    "5100",
    "5200",
    "5300",
    "5400",
    "5500",
    "5600",
    "5700",
    "5800",
    "5900",
    "5990",
  ]),
  method: z.enum(["ACH", "WIRE", "CHECK", "CASH", "CARD", "OTHER"]),
  notes: long.default(""),
  reviewRequired: z.boolean().default(true),
  clientId: text.optional(),
  projectId: text.optional(),
  recurringInterval: z
    .enum(["MONTHLY", "QUARTERLY", "ANNUAL"])
    .nullable()
    .optional(),
});
export const retainerSchema = z
  .object({
    clientId: short,
    name: short,
    services: long.default(""),
    amount: positiveMoney,
    frequency: z.enum(["MONTHLY", "QUARTERLY", "ANNUAL"]),
    startDate: date,
    endDate: optionalDate,
    nextInvoiceDate: date,
    paymentTerms: z.coerce.number().int().min(0).max(365).default(30),
    status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).default("ACTIVE"),
    notes: long.default(""),
    hours: z.union([decimal, z.literal("")]).optional(),
  })
  .refine(
    (v) => !v.endDate || v.endDate >= v.startDate,
    "End date must follow start date.",
  )
  .refine(
    (v) => v.nextInvoiceDate >= v.startDate,
    "Next invoice date cannot precede start date.",
  );
export const organizationSchema = z.object({
  name: short,
  address: long,
  email,
  phone: text,
  website: text,
  invoicePrefix: z.string().regex(/^[A-Z0-9-]{1,12}$/),
  paymentTerms: z.coerce.number().int().min(0).max(365),
  paymentInstructions: long,
  terms: long,
});
export const taxSchema = z.object({
  taxYear: z.coerce.number().int().min(2020).max(2100),
  effectiveDate: date,
  classification: z.enum([
    "UNCONFIRMED",
    "PARTNERSHIP",
    "S_CORPORATION",
    "C_CORPORATION",
  ]),
  accountingMethod: z.enum(["ACCRUAL", "CASH"]),
  federalReservePercent: percent,
  stateReservePercent: percent,
  selfEmploymentReservePercent: percent,
  earmarked: money,
  sourceReferences: long,
  reviewNotes: long,
});
export const ownerSchema = z.object({
  name: short,
  percentage: percent,
  residency: text,
});
export const ownerTransactionSchema = z.object({
  ownerId: short,
  kind: z.enum(["CONTRIBUTION", "DISTRIBUTION", "TAX_DISTRIBUTION"]),
  amount: positiveMoney,
  date,
  notes: long.min(1),
});
export const taxPaymentSchema = z.object({
  date,
  amount: positiveMoney,
  jurisdiction: short,
  taxYear: z.coerce.number().int().min(2020).max(2100),
  kind: z.enum(["ENTITY_INCOME_TAX", "SALES_TAX"]),
  reference: short,
});
export const projectSchema = z.object({
  ownerName: text.default(""),
  clientId: short,
  name: short,
  description: long.default(""),
  status: z
    .enum(["ACTIVE", "PLANNED", "COMPLETED", "CANCELLED"])
    .default("ACTIVE"),
  dueDate: optionalDate,
});
export const reasonSchema = z.object({ reason: long.min(5), date });
export const refundSchema = reasonSchema.extend({
  amount: positiveMoney,
  allocationId: text.optional(),
});
export const expenseReviewSchema = z.object({
  reviewRequired: z.boolean(),
  notes: z.string().trim().min(5).max(4000),
});
export const contactSchema = z.object({
  clientId: short,
  name: short,
  email,
  phone: text.default(""),
  title: text.default(""),
});
export const userSchema = z.object({
  name: short,
  email: z.email(),
  password: z.string().min(14).max(128),
  role: z.enum(["OWNER", "STAFF", "ACCOUNTANT"]),
});
