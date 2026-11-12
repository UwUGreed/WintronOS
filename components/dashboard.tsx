"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  BarChart3,
  FileText,
  ShieldCheck,
  Users,
  Landmark,
  RefreshCw,
  Zap,
  StickyNote,
  Receipt,
  Plus,
  ArrowUpRight,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { Card, Badge, Empty, Table, ViewAll, currency, dateLabel } from "./ui";
import type { State, Invoice } from "@/lib/client-types";
import type { FormKind } from "./forms";
import { D, isOverdueInvoice } from "@/lib/money";
export function RevenueChart({ state }: { state: State }) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={state.monthly.map((m) => ({
            ...m,
            revenue: Number(m.revenue),
          }))}
          margin={{ top: 12, right: 3, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="revenueBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#469bff" />
              <stop offset="100%" stopColor="#1761cf" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#203044" />
          <XAxis
            dataKey="month"
            tick={{ fill: "#90a4c1", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            dy={8}
          />
          <YAxis
            tick={{ fill: "#90a4c1", fontSize: 10 }}
            tickFormatter={(v) => (v >= 1000 ? `$${v / 1000}k` : `$${v}`)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "#13233a" }}
            contentStyle={{
              background: "#132033",
              border: "1px solid #2d425e",
              borderRadius: 8,
              color: "#edf4ff",
            }}
            formatter={(v) => [currency(v), "Recognized revenue"]}
          />
          <Bar
            dataKey="revenue"
            isAnimationActive={false}
            fill="url(#revenueBlue)"
            radius={[3, 3, 0, 0]}
            maxBarSize={33}
          />
        </BarChart>
      </ResponsiveContainer>
      {state.monthly.every((m) => D(m.revenue).isZero()) && (
        <div className="chart-empty">
          <span>Revenue will appear here</span>
          <small>Issue your first invoice to start tracking revenue.</small>
        </div>
      )}
    </div>
  );
}
export function InvoiceTable({
  invoices,
  onOpen,
}: {
  invoices: Invoice[];
  onOpen: (id: string) => void;
}) {
  return (
    <Table
      headers={[
        "Invoice #",
        "Client",
        "Description",
        "Invoice total",
        "Balance due",
        "Status",
        "Due date",
      ]}
    >
      {invoices.map((i) => (
        <tr key={i.id}>
          <td>
            <button className="table-link" onClick={() => onOpen(i.id)}>
              {i.number || "Draft invoice"}
            </button>
          </td>
          <td>{i.client.name}</td>
          <td className="muted truncate">{i.description}</td>
          <td className="money">{currency(i.total)}</td>
          <td className="money">{currency(i.balance)}</td>
          <td>
            <Badge value={i.displayStatus} />
            {i.displayStatus !== "OVERDUE" && isOverdueInvoice(i) && (
              <Badge value="OVERDUE" />
            )}
          </td>
          <td className="muted nowrap">{dateLabel(i.dueDate)}</td>
        </tr>
      ))}
    </Table>
  );
}
export function Dashboard({
  state,
  go,
  openForm,
  openInvoice,
  onActivity,
}: {
  state: State;
  go: (page: string) => void;
  openForm: (kind: FormKind) => void;
  openInvoice: (id: string) => void;
  onActivity: () => void;
}) {
  const latest = state.monthly.at(-1);
  const previous = state.monthly.at(-2);
  const trend =
    latest && previous && !D(previous.revenue).isZero()
      ? D(latest.revenue)
          .minus(previous.revenue)
          .div(D(previous.revenue).abs())
          .mul(100)
          .toFixed(0)
      : null;
  const activeClients = state.clients.filter((c) => c.status === "ACTIVE");
  const metrics = [
    {
      label: "Period revenue",
      value: currency(state.revenue),
      hint: "Accrual · issued invoices",
      icon: BarChart3,
      color: "blue",
      trend: trend ? `${D(trend).gte(0) ? "+" : ""}${trend}% this month` : null,
      page: "reports",
    },
    {
      label: "Outstanding invoices",
      value: currency(state.outstanding),
      hint: `${state.unpaidCount} unpaid ${state.unpaidCount === 1 ? "invoice" : "invoices"}`,
      icon: FileText,
      color: "red",
      trend: null,
      page: "invoices",
    },
    {
      label: "Tax reserve target",
      value: state.taxConfig ? currency(state.reserveTarget) : "Not configured",
      hint: "Planning estimate · not a liability",
      icon: ShieldCheck,
      color: "green",
      trend: null,
      page: "taxes",
    },
    {
      label: "Active clients",
      value: String(activeClients.length),
      hint: "Business relationships",
      icon: Users,
      color: "blue",
      trend: null,
      page: "clients",
    },
  ];
  return (
    <>
      <div className="metrics">
        {metrics.map((m) => (
          <button
            className={`metric card ${m.color}`}
            key={m.label}
            onClick={() => go(m.page)}
          >
            <div className="metric-icon">
              <m.icon size={25} strokeWidth={2} />
            </div>
            <div className="metric-text">
              <p>{m.label}</p>
              <strong
                className={m.value === "Not configured" ? "unconfigured" : ""}
              >
                {m.value}
              </strong>
              <small>{m.hint}</small>
            </div>
            {m.trend && (
              <span
                className={`trend ${m.trend.startsWith("-") ? "negative" : ""}`}
              >
                {m.trend}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="dashboard-columns">
        <div className="dashboard-primary">
          <Card
            title="Revenue"
            icon={<BarChart3 size={19} />}
            action={<span className="subtle-pill">Last 12 months</span>}
          >
            <div className="revenue-number">
              {currency(state.revenue)} <span>USD</span>
            </div>
            <p className="muted revenue-description">
              Recognized revenue · {dateLabel(state.from)} –{" "}
              {dateLabel(state.to)}
            </p>
            <RevenueChart state={state} />
          </Card>
          <Card
            title="Recent invoices"
            icon={<FileText size={19} />}
            action={<ViewAll onClick={() => go("invoices")} />}
          >
            {state.invoices.length ? (
              <InvoiceTable
                invoices={state.invoices.slice(0, 5)}
                onOpen={openInvoice}
              />
            ) : (
              <Empty
                title="Your next invoice starts here"
                description="Create a draft, add your services, and get ready to bill."
                action="Create invoice"
                onAction={() => openForm("invoice")}
              />
            )}
          </Card>
          <Card
            title="Retainers & recurring contracts"
            icon={<RefreshCw size={19} />}
            action={<ViewAll onClick={() => go("retainers")} />}
          >
            {state.retainers.length ? (
              <Table
                headers={[
                  "Client",
                  "Service",
                  "Amount",
                  "Billing cycle",
                  "Next invoice",
                  "Status",
                ]}
              >
                {state.retainers.slice(0, 4).map((r) => (
                  <tr key={r.id}>
                    <td>{r.client.name}</td>
                    <td>{r.name}</td>
                    <td className="money">{currency(r.amount)}</td>
                    <td className="muted">{r.frequency.toLowerCase()}</td>
                    <td className="muted nowrap">
                      {dateLabel(r.nextInvoiceDate)}
                    </td>
                    <td>
                      <Badge value={r.status} />
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty
                title="Build predictable revenue"
                description="Keep ongoing services and billing schedules in one place."
                action="Add retainer"
                onAction={() => openForm("retainer")}
              />
            )}
          </Card>
        </div>
        <div className="dashboard-secondary">
          <Card
            title="Tax overview"
            icon={<Landmark size={20} />}
            action={<span className="subtle-pill">South Carolina</span>}
          >
            <div className="tax-summary">
              <div>
                <strong>
                  {state.taxConfig ? currency(state.reserveTarget) : "—"}
                </strong>
                <p className="muted">Estimated reserve target</p>
              </div>
              <span className="badge gray">Provisional</span>
            </div>
            <div className="tax-rows">
              {[
                ["Federal reserve", "federal", "blue"],
                ["South Carolina reserve", "state", "purple"],
                ["Self-employment reserve", "selfEmployment", "orange"],
              ].map(([label, key, color]) => (
                <div key={key}>
                  <span>
                    <i className={`dot ${color}`} />
                    {label}
                  </span>
                  <strong>
                    {state.reserves
                      ? currency(
                          state.reserves[key as keyof typeof state.reserves],
                        )
                      : "—"}
                  </strong>
                </div>
              ))}
            </div>
            <button className="state-context" onClick={() => go("taxes")}>
              <div className="state-mark">
                <MapPin size={30} />
              </div>
              <div>
                <strong>South Carolina context</strong>
                <p>
                  {state.taxConfig
                    ? "Reserve assumptions are configurable. Review owner residency and tax classification with your accountant."
                    : "Set your tax classification and reserve assumptions to begin planning. No tax rates are assumed."}
                </p>
              </div>
              <ArrowRight size={16} />
            </button>
          </Card>
          <Card
            title="Recent activity"
            icon={<StickyNote size={19} />}
            action={<ViewAll onClick={onActivity} />}
          >
            {state.activity.length ? (
              <div className="activity-feed">
                {state.activity.slice(0, 5).map((event, index) => (
                  <div className="activity-item" key={event.id}>
                    <span
                      className={`activity-icon ${["blue", "green", "purple"][index % 3]}`}
                    >
                      {event.entityType === "PAYMENT" ? (
                        <span>$</span>
                      ) : event.entityType === "RETAINER" ? (
                        <RefreshCw size={17} />
                      ) : (
                        <FileText size={17} />
                      )}
                    </span>
                    <div>
                      <p>{event.summary}</p>
                      <small>
                        {dateLabel(event.createdAt)} ·{" "}
                        {event.entityType.toLowerCase().replaceAll("_", " ")}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="A clear view of every change"
                description="Client updates, invoices, and payments will appear in your activity feed."
              />
            )}
          </Card>
          <Card title="Quick actions" icon={<Zap size={19} />}>
            <div className="quick-actions">
              {(
                [
                  { label: "Create invoice", kind: "invoice", Icon: FileText },
                  { label: "Add client", kind: "client", Icon: Users },
                  { label: "Record expense", kind: "expense", Icon: Receipt },
                  { label: "Add note", kind: "note", Icon: StickyNote },
                ] as const
              ).map((a) => (
                <button
                  key={a.kind}
                  className="button secondary"
                  onClick={() => openForm(a.kind)}
                  disabled={state.actor.role === "ACCOUNTANT"}
                >
                  <a.Icon size={17} />
                  {a.label}
                </button>
              ))}
            </div>
          </Card>
          <div className="secure-caption">
            <ShieldCheck size={13} /> Private workspace <span>•</span> Your
            business, connected.
          </div>
        </div>
      </div>
    </>
  );
}
