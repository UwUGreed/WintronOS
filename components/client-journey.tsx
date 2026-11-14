"use client";
import { IntegrationStatus } from "./integration-status";
import { useState } from "react";
import { Card, Badge, Modal, dateLabel, currency } from "./ui";
import { EditFields } from "./workflow-ui";
import { DocumentLink } from "./document-preview";
import type { Client } from "@/lib/client-types";
import type { FormKind } from "./forms";
export function ClientJourney({
  client,
  write,
  reload,
  openForm,
  openInvoice,
  openTab,
}: {
  client: Client;
  write: boolean;
  reload: () => void | Promise<void>;
  openForm: (kind: FormKind, initial?: Record<string, unknown>) => void;
  openInvoice: (id: string) => void;
  openTab: (tab: string) => void;
}) {
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(
    null,
  );
  const timeline = [
    ...(client.opportunities || []).map((o) => ({
      id: o.id,
      date: o.createdAt,
      kind: "Opportunity",
      label: `${o.name} · ${o.stage.toLowerCase()}`,
      action: () =>
        location.assign(`/?module=pipeline&record=${encodeURIComponent(o.id)}`),
    })),
    ...(client.proposals || []).map((p) => ({
      id: p.id,
      date: p.createdAt,
      kind: "Draft proposal",
      label: p.title,
      action: () => setProposal(p),
    })),
    ...(client.notes || []).map((n) => ({
      id: n.id,
      date: n.createdAt,
      kind: "Note",
      label: n.title,
      action: () => openTab("Notes"),
    })),
    ...(client.projects || []).map((p) => ({
      id: p.id,
      date: String(p.createdAt),
      kind: "Project",
      label: String(p.name),
      action: () =>
        location.assign(`/?module=projects&record=${encodeURIComponent(p.id)}`),
    })),
    ...(client.documents || []).map((d) => ({
      id: d.id,
      date: String(d.createdAt),
      kind: "Document",
      label: String(d.name),
      action: () => openTab("Files"),
    })),
    ...(client.invoices || []).map((i) => ({
      id: i.id,
      date: String(i.createdAt || i.issueDate),
      kind: "Invoice",
      label: `${i.number || "Draft"} · ${i.displayStatus.toLowerCase()} · ${currency(i.total)}`,
      action: () => openInvoice(i.id),
    })),
    ...(client.payments || []).map((p) => ({
      id: p.id,
      date: p.receivedAt,
      kind: "Payment recorded",
      label: `${currency(p.amount)} · ${p.method}`,
      action: () => openTab("Payments"),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <div className="journey-steps">
        <button onClick={() => openTab("Overview")}>
          <small>01 · RELATIONSHIP</small>
          <strong>{client.status.toLowerCase()}</strong>
        </button>
        <button onClick={() => setProposal({ clientId: client.id })}>
          <small>02 · PROPOSAL</small>
          <strong>{client.proposals?.length || 0} drafts</strong>
        </button>
        <button onClick={() => openTab("Files")}>
          <small>03 · CONTRACT</small>
          <strong>Signature not tracked</strong>
        </button>
        <button onClick={() => openTab("Invoices")}>
          <small>04 · INVOICE</small>
          <strong>{client.invoices?.length || 0} records</strong>
        </button>
        <button onClick={() => openTab("Payments")}>
          <small>05 · PAYMENT</small>
          <strong>{client.payments?.length || 0} receipts</strong>
        </button>
      </div>
      <div className="two-columns">
        <Card title="Relationship timeline">
          <div className="record-list">
            {timeline.map((t) => (
              <button key={t.kind + t.id} onClick={t.action}>
                <span className="record-dot" />
                <span>
                  <small>
                    {t.kind} · {dateLabel(t.date)}
                  </small>
                  <strong>{t.label}</strong>
                </span>
                <span>↗</span>
              </button>
            ))}
            {!timeline.length && (
              <p className="inset-copy muted">
                This relationship is ready for its first next step. Prepare a
                proposal, add a note, or upload a document.
              </p>
            )}
          </div>
        </Card>
        <Card title="Move the relationship forward">
          <p className="muted">
            Prepare the scope, keep supporting files, then bill the agreed work.
            Drafts do not imply acceptance; uploaded contracts do not imply a
            signature.
          </p>
          {write && (
            <div className="journey-actions">
              <button
                className="button"
                onClick={() => setProposal({ clientId: client.id })}
              >
                Prepare proposal
              </button>
              <button
                className="button secondary"
                onClick={() => openTab("Files")}
              >
                Upload / view contract
              </button>
              <button
                className="button secondary"
                onClick={() => openForm("invoice", { clientId: client.id })}
              >
                Create invoice
              </button>
              <button
                className="button secondary"
                onClick={() => openForm("project", { clientId: client.id })}
              >
                Start project
              </button>
              <button
                className="text-button"
                onClick={() => openForm("note", { clientId: client.id })}
              >
                Add relationship note
              </button>
            </div>
          )}
          <div className="integration-inline">
            <IntegrationStatus state="UNDER_DEVELOPMENT" />
            <p className="muted small-text">
              Email conversations, proposal delivery and acceptance, and
              electronic signatures are under development. Proposals saved here
              are internal drafts.
            </p>
          </div>
          {client.documents?.map((d) => (
            <div className="timeline-note" key={d.id}>
              <DocumentLink document={d} label={String(d.name)} />
            </div>
          ))}
        </Card>
      </div>
      {proposal && (
        <Modal
          title={proposal.id ? String(proposal.title) : "Prepare proposal"}
          description="Internal draft only. Sending, acceptance, and signatures are not tracked."
          onClose={() => setProposal(null)}
        >
          <div className="modal-body">
            <Badge value="DRAFT" />
            {write ? (
              <EditFields
                fields={[
                  {
                    key: "clientId",
                    label: "Client",
                    options: [[client.id, client.name]],
                  },
                  { key: "title", label: "Proposal title", required: true },
                  {
                    key: "content",
                    label: "Scope, deliverables, and proposed terms",
                    required: true,
                    type: "textarea",
                  },
                ]}
                initial={proposal}
                endpoint={`proposals${proposal.id ? "/" + proposal.id : ""}`}
                submit="Save draft proposal"
                onSaved={async () => {
                  await reload();
                  setProposal(null);
                }}
              />
            ) : (
              <p className="preserve-lines">
                {String(proposal.content || "No proposal selected.")}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
