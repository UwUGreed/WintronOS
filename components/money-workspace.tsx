"use client";
import { useState } from "react";
import { Card, Empty, Table, api, currency, dateLabel } from "./ui";
import { sum } from "@/lib/money";
import type { State } from "@/lib/client-types";
export function MoneySummary({
  state,
  go,
}: {
  state: State;
  go: (page: string, filter?: string) => void;
}) {
  const inPeriod = (v: unknown) =>
    String(v).slice(0, 10) >= state.from.slice(0, 10) &&
    String(v).slice(0, 10) <= state.to.slice(0, 10);
  const gross = sum(
    state.payments.filter((p) => inPeriod(p.receivedAt)).map((p) => p.amount),
  ).toFixed(2);
  const refunds = state.payments.flatMap((p) =>
    p.refunds
      .filter((r) => inPeriod(r.date))
      .map((r) => ({
        id: r.id,
        amount: r.amount,
        date: r.date,
        reason: r.reason,
        client: p.client.name,
      })),
  );
  const [showRefunds, setShowRefunds] = useState(false);
  return (
    <>
      <div className="overview-metrics money-metrics">
        {[
          [
            "Collected payments",
            gross,
            "Received in reporting period",
            "payments",
            "PERIOD",
          ],
          [
            "Outstanding invoices",
            state.outstanding,
            "Current unpaid balances · all dates",
            "invoices",
            "OUTSTANDING",
          ],
          [
            "Overdue invoices",
            state.overdue,
            "Current past-due balances",
            "invoices",
            "OVERDUE",
          ],
          [
            "Accounting revenue",
            state.revenue,
            "Accrual basis · reporting period",
            "reports",
            "ALL",
          ],
        ].map(([l, v, h, p, f]) => (
          <button className="overview-metric" key={l} onClick={() => go(p, f)}>
            <span>{l} ↗</span>
            <strong>{currency(v)}</strong>
            <small>{h}</small>
          </button>
        ))}
      </div>
      <div className="money-definitions">
        <span>
          USD · {dateLabel(state.from)} – {dateLabel(state.to)} ·
          America/New_York
        </span>
        <button
          className="text-button"
          onClick={() => setShowRefunds(!showRefunds)}
        >
          Refunds:{" "}
          {currency(sum(refunds.map((r) => String(r.amount))).toString())} ↗
        </button>
        <span>Net collected: {currency(state.cashCollected)}</span>
      </div>
      {showRefunds && (
        <Card title="Refunds in reporting period">
          {refunds.length ? (
            <Table headers={["Client", "Date", "Amount", "Reason"]}>
              {refunds.map((r) => (
                <tr key={r.id}>
                  <td>{r.client}</td>
                  <td>{dateLabel(r.date)}</td>
                  <td>{currency(r.amount)}</td>
                  <td>{String(r.reason)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="No refunds in this period"
              description="Refunds reduce net collected cash; they are not new payments."
            />
          )}
        </Card>
      )}
      <details className="stage-guide">
        <summary>How to read these numbers & connection status</summary>
        <p>
          Collected payments are recorded receipts before refunds. Net collected
          subtracts refunds dated in this period, including refunds of older
          payments. Accounting revenue comes from posted journals, and may
          differ from cash received.
        </p>
        <p>
          Stripe and bank sync: not connected. No adapter is implemented, and no
          successful synchronization is recorded. Processing fees and bank
          payouts are not separately modeled; they are not included as
          additional sales. Current invoice balances are not historical
          snapshots.
        </p>
      </details>
    </>
  );
}
export function Reconciliation({
  state,
  reload,
}: {
  state: State;
  reload: () => Promise<void>;
}) {
  const [filter, setFilter] = useState("OPEN");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const rows = state.payments.filter(
    (p) =>
      p.receivedAt.slice(0, 10) >= state.from.slice(0, 10) &&
      p.receivedAt.slice(0, 10) <= state.to.slice(0, 10) &&
      (filter === "ALL" || !p.reconciled),
  );
  return (
    <Card title="Match your statement">
      <p className="muted inset-copy">
        Compare each payment with your bank statement, then mark it reconciled.
        This is a manual review flag; it does not import transactions or create
        a new sale.
      </p>
      <div className="table-toolbar">
        <select
          aria-label="Reconciliation filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="OPEN">Unreconciled</option>
          <option value="ALL">All payments in period</option>
        </select>
      </div>
      {rows.length ? (
        <Table headers={["Client", "Date", "Reference", "Amount", "Status"]}>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.client.name}</td>
              <td>{dateLabel(p.receivedAt)}</td>
              <td>{p.reference || "No reference"}</td>
              <td>{currency(p.amount)}</td>
              <td>
                <button
                  className="button secondary small"
                  disabled={!!busy || state.actor.role !== "OWNER"}
                  onClick={async () => {
                    setBusy(p.id);
                    setError("");
                    try {
                      await api(`payments/${p.id}/reconcile`, {
                        reconciled: !p.reconciled,
                      });
                      await reload();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === p.id
                    ? "Saving…"
                    : p.reconciled
                      ? "Reconciled · undo"
                      : "Mark reconciled"}
                </button>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty
          title="No payments to reconcile"
          description="Change the reporting period or record a payment received outside Wintron OS."
        />
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
