"use client";
import { useEffect, useState } from "react";
import {
  Download,
  Send,
  Copy,
  Check,
  FileText,
  Plus,
  Upload,
  ArrowLeft,
  ExternalLink,
  Pencil,
  Users,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Clock,
} from "lucide-react";
import {
  Modal,
  Card,
  Table,
  Empty,
  Badge,
  api,
  currency,
  dateLabel,
  today,
} from "./ui";
import type { Client, State, Row, Invoice } from "@/lib/client-types";
import type { FormKind } from "./forms";
import { InvoiceTable } from "./dashboard";
export function InvoiceDetail({
  invoice,
  state,
  onClose,
  openForm,
  perform,
  ask,
}: {
  invoice: Invoice;
  state: State;
  onClose: () => void;
  openForm: (kind: FormKind, initial?: Record<string, unknown>) => void;
  perform: (path: string, data?: unknown) => Promise<void>;
  ask: (path: string, title: string, reason?: boolean) => void;
}) {
  const write = state.actor.role !== "ACCOUNTANT";
  const snapshot = invoice.snapshot as {
    client: { name: string; billingAddress: string; email: string };
  } | null;
  const billedClient = snapshot?.client || invoice.client;
  return (
    <Modal
      title={invoice.number || "Draft invoice"}
      description={invoice.description}
      onClose={onClose}
      wide
    >
      <div className="modal-body invoice-preview">
        <div className="detail-top">
          <div>
            <span className="eyebrow">BILL TO</span>
            <h2>{billedClient.name}</h2>
            <p className="muted">
              {billedClient.billingAddress || "No billing address configured"}
            </p>
            <p className="muted">{billedClient.email}</p>
          </div>
          <div className="align-right">
            <Badge value={invoice.displayStatus} />
            <p className="muted">Issued {dateLabel(invoice.issueDate)}</p>
            <p className="muted">Due {dateLabel(invoice.dueDate)}</p>
          </div>
        </div>
        <Table
          headers={[
            "Service",
            "Quantity",
            "Unit price",
            "Discount",
            "Tax",
            "Total",
          ]}
        >
          {invoice.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description}</td>
              <td>{l.quantity}</td>
              <td>{currency(l.unitPrice)}</td>
              <td>{l.discountPercent}%</td>
              <td>{l.taxPercent}%</td>
              <td>{currency(l.total)}</td>
            </tr>
          ))}
        </Table>
        <div className="invoice-totals">
          <p>
            Subtotal <strong>{currency(invoice.subtotal)}</strong>
          </p>
          <p>
            Discount <strong>−{currency(invoice.discount)}</strong>
          </p>
          <p>
            Sales tax <strong>{currency(invoice.tax)}</strong>
          </p>
          <p className="total">
            Total <strong>{currency(invoice.total)}</strong>
          </p>
          <p>
            Remaining balance <strong>{currency(invoice.balance)}</strong>
          </p>
        </div>
        {invoice.notes && <p>{invoice.notes}</p>}
        {invoice.paymentInstructions && (
          <p className="notice">{invoice.paymentInstructions}</p>
        )}
        <div className="button-row">
          <a
            className="button secondary"
            href={`/api/invoices/${invoice.id}/pdf`}
          >
            <Download size={16} />
            Download PDF
          </a>
          <button className="button secondary" onClick={() => window.print()}>
            Print
          </button>
          {write && (
            <>
              <button
                className="button secondary"
                onClick={() => perform(`invoices/${invoice.id}/duplicate`, {})}
              >
                <Copy size={16} />
                Duplicate
              </button>
              {invoice.status === "DRAFT" ? (
                <>
                  <button
                    className="button secondary"
                    onClick={() => {
                      onClose();
                      openForm("invoice", invoice);
                    }}
                  >
                    <Pencil size={16} />
                    Edit draft
                  </button>
                  <button
                    className="button"
                    onClick={() =>
                      ask(`invoices/${invoice.id}/issue`, "Issue this invoice?")
                    }
                  >
                    <Check size={16} />
                    Issue invoice
                  </button>
                </>
              ) : (
                invoice.status === "ISSUED" && (
                  <>
                    <button
                      className="button secondary"
                      onClick={() =>
                        ask(
                          `invoices/${invoice.id}/send`,
                          "Send this invoice by email?",
                        )
                      }
                    >
                      <Send size={16} />
                      Send email
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        openForm("delivery", {
                          invoiceId: invoice.id,
                          recipient: invoice.client.email,
                          status: "SENT",
                        })
                      }
                    >
                      Record delivery
                    </button>
                    {Number(invoice.balance) > 0 && (
                      <button
                        className="button"
                        onClick={() =>
                          openForm("payment", {
                            clientId: invoice.clientId,
                            invoiceId: invoice.id,
                            amount: invoice.balance,
                          })
                        }
                      >
                        Record payment
                      </button>
                    )}
                    {state.actor.role === "OWNER" && (
                      <button
                        className="button danger secondary"
                        onClick={() =>
                          ask(
                            `invoices/${invoice.id}/void`,
                            "Void this invoice?",
                            true,
                          )
                        }
                      >
                        Void invoice
                      </button>
                    )}
                  </>
                )
              )}
            </>
          )}
        </div>
        {invoice.deliveries.length > 0 && (
          <>
            <h3 className="section-label">Delivery history</h3>
            <Table headers={["Date", "Recipient", "Status"]}>
              {invoice.deliveries.map((d) => (
                <tr key={d.id}>
                  <td>{dateLabel(d.createdAt)}</td>
                  <td>{String(d.recipient)}</td>
                  <td>
                    <Badge value={String(d.status)} />
                  </td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </div>
    </Modal>
  );
}
export function ClientDetail({
  id,
  state,
  onClose,
  openForm,
  openInvoice,
  revision,
  onError,
}: {
  id: string;
  state: State;
  onClose: () => void;
  openForm: (kind: FormKind, initial?: Record<string, unknown>) => void;
  openInvoice: (id: string) => void;
  revision: number;
  onError: (message: string) => void;
}) {
  const [client, setClient] = useState<Client | null>(null);
  const [tab, setTab] = useState("Overview");
  const [uploading, setUploading] = useState(false);
  const [history, setHistory] = useState<Row[] | null>(null);
  const write = state.actor.role !== "ACCOUNTANT";
  const load = () =>
    api<Client>("clients/" + id)
      .then(setClient)
      .catch((e) => onError(e.message));
  useEffect(() => {
    void load();
  }, [id, revision]);
  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const data = new FormData();
      data.set("file", file);
      data.set("clientId", id);
      const r = await fetch("/api/documents", { method: "POST", body: data });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      await load();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  if (!client) return <div className="skeleton dashboard-skeleton" />;
  return (
    <>
      <button className="text-button back-button" onClick={onClose}>
        <ArrowLeft size={15} />
        All clients
      </button>
      <div className="profile-banner">
        <div className="company-avatar">
          {client.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h1>{client.name}</h1>
          <p>
            {client.industry || "Business client"} <span>·</span> Client since{" "}
            {dateLabel(client.createdAt)}
          </p>
        </div>
        <Badge value={client.status} />
        {write && (
          <button
            className="button secondary"
            onClick={() => openForm("client", client)}
          >
            <Pencil size={16} />
            Edit client
          </button>
        )}
      </div>
      <div className="tabs" role="tablist" aria-label="Client sections">
        {[
          "Overview",
          "Notes",
          "Invoices",
          "Payments",
          "Projects",
          "Retainers",
          "Files",
          "Activity",
        ].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Overview" && (
        <div className="two-columns">
          <Card title="Client details" icon={<Users size={19} />}>
            <dl className="detail-list">
              <dt>Primary contact</dt>
              <dd>{client.contactName || "Not provided"}</dd>
              <dt>Email</dt>
              <dd>{client.email || "Not provided"}</dd>
              <dt>Phone</dt>
              <dd>{client.phone || "Not provided"}</dd>
              <dt>Website</dt>
              <dd>
                {client.website ? (
                  <a href={client.website} target="_blank" rel="noreferrer">
                    {client.website}
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  "Not provided"
                )}
              </dd>
              <dt>Billing address</dt>
              <dd>{client.billingAddress || "Not provided"}</dd>
              <dt>Payment terms</dt>
              <dd>Net {client.paymentTerms}</dd>
              <dt>Tags</dt>
              <dd>{client.tags.join(", ") || "None"}</dd>
            </dl>
          </Card>
          <Card
            title="Additional contacts"
            action={
              write && (
                <button
                  className="text-button"
                  onClick={() => openForm("contact", { clientId: id })}
                >
                  <Plus size={14} />
                  Add contact
                </button>
              )
            }
          >
            {client.contacts?.length ? (
              <Table headers={["Name", "Email", "Role"]}>
                {client.contacts.map((c) => (
                  <tr key={c.id}>
                    <td>{String(c.name)}</td>
                    <td>{String(c.email)}</td>
                    <td>{String(c.title)}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty
                title="Keep the right people connected"
                description="Add billing and project contacts for this client."
              />
            )}
          </Card>
        </div>
      )}
      {tab === "Notes" && (
        <Card
          title="Client notes"
          icon={<FileText size={19} />}
          action={
            write && (
              <button
                className="button small"
                onClick={() => openForm("note", { clientId: id })}
              >
                <Plus size={15} />
                Add note
              </button>
            )
          }
        >
          {client.notes?.length ? (
            <div className="notes-grid">
              {client.notes.map((n) => (
                <article className="note-card" key={n.id}>
                  <div className="card-heading">
                    <h3>{n.title}</h3>
                    {write && (
                      <button
                        className="icon-button"
                        aria-label="Edit note"
                        onClick={() => openForm("note", { ...n, clientId: id })}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </div>
                  <div
                    className="rich-note"
                    dangerouslySetInnerHTML={{ __html: n.content }}
                  />
                  <small>
                    {dateLabel(n.updatedAt)} · Author {n.authorId.slice(0, 8)}
                  </small>
                  {n.revisions.length > 0 && (
                    <button
                      className="text-button"
                      onClick={() => setHistory(n.revisions)}
                    >
                      View edit history ({n.revisions.length})
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Start the conversation"
              description="Capture discovery findings, meeting summaries, and next steps."
            />
          )}
          <p className="muted small-text">
            Store credentials in your secrets manager, never in client notes.
          </p>
        </Card>
      )}
      {tab === "Invoices" && (
        <Card
          title="Client invoices"
          action={
            write && (
              <button
                className="button small"
                onClick={() => openForm("invoice", { clientId: id })}
              >
                <Plus size={15} />
                Create invoice
              </button>
            )
          }
        >
          {client.invoices?.length ? (
            <InvoiceTable invoices={client.invoices} onOpen={openInvoice} />
          ) : (
            <Empty
              title="No invoices yet"
              description="Your client's billing history will appear here."
            />
          )}
        </Card>
      )}
      {tab === "Payments" && (
        <Card title="Payments">
          {client.payments?.length ? (
            <Table headers={["Received", "Amount", "Method", "Reference"]}>
              {client.payments.map((p) => (
                <tr key={p.id}>
                  <td>{dateLabel(p.receivedAt)}</td>
                  <td>{currency(p.amount)}</td>
                  <td>{p.method}</td>
                  <td>{p.reference || "—"}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="No payments recorded"
              description="Record externally received payments against invoices or as unapplied cash."
            />
          )}
        </Card>
      )}
      {tab === "Projects" && (
        <Card
          title="Projects"
          icon={<Briefcase size={19} />}
          action={
            write && (
              <button
                className="button small"
                onClick={() => openForm("project", { clientId: id })}
              >
                <Plus size={15} />
                Add project
              </button>
            )
          }
        >
          {client.projects?.length ? (
            <Table headers={["Project", "Description", "Status", "Due"]}>
              {client.projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    {write ? (
                      <button
                        className="text-button"
                        onClick={() =>
                          openForm("project", { ...p, clientId: id })
                        }
                      >
                        {String(p.name)}
                      </button>
                    ) : (
                      String(p.name)
                    )}
                  </td>
                  <td>{String(p.description)}</td>
                  <td>
                    <Badge value={String(p.status)} />
                  </td>
                  <td>{dateLabel(p.dueDate)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="Room for your next project"
              description="Track engagements and delivery dates alongside the client."
            />
          )}
        </Card>
      )}
      {tab === "Retainers" && (
        <Card
          title="Recurring contracts"
          action={
            write && (
              <button
                className="button small"
                onClick={() => openForm("retainer", { clientId: id })}
              >
                <Plus size={15} />
                Add retainer
              </button>
            )
          }
        >
          {client.retainers?.length ? (
            <Table headers={["Contract", "Price", "Frequency", "Status"]}>
              {client.retainers.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{currency(r.amount)}</td>
                  <td>{r.frequency}</td>
                  <td>
                    <Badge value={r.status} />
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="No recurring contracts"
              description="Connect ongoing services to this client."
            />
          )}
        </Card>
      )}
      {tab === "Files" && (
        <Card
          title="Private client files"
          action={
            write && (
              <label className="button small upload-label">
                <Upload size={15} />
                {uploading ? "Uploading…" : "Upload file"}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.docx"
                  disabled={uploading}
                  onChange={(e) =>
                    e.target.files?.[0] && void uploadFile(e.target.files[0])
                  }
                />
              </label>
            )
          }
        >
          {client.documents?.length ? (
            <Table headers={["File", "Size", "Uploaded", ""]}>
              {client.documents.map((d) => (
                <tr key={d.id}>
                  <td>{String(d.name)}</td>
                  <td>{Math.ceil(Number(d.size) / 1024)} KB</td>
                  <td>{dateLabel(d.createdAt)}</td>
                  <td>
                    <a className="text-button" href={"/api/documents/" + d.id}>
                      <Download size={15} />
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="A home for your client documents"
              description="Upload contracts, proposals, and discovery documents. PDF, images, and DOCX up to 10 MB."
            />
          )}
        </Card>
      )}
      {tab === "Activity" && (
        <Card title="Client activity" icon={<Clock size={19} />}>
          <div className="activity-feed">
            {client.activity?.map((e) => (
              <div className="activity-item" key={e.id}>
                <span className="activity-icon blue">
                  <FileText size={16} />
                </span>
                <div>
                  <p>{e.summary}</p>
                  <small>{dateLabel(e.createdAt)}</small>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {history && (
        <Modal title="Note edit history" onClose={() => setHistory(null)}>
          <div className="modal-body">
            {history.map((r) => (
              <article className="note-card" key={r.id}>
                <strong>{String(r.title)}</strong>
                <div dangerouslySetInnerHTML={{ __html: String(r.content) }} />
                <small>{dateLabel(r.createdAt)}</small>
              </article>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
