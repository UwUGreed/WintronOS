"use client";
import { IntegrationStatus } from "./integration-status";
import {
  ArrowUpRight,
  CircleCheck,
  Search,
  Wallet,
  Clock,
  TriangleAlert,
} from "lucide-react";
import { Card, Empty, Badge, currency, dateLabel, today } from "./ui";
import { sum, isOverdueInvoice } from "@/lib/money";
import type { State } from "@/lib/client-types";
import type { WorkspaceData } from "@/lib/workspace-types";
import type { FormKind } from "./forms";
export function Overview({
  state,
  data,
  go,
  openInvoice,
  openForm,
  onActivity,
}: {
  state: State;
  data: WorkspaceData;
  go: (page: string, filter?: string, record?: string) => void;
  openInvoice: (id: string) => void;
  openForm: (kind: FormKind) => void;
  onActivity: () => void;
}) {
  const tasks = data.projects.flatMap((p) =>
    p.tasks
      .filter(
        (t) => !t.completed && t.dueDate && t.dueDate.slice(0, 10) <= today(),
      )
      .map((t) => ({ ...t, project: p.name })),
  );
  const followUps = data.opportunities.filter(
    (o) =>
      !["WON", "LOST"].includes(o.stage) &&
      o.followUp &&
      o.followUp.slice(0, 10) <= today(),
  );
  const overdue = state.invoices.filter((i) => isOverdueInvoice(i));
  const recent = state.payments.filter(
    (p) =>
      p.receivedAt.slice(0, 10) >= state.from.slice(0, 10) &&
      p.receivedAt.slice(0, 10) <= state.to.slice(0, 10),
  );
  const failures = data.jobs.filter((j) => j.status === "FAILED");
  return (
    <>
      <div className="overview-intro">
        <span className="eyebrow">YOUR BUSINESS, IN FOCUS</span>
        <h2>A clear view. A next move.</h2>
        <p>From the first conversation to the final payment.</p>
        <button className="button secondary" onClick={() => go("prospecting")}>
          <Search size={16} />
          Open Prospecting <ArrowUpRight size={15} />
        </button>
      </div>
      <div className="overview-metrics">
        {[
          {
            label: "Needs follow-up",
            value: String(tasks.length + followUps.length),
            hint: `${tasks.length} tasks · ${followUps.length} opportunities`,
            page: tasks.length ? "projects" : "pipeline",
            filter: "DUE",
            icon: <Clock size={17} />,
          },
          {
            label: "Outstanding invoices",
            value: currency(state.outstanding),
            hint: "Current unpaid balances · all dates",
            page: "invoices",
            filter: "OUTSTANDING",
            icon: <Wallet size={17} />,
          },
          {
            label: "Overdue invoices",
            value: currency(state.overdue),
            hint: `${overdue.length} past due · current balances`,
            page: "invoices",
            filter: "OVERDUE",
            icon: <TriangleAlert size={17} />,
          },
          {
            label: "Collected payments",
            value: currency(sum(recent.map((p) => p.amount)).toString()),
            hint: "Received in period · before refunds",
            page: "payments",
            filter: "PERIOD",
            icon: <CircleCheck size={17} />,
          },
        ].map((m) => (
          <button
            className="overview-metric"
            key={m.label}
            onClick={() => go(m.page, m.filter)}
          >
            <span>
              {m.icon}
              {m.label}
              <ArrowUpRight size={14} />
            </span>
            <strong>{m.value}</strong>
            <small>{m.hint}</small>
          </button>
        ))}
      </div>
      <p className="period-caption">
        USD · {dateLabel(state.from)} – {dateLabel(state.to)} ·
        America/New_York. Invoice balances are current, regardless of reporting
        period.
      </p>
      <div className="overview-grid">
        <Card
          title="Today & overdue"
          action={
            <button className="text-button" onClick={() => go("projects")}>
              View work ↗
            </button>
          }
        >
          {tasks.length || followUps.length ? (
            <div className="record-list">
              {tasks.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  onClick={() => go("projects", "ALL", t.projectId)}
                >
                  <span className="record-dot" />
                  <span>
                    <strong>{t.title}</strong>
                    <small>
                      {t.project} · {t.ownerName || "Unassigned"}
                    </small>
                  </span>
                  <small>{dateLabel(t.dueDate)}</small>
                </button>
              ))}
              {followUps.slice(0, 6).map((o) => (
                <button key={o.id} onClick={() => go("pipeline", "ALL", o.id)}>
                  <span className="record-dot blue" />
                  <span>
                    <strong>{o.name}</strong>
                    <small>
                      Opportunity follow-up · {o.ownerName || "Unassigned"}
                    </small>
                  </span>
                  <small>{dateLabel(o.followUp)}</small>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="Nothing due today"
              description="Dated project tasks and opportunity follow-ups appear here when they need your attention."
            />
          )}
        </Card>
        <Card
          title="Prospecting activity"
          action={
            <button className="text-button" onClick={() => go("prospecting")}>
              Open workspace ↗
            </button>
          }
        >
          <div className="funnel-stats">
            <button onClick={() => go("prospecting")}>
              <strong>{data.prospects.length}</strong>
              <span>Saved prospects</span>
            </button>
            <button onClick={() => go("prospecting", "QUALIFIED")}>
              <strong>
                {data.prospects.filter((p) => p.status === "QUALIFIED").length}
              </strong>
              <span>Qualified</span>
            </button>
            <button onClick={() => go("pipeline", "OPEN")}>
              <strong>
                {
                  data.opportunities.filter(
                    (o) => !["WON", "LOST"].includes(o.stage),
                  ).length
                }
              </strong>
              <span>Open opportunities</span>
            </button>
          </div>
          <p className="muted inset-copy">
            {data.integrations.leadProvider
              ? "Search public business websites in Prospecting, then review and save sources to build your pipeline."
              : "Lead discovery: setup required. Configure Tavily in Settings, or add researched businesses and their sources manually."}
          </p>
        </Card>
        <Card
          title="Invoices needing attention"
          action={
            <button
              className="text-button"
              onClick={() => go("invoices", "OUTSTANDING")}
            >
              View outstanding ↗
            </button>
          }
        >
          {state.invoices.filter(
            (i) =>
              Number(i.balance) > 0 && !["DRAFT", "VOID"].includes(i.status),
          ).length ? (
            <div className="record-list">
              {state.invoices
                .filter(
                  (i) =>
                    Number(i.balance) > 0 &&
                    !["DRAFT", "VOID"].includes(i.status),
                )
                .slice(0, 5)
                .map((i) => (
                  <button key={i.id} onClick={() => openInvoice(i.id)}>
                    <span>
                      <strong>{i.client.name}</strong>
                      <small>
                        {i.number} · due {dateLabel(i.dueDate)}
                      </small>
                    </span>
                    <Badge value={i.displayStatus} />
                    <strong>{currency(i.balance)}</strong>
                  </button>
                ))}
            </div>
          ) : (
            <Empty
              title="Your next invoice starts here"
              description="Prepare a draft when the scope is agreed. Issue it when you are ready to bill."
              action={
                state.actor.role !== "ACCOUNTANT" ? "Create invoice" : undefined
              }
              onAction={() => openForm("invoice")}
            />
          )}
        </Card>
        <Card
          title="Recent payments"
          action={
            <button
              className="text-button"
              onClick={() => go("payments", "PERIOD")}
            >
              View payments ↗
            </button>
          }
        >
          {recent.length ? (
            <div className="record-list">
              {recent.slice(0, 5).map((p) => (
                <button key={p.id} onClick={() => go("payments", "PERIOD")}>
                  <span>
                    <strong>{p.client.name}</strong>
                    <small>
                      {dateLabel(p.receivedAt)} · {p.method}
                    </small>
                  </span>
                  <strong>{currency(p.amount)}</strong>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="No payments in this period"
              description="Payments recorded against your clients appear here. Change the period to inspect earlier records."
            />
          )}
        </Card>
        <Card
          title="Connections & automation health"
          action={
            <button className="text-button" onClick={() => go("automations")}>
              View automations ↗
            </button>
          }
        >
          <div className="record-list">
            <a href="/?module=settings&section=integrations">
              <span>
                <strong>Communication inbox</strong>
                <small>
                  Inbox connections and reply tracking are under development.
                </small>
              </span>
              <IntegrationStatus state="UNDER_DEVELOPMENT" />
            </a>
            <a href="/?module=settings&section=integrations">
              <span>
                <strong>Stripe & bank sync</strong>
                <small>
                  Payment processing and bank sync are under development. Manual
                  payment records are available.
                </small>
              </span>
              <IntegrationStatus state="UNDER_DEVELOPMENT" />
            </a>
            <button onClick={() => go("automations")}>
              <span>
                <strong>
                  {state.actor.role !== "OWNER"
                    ? "Run history requires owner access"
                    : failures.length
                      ? `${failures.length} failed runs in recent history`
                      : "No failures in recent run history"}
                </strong>
                <small>
                  {state.actor.role === "OWNER"
                    ? `${data.jobs.length} recent runs available`
                    : "Ask an owner to review automation health."}
                </small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          </div>
        </Card>
        <Card
          title="Recent changes"
          action={
            <button className="text-button" onClick={onActivity}>
              View activity ↗
            </button>
          }
        >
          <div className="record-list">
            {state.activity.slice(0, 4).map((a) => (
              <button key={a.id} onClick={onActivity}>
                <span>
                  <strong>{a.summary}</strong>
                  <small>
                    {a.entityType.toLowerCase()} · {dateLabel(a.createdAt)}
                  </small>
                </span>
                <ArrowUpRight size={15} />
              </button>
            ))}
            {!state.activity.length && (
              <p className="inset-copy muted">
                Your saved changes will appear here.
              </p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
