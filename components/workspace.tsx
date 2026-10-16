"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Users,
  FileText,
  Wallet,
  Receipt,
  RefreshCw,
  Landmark,
  BarChart3,
  Settings,
  Search,
  Bell,
  ChevronDown,
  Menu,
  X,
  Plus,
  ArrowUpRight,
  Download,
  ShieldCheck,
  MapPin,
  LogOut,
  SlidersHorizontal,
  AlertCircle,
  Check,
  ArrowRight,
  ExternalLink,
  Building2,
  CalendarDays,
  TrendingUp,
  Clock,
  Upload,
} from "lucide-react";
import {
  Logo,
  Card,
  Table,
  Empty,
  Badge,
  Modal,
  api,
  currency,
  dateLabel,
  today,
} from "./ui";
import { Dashboard, InvoiceTable, RevenueChart } from "./dashboard";
import { RecordForm, type FormKind } from "./forms";
import { ClientDetail, InvoiceDetail } from "./details";
import { SettingsPanel } from "./settings";
import { DocumentLink } from "./document-preview";
import { ExpenseReviewDialog } from "./expense-review";
import { AccountSecurity } from "./account-security";
import { authClient } from "@/lib/auth-client";
import { D, ownerAllocations, sum } from "@/lib/money";
import type { State, Row } from "@/lib/client-types";
const navigation = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "clients", label: "Clients", Icon: Users },
  { id: "invoices", label: "Invoices", Icon: FileText },
  { id: "payments", label: "Payments", Icon: Wallet },
  { id: "expenses", label: "Expenses", Icon: Receipt },
  { id: "retainers", label: "Retainers", Icon: RefreshCw },
  { id: "taxes", label: "Taxes", Icon: Landmark },
  { id: "reports", label: "Reports", Icon: BarChart3 },
  { id: "settings", label: "Settings", Icon: Settings },
];
const subtitles: Record<string, string> = {
  clients: "Good relationships start with a clear picture.",
  invoices: "From your first draft to the final payment.",
  payments: "Every payment accounted for. Every balance clear.",
  expenses: "A complete view of what keeps your business running.",
  retainers: "Manage ongoing services and predictable revenue.",
  taxes: "Plan ahead with transparent, configurable estimates.",
  reports: "Your business performance, grounded in the ledger.",
  settings: "Your organization, your preferences, your controls.",
};
const primary: Record<string, { kind: FormKind; label: string }> = {
  clients: { kind: "client", label: "Add client" },
  invoices: { kind: "invoice", label: "Create invoice" },
  payments: { kind: "payment", label: "Record payment" },
  expenses: { kind: "expense", label: "Record expense" },
  retainers: { kind: "retainer", label: "Add retainer" },
  taxes: { kind: "tax", label: "Configure assumptions" },
};
type SearchResult = { id: string; label: string; kind: string; module: string };
export function Workspace() {
  const [activityOpen, setActivityOpen] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [mobile, setMobile] = useState(false);
  const [account, setAccount] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [security, setSecurity] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [period, setPeriod] = useState("month");
  const [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const [expenseId, setExpenseId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    kind: FormKind;
    initial?: Record<string, unknown>;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    path: string;
    title: string;
    reason: boolean;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [correctionDate, setCorrectionDate] = useState(today());
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [reportType, setReportType] = useState("profit-loss");
  const to = today();
  const from =
    period === "year"
      ? to.slice(0, 4) + "-01-01"
      : period === "quarter"
        ? `${to.slice(0, 4)}-${String(Math.floor((Number(to.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`
        : to.slice(0, 7) + "-01";
  const reload = useCallback(async () => {
    try {
      const data = await api<State>(`state?from=${from}&to=${to}`);
      setState(data);
      setError("");
      setRevision((r) => r + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [from, to]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    const current = new URLSearchParams(location.search).get("module");
    if (current && navigation.some((n) => n.id === current)) setPage(current);
    const onPop = () => {
      setPage(
        new URLSearchParams(location.search).get("module") || "dashboard",
      );
      setDetail(null);
    };
    window.addEventListener("popstate", onPop);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setResults([]);
        setAccount(false);
        setNotifications(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let live = true;
    const timeout = setTimeout(
      () =>
        api<SearchResult[]>("search?q=" + encodeURIComponent(query))
          .then((r) => live && setResults(r))
          .catch((e) => setError(e.message)),
      250,
    );
    return () => {
      live = false;
      clearTimeout(timeout);
    };
  }, [query]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const go = (module: string) => {
    setPage(module);
    setDetail(null);
    setFilter("");
    setStatusFilter("ALL");
    setMobile(false);
    setAccount(false);
    setSecurity(false);
    history.pushState({}, "", `/?module=${module}`);
  };
  const openForm = (kind: FormKind, initial?: Record<string, unknown>) => {
    if (state?.actor.role === "ACCOUNTANT") {
      setError("Your account has read-only access.");
      return;
    }
    if (
      ["invoice", "note", "payment", "retainer", "project", "contact"].includes(
        kind,
      ) &&
      !state?.clients.length
    ) {
      setToast("Add a client first to connect this record.");
      setForm({ kind: "client" });
      return;
    }
    setForm({
      kind,
      initial:
        kind === "tax" && !initial && state?.taxConfig
          ? { ...state.taxConfig, id: undefined }
          : initial,
    });
  };
  async function perform(path: string, data: unknown = {}) {
    try {
      await api(path, data);
      setToast("Changes saved successfully.");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const ask = (path: string, title: string, requiresReason = false) => {
    setReason("");
    setCorrectionDate(today());
    setConfirmation({ path, title, reason: requiresReason });
  };
  async function confirm() {
    if (!confirmation) return;
    setConfirmBusy(true);
    try {
      await api(
        confirmation.path,
        confirmation.reason ? { reason, date: correctionDate } : {},
      );
      setConfirmation(null);
      setToast("Action completed.");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConfirmBusy(false);
    }
  }
  async function uploadReceipt(expenseId: string, file: File) {
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("expenseId", expenseId);
      const r = await fetch("/api/documents", { method: "POST", body });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setToast("Receipt uploaded.");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const matches = (...values: unknown[]) =>
    values.some((v) =>
      String(v ?? "")
        .toLowerCase()
        .includes(filter.toLowerCase()),
    );
  const write = state?.actor.role !== "ACCOUNTANT";
  const owner = state?.actor.role === "OWNER";
  const dateString = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/New_York",
    }).format(new Date()),
  );
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const invoice = state?.invoices.find((i) => i.id === invoiceId);
  const exportUrl = (type: string, format = "csv") =>
    `/api/reports?type=${type}&format=${format}&from=${from}&to=${to}`;
  const toolbar = (statuses?: string[]) => (
    <div className="table-toolbar">
      <div className="filter-input">
        <Search size={16} />
        <input
          aria-label="Filter records"
          placeholder={`Search ${page}…`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {statuses && (
        <select
          aria-label="Filter status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      )}
      <span className="toolbar-spacer" />
      <span className="muted small-text">Persistent records · USD</span>
    </div>
  );
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <Logo />
        </div>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              aria-current={page === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={20} strokeWidth={1.8} />
              <span>{label}</span>
              {id === "invoices" && !!state?.unpaidCount && (
                <span className="nav-count">{state.unpaidCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="location-card">
            <div>
              <MapPin size={26} />
              <p>
                Based in<strong>South Carolina</strong>
              </p>
            </div>
            <p>
              Serving clients nationwide
              <br />
              in websites, software,
              <br />
              and cybersecurity.
            </p>
          </div>
          <div className="version">
            <span>
              Wintron OS <small>v1.0.0</small>
            </span>
            <i className="dot green" />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-toggle"
            aria-label="Open navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={22} />
          </button>
          <div className="global-search">
            <Search size={18} />
            <input
              ref={searchRef}
              aria-label="Search workspace"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients, invoices, notes, or anything…"
            />
            <kbd>⌘ K</kbd>
            {query.length >= 2 && (
              <div className="search-results">
                {results.length ? (
                  results.map((r, i) => (
                    <button
                      key={r.id + i}
                      onClick={() => {
                        go(r.module);
                        if (r.module === "clients") setDetail(r.id);
                        else setInvoiceId(r.id);
                        setQuery("");
                      }}
                    >
                      <span>{r.label}</span>
                      <small>{r.kind}</small>
                    </button>
                  ))
                ) : (
                  <p>No matching records</p>
                )}
              </div>
            )}
          </div>
          <div className="header-actions">
            <div className="popover-anchor">
              <button
                className="icon-button notification-button"
                aria-label="Notifications"
                onClick={() => {
                  setNotifications(!notifications);
                  setAccount(false);
                  if (!notifications) void perform("notifications/refresh", {});
                }}
              >
                <Bell size={21} />
                {state?.notifications.some((n) => !n.reads.length) && <i />}
              </button>
              {notifications && (
                <div className="popover notifications">
                  <h3>Notifications</h3>
                  {state?.notifications.length ? (
                    state.notifications.map((n) => (
                      <button
                        key={n.id}
                        className={n.reads.length ? "read" : ""}
                        onClick={() => {
                          void perform("notifications/" + n.id, {});
                          go(n.target);
                          setNotifications(false);
                        }}
                      >
                        <span className="notification-title">
                          {!n.reads.length && <i className="dot blue" />}
                          {n.title}
                        </span>
                        <small>{n.message}</small>
                      </button>
                    ))
                  ) : (
                    <p className="muted">You’re all caught up.</p>
                  )}
                </div>
              )}
            </div>
            <span className="header-divider" />
            <div className="popover-anchor">
              <button
                className="account-button"
                onClick={() => {
                  setAccount(!account);
                  setNotifications(false);
                }}
                aria-label="Account menu"
              >
                <span className="avatar">
                  {state?.actor.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("") || "W"}
                </span>
                <span>
                  <strong>{state?.actor.name || "Your account"}</strong>
                  <small>
                    {state?.actor.role === "OWNER"
                      ? "Owner"
                      : state?.actor.role === "ACCOUNTANT"
                        ? "Accountant"
                        : "Staff"}{" "}
                    · Wintron Technologies
                  </small>
                </span>
                <ChevronDown size={15} />
              </button>
              {account && (
                <div className="popover account-popover">
                  <button
                    onClick={() => {
                      setSecurity(true);
                      setAccount(false);
                    }}
                  >
                    <ShieldCheck size={16} />
                    Account security
                  </button>
                  <button
                    onClick={async () => {
                      await authClient.signOut();
                      location.assign("/login");
                    }}
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow mobile-eyebrow">WINTRON OS</span>
              <h1>
                {security
                  ? "Account security"
                  : page === "dashboard"
                    ? `${greeting}, ${state?.actor.name.split(" ")[0] || "there"}`
                    : navigation.find((n) => n.id === page)?.label}
              </h1>
              <p>
                {security
                  ? "Manage authentication and your active sessions."
                  : page === "dashboard"
                    ? "Here's what's happening with Wintron Technologies LLC."
                    : subtitles[page]}
              </p>
            </div>
            <div className="heading-actions">
              {["dashboard", "reports", "taxes"].includes(page) && (
                <>
                  <span className="current-date">{dateString}</span>
                  <select
                    aria-label="Reporting period"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    <option value="month">This month</option>
                    <option value="quarter">This quarter</option>
                    <option value="year">Year to date</option>
                  </select>
                </>
              )}
              {primary[page] && write && !detail && !security && (
                <button
                  className="button"
                  disabled={page === "taxes" && !owner}
                  onClick={() => openForm(primary[page].kind)}
                >
                  <Plus size={17} />
                  {primary[page].label}
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="error-message global-error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button
                className="text-button"
                onClick={() => {
                  setError("");
                  void reload();
                }}
              >
                Retry
              </button>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {security ? (
            <AccountSecurity />
          ) : !state ? (
            <>
              <div className="metrics">
                {[1, 2, 3, 4].map((i) => (
                  <div className="skeleton metric" key={i} />
                ))}
              </div>
              <div className="skeleton dashboard-skeleton" />
              {error && (
                <button
                  className="button secondary"
                  onClick={() => setSecurity(true)}
                >
                  Open account security
                </button>
              )}
            </>
          ) : (
            <>
              {page === "dashboard" && (
                <Dashboard
                  state={state}
                  go={go}
                  openForm={openForm}
                  openInvoice={setInvoiceId}
                  onActivity={() => setActivityOpen(true)}
                />
              )}
              {page === "clients" &&
                (detail ? (
                  <ClientDetail
                    id={detail}
                    state={state}
                    onClose={() => setDetail(null)}
                    openForm={openForm}
                    openInvoice={setInvoiceId}
                    revision={revision}
                    onError={setError}
                  />
                ) : (
                  <>
                    <div className="module-summary">
                      <span>
                        <strong>{state.clients.length}</strong> Total clients
                      </span>
                      <span>
                        <i className="dot green" />
                        <strong>
                          {
                            state.clients.filter((c) => c.status === "ACTIVE")
                              .length
                          }
                        </strong>{" "}
                        Active
                      </span>
                      <span>
                        <i className="dot blue" />
                        <strong>
                          {
                            state.clients.filter((c) => c.status === "LEAD")
                              .length
                          }
                        </strong>{" "}
                        Leads
                      </span>
                    </div>
                    <Card>
                      {toolbar(["ACTIVE", "LEAD", "INACTIVE"])}
                      {state.clients.length ? (
                        <Table
                          headers={[
                            "Company",
                            "Primary contact",
                            "Email",
                            "Industry",
                            "Status",
                            "Added",
                            "",
                          ]}
                        >
                          {state.clients
                            .filter(
                              (c) =>
                                matches(c.name, c.email, c.contactName) &&
                                (statusFilter === "ALL" ||
                                  c.status === statusFilter),
                            )
                            .map((c) => (
                              <tr key={c.id}>
                                <td>
                                  <button
                                    className="client-name"
                                    onClick={() => setDetail(c.id)}
                                  >
                                    <span className="table-avatar">
                                      {c.name.slice(0, 2).toUpperCase()}
                                    </span>
                                    <strong>{c.name}</strong>
                                  </button>
                                </td>
                                <td>{c.contactName || "—"}</td>
                                <td className="muted">{c.email || "—"}</td>
                                <td className="muted">{c.industry || "—"}</td>
                                <td>
                                  <Badge value={c.status} />
                                </td>
                                <td className="muted">
                                  {dateLabel(c.createdAt)}
                                </td>
                                <td>
                                  <button
                                    className="icon-button"
                                    aria-label={`Open ${c.name}`}
                                    onClick={() => setDetail(c.id)}
                                  >
                                    <ArrowRight size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </Table>
                      ) : (
                        <Empty
                          title="Your clients, all in one place"
                          description="Bring contacts, projects, notes, and billing together. Add your first client to get started."
                          action={write ? "Add your first client" : undefined}
                          onAction={() => openForm("client")}
                        />
                      )}
                    </Card>
                  </>
                ))}
              {page === "invoices" && (
                <>
                  <div className="metrics three">
                    {[
                      ["Outstanding balance", state.outstanding],
                      ["Overdue balance", state.overdue],
                      ["Period cash collected", state.cashCollected],
                    ].map(([label, value]) => (
                      <Card key={label}>
                        <span className="muted">{label}</span>
                        <strong className="summary-value">
                          {currency(value)}
                        </strong>
                      </Card>
                    ))}
                  </div>
                  <Card>
                    {toolbar([
                      "DRAFT",
                      "ISSUED",
                      "PARTIALLY_PAID",
                      "PAID",
                      "OVERDUE",
                      "VOID",
                    ])}
                    {state.invoices.length ? (
                      <InvoiceTable
                        invoices={state.invoices.filter(
                          (i) =>
                            matches(i.number, i.description, i.client.name) &&
                            (statusFilter === "ALL" ||
                              i.displayStatus === statusFilter),
                        )}
                        onOpen={setInvoiceId}
                      />
                    ) : (
                      <Empty
                        title="Make your work official"
                        description="Create a professional invoice with line items, payment terms, and your branding."
                        action={write ? "Create first invoice" : undefined}
                        onAction={() => openForm("invoice")}
                      />
                    )}
                  </Card>
                </>
              )}
              {page === "payments" && (
                <>
                  <div className="metrics three">
                    <Card>
                      <span className="muted">
                        Cash collected · selected period
                      </span>
                      <strong className="summary-value">
                        {currency(state.cashCollected)}
                      </strong>
                    </Card>
                    <Card>
                      <span className="muted">Payment records</span>
                      <strong className="summary-value">
                        {state.payments.length}
                      </strong>
                    </Card>
                    <Card>
                      <span className="muted">Awaiting reconciliation</span>
                      <strong className="summary-value">
                        {state.payments.filter((p) => !p.reconciled).length}
                      </strong>
                    </Card>
                  </div>
                  <Card>
                    {toolbar()}
                    {state.payments.length ? (
                      <Table
                        headers={[
                          "Client",
                          "Received",
                          "Amount",
                          "Method / reference",
                          "Reconciliation",
                          "Actions",
                        ]}
                      >
                        {state.payments
                          .filter((p) => matches(p.client.name, p.reference))
                          .map((p) => (
                            <tr key={p.id}>
                              <td>{p.client.name}</td>
                              <td>{dateLabel(p.receivedAt)}</td>
                              <td className="money">
                                {currency(p.amount)}
                                {p.refunds.length > 0 && (
                                  <small className="block muted">
                                    Refunds:{" "}
                                    {currency(
                                      sum(
                                        p.refunds.map((r) => String(r.amount)),
                                      ).toString(),
                                    )}
                                  </small>
                                )}
                              </td>
                              <td>
                                {p.method}
                                <small className="block muted">
                                  {p.reference || "No reference"}
                                </small>
                              </td>
                              <td>
                                {owner ? (
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      perform(`payments/${p.id}/reconcile`, {
                                        reconciled: !p.reconciled,
                                      })
                                    }
                                  >
                                    {p.reconciled
                                      ? "Reconciled ✓"
                                      : "Mark reconciled"}
                                  </button>
                                ) : p.reconciled ? (
                                  "Reconciled"
                                ) : (
                                  "Unreconciled"
                                )}
                              </td>
                              <td>
                                <div className="button-row">
                                  {write && (
                                    <button
                                      className="text-button"
                                      onClick={() =>
                                        openForm("allocation", {
                                          paymentId: p.id,
                                          clientId: p.clientId,
                                        })
                                      }
                                    >
                                      Allocate
                                    </button>
                                  )}
                                  {owner && (
                                    <button
                                      className="text-button"
                                      onClick={() =>
                                        openForm("refund", { paymentId: p.id })
                                      }
                                    >
                                      Refund
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </Table>
                    ) : (
                      <Empty
                        title="Know exactly what’s been paid"
                        description="Record ACH, check, wire, card, cash, or other payments received outside this application."
                        action={write ? "Record payment" : undefined}
                        onAction={() => openForm("payment")}
                      />
                    )}
                  </Card>
                </>
              )}
              {page === "expenses" && (
                <>
                  <div className="metrics three">
                    <Card>
                      <span className="muted">
                        Book expenses · selected period
                      </span>
                      <strong className="summary-value">
                        {currency(state.expensesTotal)}
                      </strong>
                    </Card>
                    <Card>
                      <span className="muted">Needs accountant review</span>
                      <strong className="summary-value">
                        {
                          state.expenses.filter(
                            (e) => e.reviewRequired && !e.reversedAt,
                          ).length
                        }
                      </strong>
                    </Card>
                    <Card>
                      <span className="muted">Receipts on file</span>
                      <strong className="summary-value">
                        {state.expenses.reduce(
                          (n, e) => n + e.documents.length,
                          0,
                        )}
                      </strong>
                    </Card>
                  </div>
                  <Card>
                    {toolbar()}
                    {state.expenses.length ? (
                      <Table
                        headers={[
                          "Vendor / description",
                          "Date",
                          "Category",
                          "Amount",
                          "Review",
                          "Receipt",
                          "",
                        ]}
                      >
                        {state.expenses
                          .filter((e) =>
                            matches(e.vendor, e.description, e.category),
                          )
                          .map((e) => (
                            <tr key={e.id}>
                              <td>
                                <strong>{e.vendor}</strong>
                                <small className="block muted">
                                  {e.description}
                                </small>
                              </td>
                              <td>{dateLabel(e.date)}</td>
                              <td>{e.category}</td>
                              <td className="money">{currency(e.amount)}</td>
                              <td>
                                <Badge
                                  value={
                                    e.reversedAt
                                      ? "VOID"
                                      : e.reviewRequired
                                        ? "REVIEW_REQUIRED"
                                        : e.reviews.length
                                          ? "REVIEWED"
                                          : "RECORDED"
                                  }
                                />
                              </td>
                              <td>
                                {e.documents.length ? (
                                  e.documents.map((d) => (
                                    <DocumentLink
                                      key={d.id}
                                      document={d}
                                      label="View receipt"
                                    />
                                  ))
                                ) : write ? (
                                  <label className="text-button upload-label">
                                    <Upload size={14} />
                                    Upload
                                    <input
                                      type="file"
                                      accept=".pdf,.png,.jpg,.jpeg"
                                      onChange={(event) =>
                                        event.target.files?.[0] &&
                                        void uploadReceipt(
                                          e.id,
                                          event.target.files[0],
                                        )
                                      }
                                    />
                                  </label>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>
                                <div className="expense-row-actions">
                                  <button
                                    className="text-button"
                                    onClick={() => setExpenseId(e.id)}
                                  >
                                    {e.reviewRequired && owner && !e.reversedAt
                                      ? "Review"
                                      : "Review details"}
                                  </button>
                                  {owner && !e.reversedAt && (
                                    <button
                                      className="text-button"
                                      onClick={() =>
                                        ask(
                                          `expenses/${e.id}/reverse`,
                                          "Reverse this expense?",
                                          true,
                                        )
                                      }
                                    >
                                      Reverse
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </Table>
                    ) : (
                      <Empty
                        title="Every business expense, accounted for"
                        description="Record costs, attach receipts, and flag uncertain items for accountant review."
                        action={write ? "Record expense" : undefined}
                        onAction={() => openForm("expense")}
                      />
                    )}
                  </Card>
                </>
              )}
              {page === "retainers" && (
                <>
                  <div className="metrics three">
                    <Card>
                      <span className="muted">Monthly recurring revenue</span>
                      <strong className="summary-value">
                        {currency(state.mrr)}
                      </strong>
                      <small>Contract run rate · not collected revenue</small>
                    </Card>
                    <Card>
                      <span className="muted">
                        Annualized recurring revenue
                      </span>
                      <strong className="summary-value">
                        {currency(state.arr)}
                      </strong>
                      <small>Active monthly run rate × 12</small>
                    </Card>
                    <Card>
                      <span className="muted">Active contracts</span>
                      <strong className="summary-value">
                        {
                          state.retainers.filter((r) => r.status === "ACTIVE")
                            .length
                        }
                      </strong>
                      <small>Recurring invoices are generated as drafts</small>
                    </Card>
                  </div>
                  <Card
                    title="Recurring contracts"
                    action={
                      write && (
                        <button
                          className="button secondary small"
                          onClick={() =>
                            ask(
                              "retainers/run",
                              "Generate due recurring invoices?",
                            )
                          }
                        >
                          <RefreshCw size={14} />
                          Run billing
                        </button>
                      )
                    }
                  >
                    {toolbar(["ACTIVE", "PAUSED", "CANCELLED"])}
                    {state.retainers.length ? (
                      <Table
                        headers={[
                          "Client / service",
                          "Amount",
                          "Frequency",
                          "Next invoice",
                          "Status",
                          "Actions",
                        ]}
                      >
                        {state.retainers
                          .filter(
                            (r) =>
                              matches(r.name, r.client.name) &&
                              (statusFilter === "ALL" ||
                                r.status === statusFilter),
                          )
                          .map((r) => (
                            <tr key={r.id}>
                              <td>
                                <strong>{r.name}</strong>
                                <small className="block muted">
                                  {r.client.name}
                                </small>
                              </td>
                              <td>{currency(r.amount)}</td>
                              <td>{r.frequency.toLowerCase()}</td>
                              <td>{dateLabel(r.nextInvoiceDate)}</td>
                              <td>
                                <Badge value={r.status} />
                              </td>
                              <td>
                                {write && (
                                  <div className="button-row">
                                    <button
                                      className="text-button"
                                      onClick={() => openForm("retainer", r)}
                                    >
                                      Manage
                                    </button>
                                    <button
                                      className="text-button"
                                      onClick={() =>
                                        openForm("time", { retainerId: r.id })
                                      }
                                    >
                                      Log time
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                      </Table>
                    ) : (
                      <Empty
                        title="Give recurring work a rhythm"
                        description="Manage maintenance, SEO, consulting, and ongoing services with reliable billing schedules."
                        action={write ? "Create retainer" : undefined}
                        onAction={() => openForm("retainer")}
                      />
                    )}
                  </Card>
                </>
              )}
              {page === "taxes" && (
                <>
                  <div className="notice tax-notice">
                    <ShieldCheck size={21} />
                    <div>
                      <strong>Tax planning, with clear boundaries.</strong>
                      <p>
                        Reserve percentages are your planning assumptions.
                        Taxable income and tax obligations require reviewed
                        rules, owner facts, and accountant confirmation.
                        Formation in South Carolina does not establish every
                        owner’s tax residency.
                      </p>
                    </div>
                    <span className="badge blue">Provisional</span>
                  </div>
                  <div className="metrics">
                    <Card>
                      <span className="muted">Book revenue</span>
                      <strong className="summary-value">
                        {currency(state.revenue)}
                      </strong>
                      <small>Accrual basis · selected period</small>
                    </Card>
                    <Card>
                      <span className="muted">Book expenses</span>
                      <strong className="summary-value">
                        {currency(state.expensesTotal)}
                      </strong>
                      <small>Not necessarily deductible</small>
                    </Card>
                    <Card>
                      <span className="muted">Book profit</span>
                      <strong className="summary-value">
                        {currency(state.profit)}
                      </strong>
                      <small>Not taxable income</small>
                    </Card>
                    <Card>
                      <span className="muted">Estimated taxable income</span>
                      <strong className="summary-value unconfigured">
                        Incomplete
                      </strong>
                      <small>Requires accountant adjustments</small>
                    </Card>
                  </div>
                  <div className="two-columns">
                    <Card
                      title="Reserve planning"
                      icon={<Landmark size={19} />}
                      action={<span className="badge gray">Estimate</span>}
                    >
                      {state.taxConfig ? (
                        <>
                          <div className="tax-summary">
                            <div>
                              <strong>{currency(state.reserveTarget)}</strong>
                              <p className="muted">
                                Suggested reserve for selected book-profit
                                period
                              </p>
                            </div>
                          </div>
                          <div className="tax-rows">
                            {[
                              ["Federal", state.reserves?.federal],
                              ["South Carolina", state.reserves?.state],
                              [
                                "Self-employment",
                                state.reserves?.selfEmployment,
                              ],
                              ["Amount earmarked", state.taxConfig.earmarked],
                              ["Remaining reserve", state.remainingReserve],
                            ].map(([l, v]) => (
                              <div key={l}>
                                <span>{l}</span>
                                <strong>{currency(v)}</strong>
                              </div>
                            ))}
                          </div>
                          <p className="muted small-text">
                            Earmarked funds are a planning allocation, not a
                            bank transfer. Cash-method taxable income is not
                            inferred from book profit.
                          </p>
                        </>
                      ) : (
                        <Empty
                          title="Set your reserve assumptions"
                          description="Configure classification, reserve percentages, effective dates, and source references."
                          action={owner ? "Configure tax planning" : undefined}
                          onAction={() => openForm("tax")}
                        />
                      )}
                    </Card>
                    <Card title="Owner allocation estimates">
                      <p className="muted">
                        Book profit allocated by configured ownership.
                        Distributions and taxable income are tracked separately.
                      </p>
                      {state.owners.length &&
                      sum(state.owners.map((o) => o.percentage)).eq(100) ? (
                        <Table
                          headers={["Owner", "Ownership", "Book allocation"]}
                        >
                          {ownerAllocations(state.profit, state.owners).map(
                            (o) => (
                              <tr key={o.id}>
                                <td>
                                  {
                                    state.owners.find((x) => x.id === o.id)
                                      ?.name
                                  }
                                </td>
                                <td>
                                  {
                                    state.owners.find((x) => x.id === o.id)
                                      ?.percentage
                                  }
                                  %
                                </td>
                                <td>{currency(o.amount)}</td>
                              </tr>
                            ),
                          )}
                        </Table>
                      ) : (
                        <Empty
                          title="Ownership configuration incomplete"
                          description="Enter all owners and percentages totaling 100% in Settings → Financial."
                        />
                      )}
                      <div className="notice">
                        Estimated obligation: incomplete
                        <br />
                        Accountant-confirmed outstanding tax: not configured
                      </div>
                    </Card>
                  </div>
                  <Card
                    title="Recorded entity tax payments"
                    action={
                      owner && (
                        <button
                          className="button secondary small"
                          onClick={() => openForm("tax-payment")}
                        >
                          <Plus size={14} />
                          Record tax payment
                        </button>
                      )
                    }
                  >
                    {state.taxPayments.length ? (
                      <Table
                        headers={[
                          "Date",
                          "Jurisdiction",
                          "Year",
                          "Type",
                          "Amount",
                          "Reference",
                        ]}
                      >
                        {state.taxPayments.map((p) => (
                          <tr key={p.id}>
                            <td>{dateLabel(p.date)}</td>
                            <td>{String(p.jurisdiction)}</td>
                            <td>{String(p.taxYear)}</td>
                            <td>{String(p.kind).replaceAll("_", " ")}</td>
                            <td>{currency(p.amount)}</td>
                            <td>{String(p.reference)}</td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty
                        title="No tax payments recorded for this period"
                        description="Track entity payments here. Owner estimated taxes belong in owner tax distributions."
                      />
                    )}
                  </Card>
                  <div className="tax-sources">
                    <a
                      href="https://www.irs.gov/businesses/small-businesses-self-employed/limited-liability-company-llc"
                      target="_blank"
                      rel="noreferrer"
                    >
                      IRS · LLC classifications <ExternalLink size={12} />
                    </a>
                    <a
                      href="https://dor.sc.gov"
                      target="_blank"
                      rel="noreferrer"
                    >
                      South Carolina Department of Revenue{" "}
                      <ExternalLink size={12} />
                    </a>
                    <a href={exportUrl("ledger")}>
                      Export ledger for accountant <Download size={12} />
                    </a>
                  </div>
                </>
              )}
              {page === "reports" && (
                <>
                  <div className="metrics">
                    <Card>
                      <span className="muted">Recognized revenue</span>
                      <strong className="summary-value">
                        {currency(state.revenue)}
                      </strong>
                      <small>Accrual · selected period</small>
                    </Card>
                    <Card>
                      <span className="muted">Operating expenses</span>
                      <strong className="summary-value">
                        {currency(state.expensesTotal)}
                      </strong>
                    </Card>
                    <Card>
                      <span className="muted">Net book profit</span>
                      <strong
                        className={`summary-value ${D(state.profit).gte(0) ? "positive" : ""}`}
                      >
                        {currency(state.profit)}
                      </strong>
                    </Card>
                    <Card>
                      <span className="muted">Operating cash balance</span>
                      <strong className="summary-value">
                        {currency(state.cashBalance)}
                      </strong>
                      <small>Cumulative through period end</small>
                    </Card>
                  </div>
                  <div className="report-toolbar">
                    <select
                      aria-label="Report type"
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value)}
                    >
                      {[
                        ["profit-loss", "Profit & loss"],
                        ["balance-sheet", "Balance sheet"],
                        ["cash-flow", "Cash flow summary"],
                        ["ledger", "General ledger"],
                        ["trial-balance", "Trial balance"],
                        ["aging", "Accounts receivable aging"],
                        ["clients", "Revenue by client"],
                        ["services", "Revenue by service"],
                        ["expenses", "Expenses by category"],
                        ["retainers", "Retainer revenue"],
                        ["owners", "Owner distributions"],
                      ].map(([v, l]) => (
                        <option value={v} key={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <div className="button-row">
                      <a
                        className="button secondary"
                        href={exportUrl(reportType)}
                      >
                        <Download size={15} />
                        Export CSV
                      </a>
                      <a
                        className="button secondary"
                        href={exportUrl(reportType, "pdf")}
                      >
                        <FileText size={15} />
                        Export PDF
                      </a>
                      {owner && (
                        <button
                          className="button secondary"
                          onClick={() => openForm("journal")}
                        >
                          <Plus size={15} />
                          Reviewed adjustment
                        </button>
                      )}
                    </div>
                  </div>
                  <Card
                    title={
                      {
                        "profit-loss": "Profit & loss",
                        "balance-sheet": "Balance sheet",
                        "cash-flow": "Cash flow summary",
                        ledger: "General ledger",
                        "trial-balance": "Trial balance",
                        aging: "Current accounts receivable aging",
                        clients: "Revenue by client",
                        services: "Revenue by service category",
                        expenses: "Expenses by category",
                        retainers: "Retainer contracts & run rate",
                        owners: "Owner transactions",
                      }[reportType]
                    }
                    action={<span className="subtle-pill">USD · accrual</span>}
                  >
                    {["profit-loss", "expenses"].includes(reportType) && (
                      <Table headers={["Account", "Type", "Amount"]}>
                        {state.accountBalances
                          .filter((a) =>
                            reportType === "expenses"
                              ? a.type === "EXPENSE"
                              : ["REVENUE", "EXPENSE"].includes(a.type),
                          )
                          .map((a) => (
                            <tr key={a.id}>
                              <td>
                                {a.code} · {a.name}
                              </td>
                              <td className="muted">{a.type.toLowerCase()}</td>
                              <td className="money">
                                {currency(
                                  a.type === "REVENUE"
                                    ? D(a.periodBalance).negated().toString()
                                    : a.periodBalance,
                                )}
                              </td>
                            </tr>
                          ))}
                        {reportType === "profit-loss" && (
                          <tr className="total-row">
                            <td>Net profit</td>
                            <td />
                            <td>{currency(state.profit)}</td>
                          </tr>
                        )}
                      </Table>
                    )}
                    {reportType === "balance-sheet" && (
                      <Table headers={["Account", "Type", "Balance"]}>
                        {state.accountBalances
                          .filter(
                            (a) => !["REVENUE", "EXPENSE"].includes(a.type),
                          )
                          .map((a) => (
                            <tr key={a.id}>
                              <td>
                                {a.code} · {a.name}
                              </td>
                              <td>{a.type.toLowerCase()}</td>
                              <td>
                                {currency(
                                  a.type === "ASSET"
                                    ? a.balance
                                    : D(a.balance).negated().toString(),
                                )}
                              </td>
                            </tr>
                          ))}
                        <tr>
                          <td>Retained earnings</td>
                          <td>equity</td>
                          <td>{currency(state.retainedEarnings)}</td>
                        </tr>
                        <tr className="total-row">
                          <td>Assets</td>
                          <td />
                          <td>{currency(state.assets)}</td>
                        </tr>
                        <tr className="total-row">
                          <td>Liabilities + equity</td>
                          <td />
                          <td>
                            {currency(
                              D(state.liabilities)
                                .plus(state.equity)
                                .toString(),
                            )}
                          </td>
                        </tr>
                      </Table>
                    )}
                    {reportType === "trial-balance" && (
                      <Table
                        headers={["Account", "Debit balance", "Credit balance"]}
                      >
                        {state.accountBalances.map((a) => (
                          <tr key={a.id}>
                            <td>
                              {a.code} · {a.name}
                            </td>
                            <td>{currency(D.max(0, a.balance).toString())}</td>
                            <td>
                              {currency(
                                D.max(0, D(a.balance).negated()).toString(),
                              )}
                            </td>
                          </tr>
                        ))}
                        <tr className="total-row">
                          <td>Total</td>
                          <td>
                            {currency(
                              sum(
                                state.accountBalances.map((a) =>
                                  D.max(0, a.balance),
                                ),
                              ).toString(),
                            )}
                          </td>
                          <td>
                            {currency(
                              sum(
                                state.accountBalances.map((a) =>
                                  D.max(0, D(a.balance).negated()),
                                ),
                              ).toString(),
                            )}
                          </td>
                        </tr>
                      </Table>
                    )}
                    {reportType === "ledger" &&
                      (state.entries.length ? (
                        <Table
                          headers={[
                            "Date",
                            "Journal / memo",
                            "Account",
                            "Debit",
                            "Credit",
                          ]}
                        >
                          {state.entries.flatMap((e) =>
                            e.lines.map((l) => (
                              <tr key={l.id}>
                                <td>{dateLabel(e.date)}</td>
                                <td>
                                  {e.memo}
                                  <small className="block muted">
                                    {e.id.slice(0, 12)}
                                  </small>
                                </td>
                                <td>
                                  {l.account.code} · {l.account.name}
                                </td>
                                <td>{currency(l.debit)}</td>
                                <td>{currency(l.credit)}</td>
                              </tr>
                            )),
                          )}
                        </Table>
                      ) : (
                        <Empty
                          title="No posted journal entries"
                          description="Issuing invoices and recording transactions creates balanced ledger entries."
                        />
                      ))}
                    {reportType === "cash-flow" && (
                      <Table headers={["Date", "Source", "Cash movement"]}>
                        {state.entries.map((e) => (
                          <tr key={e.id}>
                            <td>{dateLabel(e.date)}</td>
                            <td>{e.memo}</td>
                            <td>
                              {currency(
                                sum(
                                  e.lines
                                    .filter((l) => l.account.code === "1000")
                                    .map((l) => D(l.debit).minus(l.credit)),
                                ).toString(),
                              )}
                            </td>
                          </tr>
                        ))}
                        <tr className="total-row">
                          <td colSpan={2}>Net cash movement</td>
                          <td>{currency(state.cashMovement)}</td>
                        </tr>
                      </Table>
                    )}
                    {reportType === "aging" && (
                      <Table headers={["Age", "Outstanding balance"]}>
                        {state.aging.map((a) => (
                          <tr key={a.label}>
                            <td>{a.label}</td>
                            <td>{currency(a.total)}</td>
                          </tr>
                        ))}
                      </Table>
                    )}
                    {reportType === "clients" && (
                      <Table
                        headers={[
                          "Client",
                          "Recognized revenue",
                          "Concentration",
                        ]}
                      >
                        {state.revenueByClient.map((c) => (
                          <tr key={c.clientId}>
                            <td>{c.name}</td>
                            <td>{currency(c.revenue)}</td>
                            <td>
                              {D(state.revenue).gt(0)
                                ? D(c.revenue)
                                    .div(state.revenue)
                                    .mul(100)
                                    .toFixed(1) + "%"
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </Table>
                    )}
                    {reportType === "services" && (
                      <Table
                        headers={["Service category", "Recognized revenue"]}
                      >
                        {state.revenueByService.map((s) => (
                          <tr key={s.name}>
                            <td>{s.name}</td>
                            <td>{currency(s.revenue)}</td>
                          </tr>
                        ))}
                      </Table>
                    )}
                    {reportType === "retainers" && (
                      <>
                        <div className="module-summary">
                          <span>
                            Recognized{" "}
                            <strong>{currency(state.retainerRevenue)}</strong>
                          </span>
                          <span>
                            MRR <strong>{currency(state.mrr)}</strong>
                          </span>
                          <span>
                            ARR <strong>{currency(state.arr)}</strong>
                          </span>
                        </div>
                        <Table
                          headers={[
                            "Contract",
                            "Client",
                            "Amount",
                            "Frequency",
                            "Status",
                          ]}
                        >
                          {state.retainers.map((r) => (
                            <tr key={r.id}>
                              <td>{r.name}</td>
                              <td>{r.client.name}</td>
                              <td>{currency(r.amount)}</td>
                              <td>{r.frequency}</td>
                              <td>
                                <Badge value={r.status} />
                              </td>
                            </tr>
                          ))}
                        </Table>
                      </>
                    )}
                    {reportType === "owners" && (
                      <Table
                        headers={["Owner", "Date", "Type", "Amount", "Purpose"]}
                      >
                        {state.owners.flatMap((o) =>
                          o.transactions
                            .filter(
                              (t) =>
                                String(t.date).slice(0, 10) >= from &&
                                String(t.date).slice(0, 10) <= to,
                            )
                            .map((t) => (
                              <tr key={t.id}>
                                <td>{o.name}</td>
                                <td>{dateLabel(t.date)}</td>
                                <td>{String(t.kind).replaceAll("_", " ")}</td>
                                <td>{currency(t.amount)}</td>
                                <td>{String(t.notes)}</td>
                              </tr>
                            )),
                        )}
                      </Table>
                    )}
                  </Card>
                  <div className="report-footnote">
                    <ShieldCheck size={14} />
                    Reports are derived from posted journals. Invoice balances
                    and aging show current outstanding amounts; balance sheet
                    accounts are cumulative through the selected period end.
                  </div>
                </>
              )}
              {page === "settings" && (
                <SettingsPanel
                  state={state}
                  openForm={openForm}
                  perform={perform}
                  revision={revision}
                  onError={setError}
                />
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>Wintron Technologies LLC</span>
            <span>
              <i className="dot green" />
              Private business workspace
            </span>
          </footer>
        </main>
      </div>
      {activityOpen && state && (
        <Modal
          title="Recent workspace activity"
          description="The latest 30 audited changes in your organization."
          onClose={() => setActivityOpen(false)}
          wide
        >
          <div className="modal-body">
            <Table headers={["When", "Action", "Summary"]}>
              {state.activity.map((e) => (
                <tr key={e.id}>
                  <td>{dateLabel(e.createdAt)}</td>
                  <td>{e.action}</td>
                  <td>{e.summary}</td>
                </tr>
              ))}
            </Table>
          </div>
        </Modal>
      )}
      {form && state && (
        <RecordForm
          key={form.kind + String(form.initial?.id || "")}
          kind={form.kind}
          state={state}
          initial={form.initial}
          onClose={() => setForm(null)}
          onSaved={() => {
            setToast("Record saved.");
            void reload();
          }}
        />
      )}
      {invoice && state && (
        <InvoiceDetail
          invoice={invoice}
          state={state}
          onClose={() => setInvoiceId(null)}
          openForm={openForm}
          perform={perform}
          ask={ask}
        />
      )}
      {expenseId && state?.expenses.find((e) => e.id === expenseId) && (
        <ExpenseReviewDialog
          key={expenseId}
          expense={state.expenses.find((e) => e.id === expenseId)!}
          owner={owner}
          onClose={() => setExpenseId(null)}
          onSaved={async () => {
            await reload();
            setToast("Expense review saved.");
          }}
        />
      )}
      {confirmation && (
        <Modal
          title={confirmation.title}
          description={
            confirmation.reason
              ? "This creates an auditable correction. The original record remains preserved."
              : "Review before continuing. This action updates your business records."
          }
          onClose={() => setConfirmation(null)}
        >
          <div className="modal-body">
            {confirmation.reason ? (
              <>
                <label>
                  <span>Reason</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    minLength={5}
                    required
                  />
                </label>
                <label>
                  <span>Correction date</span>
                  <input
                    type="date"
                    value={correctionDate}
                    onChange={(e) => setCorrectionDate(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <p>
                {confirmation.path.endsWith("/issue")
                  ? "Issuing assigns a permanent invoice number and posts accounts receivable and revenue to the ledger."
                  : confirmation.path.endsWith("/send")
                    ? "The configured SMTP provider will send the PDF to the client’s billing email."
                    : "Due billing periods will create draft invoices for your review. Previously generated periods are skipped."}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setConfirmation(null)}
            >
              Cancel
            </button>
            <button
              className="button"
              disabled={
                confirmBusy || (confirmation.reason && reason.length < 5)
              }
              onClick={confirm}
            >
              {confirmBusy ? "Processing…" : "Confirm"}
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
