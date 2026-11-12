"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  Building2,
  Users,
  ShieldCheck,
  Server,
  Mail,
  FileClock,
  Plus,
  Check,
  LogOut,
} from "lucide-react";
import { Card, Table, Badge, api, dateLabel, Empty } from "./ui";
import { AccountSecurity } from "./account-security";
import type { Settings, State, Row } from "@/lib/client-types";
import type { FormKind } from "./forms";
export function SettingsPanel({
  state,
  openForm,
  perform,
  revision,
  onError,
}: {
  state: State;
  openForm: (k: FormKind, initial?: Record<string, unknown>) => void;
  perform: (path: string, data?: unknown) => Promise<void>;
  revision: number;
  onError: (message: string) => void;
}) {
  const [tab, setTab] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("section") ===
      "integrations"
      ? "Integrations"
      : "Organization",
  );
  const [settings, setSettings] = useState<Settings | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(state.organization).map(([k, v]) => [k, String(v ?? "")]),
    ),
  );
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (state.actor.role === "OWNER")
      api<Settings>("settings")
        .then(setSettings)
        .catch((e) => onError(e.message));
  }, [revision, state.actor.role]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    await perform("organization", values);
    setSaving(false);
  }
  if (state.actor.role !== "OWNER") return <AccountSecurity />;
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Settings sections">
        {[
          "Organization",
          "Staff & access",
          "Account security",
          "Financial",
          "Integrations",
          "System & audit",
        ].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Organization" && (
        <Card
          title="Organization & invoice branding"
          icon={<Building2 size={20} />}
        >
          <form onSubmit={save}>
            <div className="form-grid">
              {[
                ["name", "Legal business name"],
                ["email", "Business email"],
                ["phone", "Phone"],
                ["website", "Website"],
                ["address", "Business address"],
                ["invoicePrefix", "Invoice prefix"],
                ["paymentTerms", "Default payment terms (days)"],
                ["paymentInstructions", "Invoice payment instructions"],
                ["terms", "Invoice terms and conditions"],
              ].map(([key, label]) => (
                <label
                  className={
                    ["address", "terms", "paymentInstructions"].includes(key)
                      ? "span-2"
                      : ""
                  }
                  key={key}
                >
                  <span>{label}</span>
                  {["address", "terms", "paymentInstructions"].includes(key) ? (
                    <textarea
                      rows={3}
                      value={values[key] || ""}
                      onChange={(e) =>
                        setValues({ ...values, [key]: e.target.value })
                      }
                    />
                  ) : (
                    <input
                      required={key === "name" || key === "invoicePrefix"}
                      value={values[key] || ""}
                      onChange={(e) =>
                        setValues({ ...values, [key]: e.target.value })
                      }
                    />
                  )}
                </label>
              ))}
            </div>
            <p className="muted">
              Issued invoice identity is preserved. These settings apply to
              newly created documents.
            </p>
            <button className="button" disabled={saving}>
              <Check size={16} />
              {saving ? "Saving…" : "Save organization"}
            </button>
          </form>
        </Card>
      )}
      {tab === "Staff & access" && (
        <Card
          title="Authorized staff"
          icon={<Users size={20} />}
          action={
            <button className="button small" onClick={() => openForm("user")}>
              <Plus size={15} />
              Add staff
            </button>
          }
        >
          {settings && (
            <Table headers={["Name", "Email", "Role", "MFA", "Access", ""]}>
              {settings.users.map((m) => (
                <tr key={m.id}>
                  <td>{m.user.name}</td>
                  <td>{m.user.email}</td>
                  <td>
                    <select
                      aria-label={`Role for ${m.user.name}`}
                      value={m.role}
                      disabled={m.user.id === state.actor.userId}
                      onChange={(e) =>
                        perform("users/" + m.user.id, {
                          role: e.target.value,
                          active: m.active,
                        })
                      }
                    >
                      {["OWNER", "STAFF", "ACCOUNTANT"].map((r) => (
                        <option value={r} key={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <Badge
                      value={m.user.twoFactorEnabled ? "ACTIVE" : "NOT_ENABLED"}
                    />
                  </td>
                  <td>{m.active ? "Active" : "Disabled"}</td>
                  <td>
                    <button
                      className="text-button"
                      disabled={m.user.id === state.actor.userId}
                      onClick={() =>
                        perform("users/" + m.user.id, {
                          role: m.role,
                          active: !m.active,
                        })
                      }
                    >
                      {m.active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <p className="muted">
            Accountants have read-only business access. Staff manage operational
            records. Owners control corrections, settings, and account access.
          </p>
        </Card>
      )}
      {tab === "Account security" && <AccountSecurity />}
      {tab === "Financial" && (
        <div className="two-columns">
          <Card
            title="Owners & capital"
            action={
              <button className="text-button" onClick={() => openForm("owner")}>
                <Plus size={14} />
                Add owner
              </button>
            }
          >
            {state.owners.length ? (
              <Table headers={["Owner", "Ownership", "Residency", ""]}>
                {state.owners.map((o) => (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td>{o.percentage}%</td>
                    <td>{o.residency || "Not configured"}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => openForm("owner", o)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty
                title="Configure your founders"
                description="Enter actual ownership percentages and tax residencies. No ownership split is assumed."
              />
            )}
            <button
              className="button secondary"
              disabled={!state.owners.length}
              onClick={() => openForm("owner-transaction")}
            >
              Record owner transaction
            </button>
          </Card>
          <Card title="Chart of accounts">
            <Table headers={["Code", "Account", "Type"]}>
              {state.accountBalances.map((a) => (
                <tr key={a.id}>
                  <td>{a.code}</td>
                  <td>{a.name}</td>
                  <td className="muted">{a.type.toLowerCase()}</td>
                </tr>
              ))}
            </Table>
            <p className="muted">
              Expense categories can be mapped to these accounts when recording
              an expense. Opening balances use a reviewed adjustment.
            </p>
          </Card>
        </div>
      )}
      {tab === "Integrations" && (
        <div className="two-columns">
          <Card title="Invoice email" icon={<Mail size={20} />}>
            <Badge
              value={settings?.smtpConfigured ? "CONFIGURED" : "NOT_CONFIGURED"}
            />
            <p>SMTP is configured through server environment variables.</p>
            <dl className="detail-list">
              <dt>Host and port</dt>
              <dd>SMTP_HOST · SMTP_PORT</dd>
              <dt>Sender</dt>
              <dd>SMTP_FROM</dd>
              <dt>Credentials</dt>
              <dd>SMTP_USER · SMTP_PASSWORD</dd>
              <dt>Transport</dt>
              <dd>TLS required</dd>
            </dl>
            <p className="muted">
              Secrets are never returned to the browser. Downloadable invoice
              PDFs work without email configuration.
            </p>
          </Card>
          <Card title="Lead discovery">
            <Badge value="NOT_CONNECTED" />
            <p>No lead-search provider is implemented.</p>
            <p className="muted">
              An administrator must implement a search provider adapter with
              source attribution, then configure its credentials on the server.
              Adding a key alone will not enable search. Manual prospect
              research and saved searches work now.
            </p>
            <p className="muted">Last successful search: never.</p>
          </Card>
          <Card title="Communication inbox">
            <Badge value="NOT_CONNECTED" />
            <p>Inbound email and reply events are unavailable.</p>
            <p className="muted">
              Connect an inbox provider and implement event handling before
              enabling reply-based rules. SMTP only sends invoice emails; it
              does not read replies.
            </p>
            <p className="muted">Last successful sync: never.</p>
          </Card>
          <Card title="Payments & bank accounts">
            <Badge value="NOT_CONNECTED" />
            <p className="muted">
              Stripe and bank adapters are not implemented. An administrator
              must add an adapter with verified webhook handling and duplicate
              detection before configuring credentials. Last successful sync:
              never.
            </p>
            <p>
              Record payments received through your existing bank or payment
              processor.
            </p>
            <p className="muted">
              External payment processing and bank synchronization are not
              enabled. No card credentials are stored.
            </p>
            <button
              className="button secondary"
              onClick={() => openForm("payment")}
            >
              Record external payment
            </button>
          </Card>
        </div>
      )}
      {tab === "System & audit" && (
        <div className="stack">
          <div className="metrics three">
            <Card title="Database" icon={<Server size={18} />}>
              <p className="status-line">
                <i className="dot green" />
                {settings?.database || "Checking…"}
              </p>
            </Card>
            <Card title="Document storage">
              <p>{settings?.storage || "Checking…"}</p>
              <small>Authenticated downloads · SHA-256 checks</small>
            </Card>
            <Card title="Application">
              <p>Wintron OS {settings?.version}</p>
              <small>
                MFA policy:{" "}
                {settings?.mfaRequired ? "Required" : "Enrollment available"}
              </small>
            </Card>
          </div>
          <Card title="Background jobs & backups">
            {settings?.jobs.length ? (
              <Table headers={["Time", "Job", "Status", "Details"]}>
                {settings.jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{dateLabel(j.createdAt)}</td>
                    <td>{String(j.kind)}</td>
                    <td>
                      <Badge value={String(j.status)} />
                    </td>
                    <td>{String(j.detail)}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty
                title="No job history"
                description="Configure the scheduler and offsite backups using the deployment guide."
              />
            )}
          </Card>
          <Card title="Active staff sessions">
            {settings && (
              <Table headers={["User", "Created", "Expires", ""]}>
                {settings.users.flatMap((m) =>
                  m.user.sessions.map((s) => (
                    <tr key={s.id}>
                      <td>{m.user.name}</td>
                      <td>{dateLabel(s.createdAt)}</td>
                      <td>{dateLabel(s.expiresAt)}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => perform("sessions/" + s.id, {})}
                        >
                          <LogOut size={14} />
                          Revoke
                        </button>
                      </td>
                    </tr>
                  )),
                )}
              </Table>
            )}
          </Card>
          <Card title="Audit trail" icon={<FileClock size={19} />}>
            <Table headers={["Date", "Action", "Record", "Summary", "Actor"]}>
              {settings?.audits.map((e) => (
                <tr key={e.id}>
                  <td>{dateLabel(e.createdAt)}</td>
                  <td>{e.action}</td>
                  <td>{e.entityType}</td>
                  <td>{e.summary}</td>
                  <td className="muted">{e.actorId.slice(0, 12)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
