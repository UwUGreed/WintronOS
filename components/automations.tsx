"use client";
import { useState } from "react";
import { Card, Table, Badge, Empty, api, dateLabel, today } from "./ui";
import type { WorkspaceData } from "@/lib/workspace-types";
import type { State, Retainer } from "@/lib/client-types";
import type { FormKind } from "./forms";
export function Automations({
  data,
  state,
  reload,
  openForm,
  go,
  ask,
}: {
  data: WorkspaceData;
  state: State;
  reload: () => Promise<void>;
  openForm: (kind: FormKind, initial?: Record<string, unknown>) => void;
  go: (page: string) => void;
  ask: (path: string, title: string) => void;
}) {
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const write = state.actor.role !== "ACCOUNTANT";
  const due = state.retainers.filter(
    (r) =>
      r.status === "ACTIVE" &&
      r.nextInvoiceDate.slice(0, 10) <= today() &&
      (!r.endDate || r.nextInvoiceDate <= r.endDate),
  );
  const dueExpenses = state.expenses.filter(
    (e) =>
      !e.reversedAt &&
      !e.sourceExpenseId &&
      e.nextDate &&
      String(e.nextDate).slice(0, 10) <= today(),
  );
  async function pause(r: Retainer) {
    setBusy(true);
    setError("");
    try {
      await api(`retainers/${r.id}`, {
        ...r,
        hours: r.hours == null ? "" : String(r.hours),
        status: "PAUSED",
        startDate: r.startDate.slice(0, 10),
        endDate: r.endDate?.slice(0, 10) || "",
        nextInvoiceDate: r.nextInvoiceDate.slice(0, 10),
      });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="workspace-intro">
        <p>Understand what runs, when it runs, and what it changes.</p>
        {write && (
          <button
            className="button"
            onClick={() => openForm("retainer", { status: "PAUSED" })}
          >
            Configure billing rule
          </button>
        )}
      </div>
      <Card
        title="When a billing date arrives, prepare a draft invoice"
        action={<Badge value="AVAILABLE" />}
      >
        <div className="automation-explanation">
          <div>
            <small>TRIGGER</small>
            <strong>Recurring billing date</strong>
          </div>
          <div>
            <small>CONDITIONS</small>
            <strong>Active contract · due date reached</strong>
          </div>
          <div>
            <small>ACTION</small>
            <strong>Create draft for review</strong>
          </div>
        </div>
        <p className="inset-copy muted">
          Each contract controls activation. New rules start paused. The
          existing scheduler processes active contracts; it does not send
          invoices or charge clients. Runs also post due recurring expenses
          configured in Money → Expenses. Billing periods are deduplicated on
          retry.
        </p>
        <div className="button-row inset-copy">
          <button
            className="button secondary"
            onClick={() => setPreview(!preview)}
          >
            Preview due billing
          </button>
          {write && (
            <button
              className="button"
              disabled={!due.length && !dueExpenses.length}
              onClick={() => ask("retainers/run", "Run due billing?")}
            >
              Run / retry due billing
            </button>
          )}
          <button className="text-button" onClick={() => go("retainers")}>
            Manage recurring contracts ↗
          </button>
        </div>
        {preview && (
          <div className="preview-box">
            <strong>Preview only · no records created</strong>
            <p>
              {due.length} active contracts are due as of {dateLabel(today())}.
              Each missed eligible billing period creates a separate draft (up
              to 120 periods per contract per run).
            </p>
            <p>
              {dueExpenses.length} recurring expenses are due and will also be
              recorded by this run.
            </p>
            {due.map((r) => (
              <p key={r.id}>
                {r.name} · {r.client.name} · from {dateLabel(r.nextInvoiceDate)}
              </p>
            ))}
          </div>
        )}
        {state.retainers.length ? (
          <Table
            headers={[
              "Rule / contract",
              "Client",
              "Next date",
              "Status",
              "Actions",
            ]}
          >
            {state.retainers.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.client.name}</td>
                <td>{dateLabel(r.nextInvoiceDate)}</td>
                <td>
                  <Badge value={r.status} />
                </td>
                <td>
                  {write && (
                    <div className="button-row">
                      <button
                        className="text-button"
                        onClick={() => openForm("retainer", { ...r })}
                      >
                        Configure
                      </button>
                      {r.status === "ACTIVE" && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => void pause(r)}
                        >
                          Pause
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title="No billing rules yet"
            description="Configure a recurring contract in a paused state. Review its dates and price before changing its status to Active."
          />
        )}
      </Card>
      <Card
        title="When a prospect replies, stop follow-ups and notify me"
        action={<Badge value="SETUP_REQUIRED" />}
      >
        <p className="inset-copy muted">
          This rule is unavailable: this installation has no inbox connection,
          reply event handler, or outbound sequence engine. No follow-ups are
          being sent by this rule.
        </p>
        <button className="button secondary" onClick={() => go("settings")}>
          View integration requirements
        </button>
      </Card>
      <Card title="Run history">
        {state.actor.role !== "OWNER" ? (
          <Empty
            title="Owner access required"
            description="Run history retains the workspace's existing owner-only access. Ask an owner to inspect job details and failures."
          />
        ) : data.jobs.length ? (
          <Table headers={["When", "Job", "Status", "Result"]}>
            {data.jobs.map((j) => (
              <tr key={j.id}>
                <td>{dateLabel(j.createdAt)}</td>
                <td>{j.kind}</td>
                <td>
                  <Badge value={j.status} />
                </td>
                <td className="preserve-lines">{j.detail}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title="No recorded runs"
            description="Scheduler and billing results appear here after they run. Use Preview to inspect due work without changing records."
          />
        )}
      </Card>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
