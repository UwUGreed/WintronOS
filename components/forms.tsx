"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, LoaderCircle, Info } from "lucide-react";
import { Modal, api, today, currency } from "./ui";
import type { State, Row, Line, Invoice } from "@/lib/client-types";
import { calculateInvoice, D } from "@/lib/money";
import { RichText } from "./rich-text";
export type FormKind =
  | "client"
  | "note"
  | "invoice"
  | "payment"
  | "expense"
  | "retainer"
  | "project"
  | "contact"
  | "owner"
  | "owner-transaction"
  | "tax"
  | "tax-payment"
  | "user"
  | "journal"
  | "refund"
  | "allocation"
  | "delivery"
  | "time";
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  span?: boolean;
  help?: string;
};
const options = (items: string[]) =>
  items.map((value) => ({ value, label: value.replaceAll("_", " ") }));
const categories = [
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
];
const categoryCodes = [
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
];
export function RecordForm({
  kind,
  state,
  initial = {},
  onClose: dismiss,
  onSaved,
}: {
  kind: FormKind;
  state: State;
  initial?: Row | Record<string, unknown>;
  onClose: () => void;
  onSaved: (record?: Row) => void | Promise<void>;
}) {
  const clientOpts = state.clients.map((c) => ({ value: c.id, label: c.name }));
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries({
        clientId: initial.clientId || "",
        status: "ACTIVE",
        paymentTerms: state.organization.paymentTerms,
        issueDate: today(),
        dueDate: today(),
        date: today(),
        receivedAt: today(),
        startDate: today(),
        nextInvoiceDate: today(),
        method: "ACH",
        paymentAccount: "1000",
        category: "Software subscriptions",
        accountCode: "5000",
        frequency: "MONTHLY",
        classification: "UNCONFIRMED",
        taxYear: new Date().getFullYear(),
        effectiveDate: today(),
        accountingMethod: "ACCRUAL",
        federalReservePercent: "0",
        stateReservePercent: "0",
        selfEmploymentReservePercent: "0",
        earmarked: "0",
        role: "STAFF",
        kind: kind === "tax-payment" ? "ENTITY_INCOME_TAX" : "CONTRIBUTION",
        terms: state.organization.terms,
        paymentInstructions: state.organization.paymentInstructions,
        ...initial,
      }).map(([k, v]) => [
        k,
        v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v),
      ]),
    ),
  );
  const [lines, setLines] = useState<Line[]>(
    (initial.lines as Line[]) || [
      {
        description: "",
        quantity: "1",
        unitPrice: "",
        discountPercent: "0",
        taxPercent: "0",
        jurisdiction: "",
        serviceCategory: "Services",
      },
    ],
  );
  const [allocations, setAllocations] = useState<
    { invoiceId: string; amount: string }[]
  >(
    initial.invoiceId
      ? [
          {
            invoiceId: String(initial.invoiceId),
            amount: String(initial.amount || ""),
          },
        ]
      : [],
  );
  const [journalLines, setJournalLines] = useState([
    { code: "1000", debit: "0", credit: "0" },
    { code: "3000", debit: "0", credit: "0" },
  ]);
  const [review, setReview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const onClose = () => {
    if (!busy && (!dirty || window.confirm("Discard unsaved changes?")))
      dismiss();
  };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const f = (
    name: string,
    label: string,
    type = "text",
    required = false,
    span = false,
  ): Field => ({ name, label, type, required, span });
  const select = (
    name: string,
    label: string,
    opts: { value: string; label: string }[],
    required = true,
  ): Field => ({ name, label, type: "select", options: opts, required });
  const client = select("clientId", "Client", clientOpts);
  const definitions: Record<
    FormKind,
    { title: string; endpoint: string; fields: Field[] }
  > = {
    client: {
      title: initial.id ? "Edit client" : "Add client",
      endpoint: "clients",
      fields: [
        f("name", "Company name", "text", true),
        f("tradeName", "Trade name"),
        f("industry", "Industry"),
        f("website", "Website", "url"),
        f("contactName", "Primary contact"),
        f("email", "Email address", "email"),
        f("phone", "Phone number"),
        select("status", "Status", options(["ACTIVE", "LEAD", "INACTIVE"])),
        f("billingAddress", "Billing address", "textarea", false, true),
        f("serviceAddress", "Service address", "textarea", false, true),
        f("leadSource", "Lead source"),
        f("paymentTerms", "Payment terms (days)", "number", true),
        f("tags", "Tags (comma-separated)"),
        f("billingPreferences", "Billing preferences", "textarea", false, true),
      ],
    },
    note: {
      title: initial.id ? "Edit note" : "Add client note",
      endpoint: "notes",
      fields: [
        client,
        f("title", "Note title", "text", true),
        {
          ...f("content", "Note content", "textarea", true, true),
          help: "Use the formatting controls for meeting notes and follow-up actions. Keep passwords and API keys in a dedicated secrets manager.",
        },
        f("tags", "Tags (comma-separated)"),
      ],
    },
    invoice: {
      title: initial.id ? "Edit draft invoice" : "Create invoice",
      endpoint: "invoices",
      fields: [
        client,
        f("description", "Description", "text", true),
        f("issueDate", "Issue date", "date", true),
        f("dueDate", "Due date", "date", true),
      ],
    },
    payment: {
      title: "Record payment",
      endpoint: "payments",
      fields: [
        client,
        f("amount", "Amount received (USD)", "text", true),
        f("receivedAt", "Date received", "date", true),
        select(
          "method",
          "Payment method",
          options(["ACH", "WIRE", "CHECK", "CASH", "CARD", "OTHER"]),
        ),
        select("paymentAccount", "Receiving account", [
          { value: "1000", label: "Operating cash" },
          { value: "1010", label: "Tax reserve cash" },
        ]),
        f("reference", "Reference number"),
        f("notes", "Internal notes", "textarea", false, true),
      ],
    },
    expense: {
      title: "Record expense",
      endpoint: "expenses",
      fields: [
        f("vendor", "Vendor", "text", true),
        f("description", "Description", "text", true),
        f("date", "Expense date", "date", true),
        f("amount", "Amount (USD)", "text", true),
        select("category", "Category", options(categories)),
        select(
          "accountCode",
          "Ledger account",
          categoryCodes.map((value, i) => ({
            value,
            label: `${value} · ${categories[i]}`,
          })),
        ),
        select(
          "method",
          "Payment method",
          options(["ACH", "WIRE", "CHECK", "CASH", "CARD", "OTHER"]),
        ),
        select("paymentAccount", "Payment account", [
          { value: "1000", label: "Operating cash" },
          { value: "1010", label: "Tax reserve cash" },
        ]),
        { ...client, required: false },
        select(
          "recurringInterval",
          "Repeat paid expense",
          options(["MONTHLY", "QUARTERLY", "ANNUAL"]),
          false,
        ),
        f("notes", "Notes", "textarea", false, true),
      ],
    },
    retainer: {
      title: initial.id ? "Edit retainer" : "Create retainer",
      endpoint: "retainers",
      fields: [
        client,
        f("name", "Contract name", "text", true),
        f("services", "Services included", "textarea", false, true),
        f("amount", "Recurring price (USD)", "text", true),
        select(
          "frequency",
          "Billing frequency",
          options(["MONTHLY", "QUARTERLY", "ANNUAL"]),
        ),
        f("startDate", "Start date", "date", true),
        f("endDate", "End / renewal date", "date"),
        f("nextInvoiceDate", "Next invoice date", "date", true),
        f("paymentTerms", "Payment terms (days)", "number", true),
        select(
          "status",
          "Contract status",
          options(["ACTIVE", "PAUSED", "CANCELLED"]),
        ),
        f("hours", "Hour allowance"),
        f("notes", "Notes", "textarea", false, true),
      ],
    },
    project: {
      title: initial.id ? "Edit project" : "Add project",
      endpoint: "projects",
      fields: [
        client,
        f("name", "Project name", "text", true),
        f("ownerName", "Project owner"),
        f("description", "Description", "textarea", false, true),
        select(
          "status",
          "Status",
          options(["ACTIVE", "PLANNED", "COMPLETED", "CANCELLED"]),
        ),
        f("dueDate", "Due date", "date"),
      ],
    },
    contact: {
      title: "Add contact",
      endpoint: "contacts",
      fields: [
        client,
        f("name", "Name", "text", true),
        f("email", "Email", "email"),
        f("phone", "Phone"),
        f("title", "Role / title"),
      ],
    },
    owner: {
      title: "Configure owner",
      endpoint: "owners",
      fields: [
        f("name", "Owner name", "text", true),
        f("percentage", "Ownership percentage", "text", true),
        f("residency", "Tax residency"),
      ],
    },
    "owner-transaction": {
      title: "Record owner transaction",
      endpoint: "owner-transactions",
      fields: [
        select(
          "ownerId",
          "Owner",
          state.owners.map((o) => ({ value: o.id, label: o.name })),
        ),
        select(
          "kind",
          "Transaction type",
          options(["CONTRIBUTION", "DISTRIBUTION", "TAX_DISTRIBUTION"]),
        ),
        f("amount", "Amount (USD)", "text", true),
        f("date", "Transaction date", "date", true),
        f("notes", "Purpose / accountant reference", "textarea", true, true),
      ],
    },
    tax: {
      title: "Tax reserve assumptions",
      endpoint: "tax-config",
      fields: [
        f("taxYear", "Tax year", "number", true),
        f("effectiveDate", "Effective date", "date", true),
        select(
          "classification",
          "Federal classification",
          options([
            "UNCONFIRMED",
            "PARTNERSHIP",
            "S_CORPORATION",
            "C_CORPORATION",
          ]),
        ),
        select(
          "accountingMethod",
          "Tax accounting method",
          options(["ACCRUAL", "CASH"]),
        ),
        f(
          "federalReservePercent",
          "Federal reserve assumption (%)",
          "text",
          true,
        ),
        f("stateReservePercent", "State reserve assumption (%)", "text", true),
        f(
          "selfEmploymentReservePercent",
          "Self-employment reserve assumption (%)",
          "text",
          true,
        ),
        f("earmarked", "Amount earmarked (USD)", "text", true),
        f(
          "sourceReferences",
          "Authoritative sources / version",
          "textarea",
          false,
          true,
        ),
        f("reviewNotes", "Accountant review notes", "textarea", false, true),
      ],
    },
    "tax-payment": {
      title: "Record entity tax payment",
      endpoint: "tax-payments",
      fields: [
        f("date", "Payment date", "date", true),
        f("amount", "Amount (USD)", "text", true),
        f("jurisdiction", "Jurisdiction", "text", true),
        f("taxYear", "Tax year", "number", true),
        select(
          "kind",
          "Liability account",
          options(["ENTITY_INCOME_TAX", "SALES_TAX"]),
        ),
        f("reference", "Payment reference", "text", true),
      ],
    },
    user: {
      title: "Add staff account",
      endpoint: "users",
      fields: [
        f("name", "Full name", "text", true),
        f("email", "Email", "email", true),
        f("password", "Temporary password (14+ characters)", "password", true),
        select("role", "Role", options(["OWNER", "STAFF", "ACCOUNTANT"])),
      ],
    },
    journal: {
      title: "Post reviewed adjustment",
      endpoint: "journals",
      fields: [
        f("date", "Posting date", "date", true),
        f(
          "memo",
          "Reason and accountant approval reference",
          "textarea",
          true,
          true,
        ),
      ],
    },
    refund: {
      title: "Record refund / correction",
      endpoint: `payments/${initial.paymentId}/refund`,
      fields: [
        f("amount", "Refund amount (USD)", "text", true),
        f("date", "Refund date", "date", true),
        select(
          "allocationId",
          "Refund from",
          (
            state.payments.find((p) => p.id === initial.paymentId)
              ?.allocations || []
          ).map((a) => ({ value: a.id, label: a.invoice.number || "Invoice" })),
          false,
        ),
        f("reason", "Reason", "textarea", true, true),
      ],
    },
    allocation: {
      title: "Allocate unapplied payment",
      endpoint: `payments/${initial.paymentId}/allocate`,
      fields: [
        select(
          "invoiceId",
          "Invoice",
          state.invoices
            .filter(
              (i) =>
                i.clientId === initial.clientId &&
                i.status === "ISSUED" &&
                D(i.balance).gt(0),
            )
            .map((i) => ({
              value: i.id,
              label: `${i.number} · ${currency(i.balance)} due`,
            })),
        ),
        f("amount", "Amount (USD)", "text", true),
        f("date", "Allocation date", "date", true),
      ],
    },
    delivery: {
      title: "Record invoice delivery",
      endpoint: `invoices/${initial.invoiceId}/delivery`,
      fields: [
        f("recipient", "Recipient", "email", true),
        select("status", "Delivery status", options(["SENT", "DELIVERED"])),
        f("notes", "Delivery method / reference", "textarea", true, true),
      ],
    },
    time: {
      title: "Record time",
      endpoint: `retainers/${initial.retainerId}/time`,
      fields: [
        f("date", "Date", "date", true),
        f("minutes", "Minutes", "number", true),
        f("description", "Work performed", "textarea", true, true),
      ],
    },
  };
  const def = definitions[kind];
  const change = (name: string, value: string) => {
    setDirty(true);
    setValues((v) => ({
      ...v,
      [name]: value,
      ...(name === "category"
        ? { accountCode: categoryCodes[categories.indexOf(value)] }
        : {}),
    }));
  };
  const renderField = (field: Field) => (
    <label className={field.span ? "span-2" : ""} key={field.name}>
      <span>
        {field.label}
        {field.required && (
          <b className="required" aria-hidden="true">
            {" "}
            *
          </b>
        )}
      </span>
      {field.type === "select" ? (
        <select
          aria-label={field.label}
          value={values[field.name] || ""}
          required={field.required}
          onChange={(e) => {
            change(field.name, e.target.value);
            if (field.name === "clientId") setAllocations([]);
          }}
        >
          <option value="">
            {field.required
              ? "Select…"
              : field.name === "allocationId"
                ? "Unapplied balance"
                : "None"}
          </option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.name === "content" && kind === "note" ? (
        <RichText
          initial={values.content || ""}
          onChange={(html) => change("content", html)}
        />
      ) : field.type === "textarea" ? (
        <textarea
          aria-label={field.label}
          value={values[field.name] || ""}
          rows={4}
          required={field.required}
          onChange={(e) => change(field.name, e.target.value)}
        />
      ) : (
        <input
          aria-label={field.label}
          type={field.type}
          value={
            field.type === "date"
              ? values[field.name]?.slice(0, 10) || ""
              : values[field.name] || ""
          }
          required={field.required}
          min={field.type === "number" ? 0 : undefined}
          autoComplete={field.type === "password" ? "new-password" : undefined}
          onChange={(e) => change(field.name, e.target.value)}
        />
      )}{" "}
      {field.help && <small>{field.help}</small>}
    </label>
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const data: Record<string, unknown> = { ...values };
      for (const key of [
        "issueDate",
        "dueDate",
        "date",
        "receivedAt",
        "startDate",
        "endDate",
        "nextInvoiceDate",
        "effectiveDate",
      ])
        if (typeof data[key] === "string") data[key] = data[key].slice(0, 10);
      if (kind === "client" || kind === "note")
        data.tags = (values.tags || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      if (kind === "invoice") data.lines = lines;
      if (kind === "payment") {
        data.allocations = allocations;
        data.idempotencyKey = idempotencyKey;
      }
      if (kind === "journal") data.lines = journalLines;
      if (kind === "expense") {
        data.reviewRequired = review;
        data.recurringInterval = values.recurringInterval || null;
      }
      const record = await api<Row>(
        def.endpoint +
          (initial.id &&
          [
            "client",
            "note",
            "invoice",
            "retainer",
            "owner",
            "project",
          ].includes(kind)
            ? "/" + initial.id
            : ""),
        data,
      );
      setDirty(false);
      await onSaved(record);
      dismiss();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  let total = "0.00";
  try {
    total = calculateInvoice(
      lines.map((l) => ({ ...l, unitPrice: l.unitPrice || "0" })),
    ).total;
  } catch {}
  return (
    <Modal
      title={def.title}
      description={
        kind === "invoice"
          ? "Build a draft, then review and issue it to create a receivable."
          : kind === "tax"
            ? "Planning assumptions only. Saving creates a new version; it does not establish tax liability."
            : undefined
      }
      onClose={onClose}
      wide={kind === "invoice" || kind === "journal"}
    >
      <form onSubmit={submit} onChange={() => setDirty(true)}>
        <div className="modal-body">
          <div className="form-grid">{def.fields.map(renderField)}</div>
          {kind === "invoice" && (
            <>
              <div className="section-label">
                Line items <span>USD</span>
              </div>
              {lines.map((line, index) => (
                <div className="invoice-line" key={index}>
                  <label className="line-description">
                    <span>Description</span>
                    <input
                      aria-label={`Line ${index + 1} description`}
                      required
                      value={line.description}
                      onChange={(e) =>
                        setLines(
                          lines.map((l, i) =>
                            i === index
                              ? { ...l, description: e.target.value }
                              : l,
                          ),
                        )
                      }
                    />
                  </label>
                  {(
                    [
                      "quantity",
                      "unitPrice",
                      "discountPercent",
                      "taxPercent",
                    ] as const
                  ).map((key, j) => (
                    <label key={key}>
                      <span>
                        {["Qty", "Unit price", "Discount %", "Tax %"][j]}
                      </span>
                      <input
                        aria-label={`Line ${index + 1} ${key}`}
                        required
                        value={line[key]}
                        inputMode="decimal"
                        onChange={(e) =>
                          setLines(
                            lines.map((l, i) =>
                              i === index ? { ...l, [key]: e.target.value } : l,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Remove line ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines(lines.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                  {/^\d+(\.\d*)?$/.test(line.taxPercent) &&
                    Number(line.taxPercent) > 0 && (
                      <label className="span-2">
                        <span>Transaction jurisdiction</span>
                        <input
                          required
                          value={line.jurisdiction}
                          onChange={(e) =>
                            setLines(
                              lines.map((l, i) =>
                                i === index
                                  ? { ...l, jurisdiction: e.target.value }
                                  : l,
                              ),
                            )
                          }
                        />
                      </label>
                    )}
                  <label className="line-category">
                    <span>Service category</span>
                    <input
                      value={line.serviceCategory}
                      onChange={(e) =>
                        setLines(
                          lines.map((l, i) =>
                            i === index
                              ? { ...l, serviceCategory: e.target.value }
                              : l,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
              <div className="line-footer">
                <button
                  className="button secondary small"
                  type="button"
                  onClick={() =>
                    setLines([
                      ...lines,
                      {
                        description: "",
                        quantity: "1",
                        unitPrice: "",
                        discountPercent: "0",
                        taxPercent: "0",
                        jurisdiction: "",
                        serviceCategory: "Services",
                      },
                    ])
                  }
                >
                  <Plus size={15} />
                  Add line
                </button>
                <strong>
                  Total <span>{currency(total)}</span>
                </strong>
              </div>
              <div className="form-grid">
                {[
                  f("notes", "Notes", "textarea", false, true),
                  f(
                    "paymentInstructions",
                    "Payment instructions",
                    "textarea",
                    false,
                    true,
                  ),
                  f("terms", "Terms and conditions", "textarea", false, true),
                ].map(renderField)}
              </div>
            </>
          )}
          {kind === "payment" && (
            <>
              <div className="section-label">
                Invoice allocations{" "}
                <span>Optional · remainder stays unapplied</span>
              </div>
              {allocations.map((allocation, index) => (
                <div className="allocation" key={index}>
                  <select
                    aria-label={`Invoice allocation ${index + 1}`}
                    required
                    value={allocation.invoiceId}
                    onChange={(e) =>
                      setAllocations(
                        allocations.map((v, i) =>
                          i === index ? { ...v, invoiceId: e.target.value } : v,
                        ),
                      )
                    }
                  >
                    <option value="">Select invoice</option>
                    {state.invoices
                      .filter(
                        (i) =>
                          i.clientId === values.clientId &&
                          i.status === "ISSUED" &&
                          D(i.balance).gt(0),
                      )
                      .map((i) => (
                        <option value={i.id} key={i.id}>
                          {i.number} · {currency(i.balance)} due
                        </option>
                      ))}
                  </select>
                  <input
                    required
                    aria-label={`Allocation amount ${index + 1}`}
                    placeholder="Amount"
                    value={allocation.amount}
                    onChange={(e) =>
                      setAllocations(
                        allocations.map((v, i) =>
                          i === index ? { ...v, amount: e.target.value } : v,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Remove allocation"
                    onClick={() =>
                      setAllocations(allocations.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                className="button secondary small"
                type="button"
                disabled={!values.clientId}
                onClick={() =>
                  setAllocations([
                    ...allocations,
                    { invoiceId: "", amount: "" },
                  ])
                }
              >
                <Plus size={15} />
                Allocate to invoice
              </button>
            </>
          )}
          {kind === "expense" && (
            <>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={review}
                  onChange={(e) => setReview(e.target.checked)}
                />
                Flag for accountant review; deductibility is not assumed
              </label>
              {values.recurringInterval && (
                <p className="notice">
                  <Info size={16} />
                  Recurring expenses post paid expenses automatically on
                  schedule. Use this only for confirmed automatic payments.
                </p>
              )}
            </>
          )}
          {kind === "journal" && (
            <>
              {journalLines.map((line, index) => (
                <div className="allocation" key={index}>
                  <select
                    aria-label={`Journal account ${index + 1}`}
                    value={line.code}
                    onChange={(e) =>
                      setJournalLines(
                        journalLines.map((l, i) =>
                          i === index ? { ...l, code: e.target.value } : l,
                        ),
                      )
                    }
                  >
                    {state.accountBalances.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Debit ${index + 1}`}
                    placeholder="Debit"
                    value={line.debit}
                    onChange={(e) =>
                      setJournalLines(
                        journalLines.map((l, i) =>
                          i === index ? { ...l, debit: e.target.value } : l,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={`Credit ${index + 1}`}
                    placeholder="Credit"
                    value={line.credit}
                    onChange={(e) =>
                      setJournalLines(
                        journalLines.map((l, i) =>
                          i === index ? { ...l, credit: e.target.value } : l,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                className="button secondary small"
                onClick={() =>
                  setJournalLines([
                    ...journalLines,
                    { code: "1000", debit: "0", credit: "0" },
                  ])
                }
              >
                <Plus size={15} />
                Add journal line
              </button>
              <p className="muted">
                Posting is permanent. Correct errors with a reversing
                adjustment.
              </p>
            </>
          )}
          {kind === "tax-payment" && (
            <p className="notice">
              Record owner estimated taxes as an owner tax distribution. Entity
              payments reduce the selected liability; accrue that obligation
              separately with a reviewed journal.
            </p>
          )}
          {error && (
            <div role="alert" className="error-message">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy && <LoaderCircle className="spin" size={15} />}{" "}
            {kind === "invoice"
              ? "Save draft"
              : initial.id
                ? "Save changes"
                : "Save record"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
