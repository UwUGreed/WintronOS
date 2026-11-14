"use client";
import { LeadDiscovery } from "./lead-discovery";
import type { LeadResult } from "@/lib/integration-types";
import { useEffect, useState } from "react";
import { Plus, ArrowUpRight, Bookmark } from "lucide-react";
import { Badge, Card, Empty, Table, api, dateLabel, Modal } from "./ui";
import { DetailPanel, EditFields, type Field } from "./workflow-ui";
import type { WorkspaceData, Prospect } from "@/lib/workspace-types";
const fields: Field[] = [
  { key: "name", label: "Business name", required: true },
  { key: "website", label: "Website", type: "url" },
  { key: "industry", label: "Industry" },
  { key: "location", label: "Location" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone" },
  {
    key: "sourceUrl",
    label: "Source URL",
    type: "url",
    help: "Link to the page supporting the information you entered.",
  },
  { key: "observedAt", label: "Source checked on", type: "date" },
  {
    key: "evidence",
    label: "Sourced facts",
    type: "textarea",
    help: "Only include information you observed. Leave unknown information blank.",
  },
  {
    key: "qualification",
    label: "Qualification reasoning",
    type: "textarea",
    help: "Your interpretation of fit; this is separate from sourced facts.",
  },
  {
    key: "status",
    label: "Status",
    options: [
      ["SAVED", "Saved"],
      ["QUALIFIED", "Qualified"],
      ["DISMISSED", "Dismissed"],
    ],
  },
];
export function Prospecting({
  initialStatus,
  openId,
  data,
  write,
  reload,
  go,
}: {
  initialStatus?: string;
  openId?: string | null;
  data: WorkspaceData;
  write: boolean;
  reload: () => Promise<void>;
  go: (page: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState(initialStatus || "ALL");
  const [sort, setSort] = useState("recent");
  const [selected, setSelected] = useState<string[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [research, setResearch] = useState<LeadResult | null>(null);
  const [edit, setEdit] = useState(false);
  const [saveSearch, setSaveSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (openId) {
      setId(openId);
      setEdit(false);
    }
  }, [openId]);
  const prospect = data.prospects.find((p) => p.id === id);
  const rows = data.prospects
    .filter(
      (p) =>
        `${p.name} ${p.email} ${p.evidence}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        p.industry.toLowerCase().includes(industry.toLowerCase()) &&
        p.location.toLowerCase().includes(location.toLowerCase()) &&
        (status === "ALL" || p.status === status),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.createdAt.localeCompare(a.createdAt),
    );
  async function act(fn: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await reload();
      setMessage(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="workspace-intro">
        <div>
          <span className="eyebrow">FIND YOUR NEXT CLIENT</span>
          <p>Research a business. Keep the evidence. Start a relationship.</p>
        </div>
        {write && (
          <button
            className="button"
            onClick={() => {
              setResearch(null);
              setCreate(true);
            }}
          >
            <Plus size={16} />
            Add prospect
          </button>
        )}
      </div>
      <LeadDiscovery
        prospects={data.prospects}
        configured={data.integrations.leadProvider}
        write={write}
        onReview={(result) => {
          setResearch(result);
          setCreate(true);
        }}
        openProspect={(id) => {
          setId(id);
          setEdit(false);
        }}
      />
      <Card>
        <div className="prospect-criteria">
          <label>
            <span>Search saved prospects</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Business, email, or evidence"
            />
          </label>
          <label>
            <span>Industry</span>
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="All industries"
            />
          </label>
          <label>
            <span>Location</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="All locations"
            />
          </label>
          <button
            className="button secondary"
            disabled={!write}
            onClick={() => setSaveSearch(true)}
          >
            <Bookmark size={15} />
            Save search
          </button>
        </div>
        <div className="table-toolbar">
          <select
            aria-label="Prospect status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="ALL">All statuses</option>
            {["SAVED", "QUALIFIED", "DISMISSED"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Sort prospects"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Newest first</option>
            <option value="name">Business A–Z</option>
          </select>
          <select
            aria-label="Saved searches"
            value=""
            onChange={(e) => {
              const s = data.searches.find((s) => s.id === e.target.value);
              if (s) {
                setQuery(s.query);
                setIndustry(s.industry);
                setLocation(s.location);
              }
            }}
          >
            <option value="">Saved searches ({data.searches.length})</option>
            {data.searches.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="toolbar-spacer" />
          <span className="muted">{rows.length} prospects</span>
        </div>
        {selected.length > 0 && (
          <div className="table-toolbar">
            <span>{selected.length} selected</span>
            <button
              className="button secondary small"
              disabled={busy || !write}
              onClick={() => {
                if (
                  window.confirm(
                    "Dismiss selected prospects? Records and evidence will be retained.",
                  )
                )
                  void act(async () => {
                    for (const p of data.prospects.filter((p) =>
                      selected.includes(p.id),
                    ))
                      await api(`prospects/${p.id}`, {
                        ...p,
                        observedAt: p.observedAt?.slice(0, 10) || "",
                        status: "DISMISSED",
                      });
                    setSelected([]);
                  }, "Selected prospects dismissed.");
              }}
            >
              Dismiss selected
            </button>
            <button className="text-button" onClick={() => setSelected([])}>
              Clear selection
            </button>
          </div>
        )}
        {rows.length ? (
          <Table
            headers={[
              "Select",
              "Business",
              "Industry / location",
              "Qualification",
              "Source checked",
              "Pipeline",
            ]}
          >
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${p.name}`}
                    checked={selected.includes(p.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, p.id]
                          : selected.filter((x) => x !== p.id),
                      )
                    }
                  />
                </td>
                <td>
                  <button
                    className="table-link"
                    onClick={() => {
                      setId(p.id);
                      setEdit(false);
                    }}
                  >
                    {p.name}
                  </button>
                  <small className="block">
                    {p.website || "Website unknown"}
                  </small>
                </td>
                <td>
                  {p.industry || "Unknown"}
                  <small className="block">
                    {p.location || "Location unknown"}
                  </small>
                </td>
                <td>
                  <Badge value={p.status} />
                </td>
                <td>
                  {p.observedAt ? dateLabel(p.observedAt) : "Not recorded"}
                </td>
                <td>{p.opportunity ? "In pipeline" : "Not added"}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title={
              data.prospects.length
                ? "No prospects match these filters"
                : "A stronger pipeline starts here"
            }
            description="Add a business you have researched, capture your sources, and qualify it before creating an opportunity."
            action={write ? "Add prospect" : undefined}
            onAction={() => setCreate(true)}
          />
        )}
      </Card>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success-message">
          {message}
        </p>
      )}
      {create && (
        <Modal
          title={research ? "Review discovered business" : "Add prospect"}
          onClose={() => setCreate(false)}
        >
          <div className="modal-body">
            {research && (
              <div className="notice">
                <strong>Review before saving</strong>
                <p>
                  Search title and excerpt are unverified. Confirm the business
                  name, add its own website, and record only facts you observed.
                  Contact details and qualification remain blank until you
                  research them.
                </p>
                <a href={research.url} target="_blank" rel="noreferrer">
                  Open source ↗
                </a>
                <p>{research.description}</p>
              </div>
            )}
            <EditFields
              fields={fields}
              initial={
                research
                  ? {
                      name: research.title,
                      sourceUrl: research.url,
                      status: "SAVED",
                    }
                  : { status: "SAVED" }
              }
              endpoint="prospects"
              submit="Save prospect"
              onSaved={async () => {
                await reload();
                setCreate(false);
                setMessage(
                  "Prospect saved. Open it to review evidence and qualify.",
                );
              }}
            />
          </div>
        </Modal>
      )}
      {saveSearch && (
        <Modal
          title="Save prospect search"
          onClose={() => setSaveSearch(false)}
        >
          <div className="modal-body">
            <EditFields
              fields={[
                { key: "name", label: "Search name", required: true },
                { key: "query", label: "Search text" },
                { key: "industry", label: "Industry" },
                { key: "location", label: "Location" },
              ]}
              initial={{ query, industry, location }}
              endpoint="saved-searches"
              submit="Save search"
              onSaved={async () => {
                await reload();
                setSaveSearch(false);
              }}
            />
          </div>
        </Modal>
      )}
      {prospect && (
        <DetailPanel
          title={prospect.name}
          onClose={() => {
            setId(null);
            setEdit(false);
          }}
        >
          <Badge value={prospect.status} />
          {edit ? (
            <EditFields
              fields={fields}
              initial={{ ...prospect }}
              endpoint={`prospects/${prospect.id}`}
              onSaved={async () => {
                await reload();
                setEdit(false);
              }}
            />
          ) : (
            <>
              <h3>Sourced facts</h3>
              <p className="preserve-lines">
                {prospect.evidence || "No evidence recorded."}
              </p>
              <dl className="detail-list">
                <dt>Email</dt>
                <dd>{prospect.email || "Unknown"}</dd>
                <dt>Phone</dt>
                <dd>{prospect.phone || "Unknown"}</dd>
                <dt>Website</dt>
                <dd>
                  {prospect.website ? (
                    <a href={prospect.website} target="_blank" rel="noreferrer">
                      Visit website ↗
                    </a>
                  ) : (
                    "Unknown"
                  )}
                </dd>
                <dt>Source</dt>
                <dd>
                  {prospect.sourceUrl ? (
                    <a
                      href={prospect.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View source ↗
                    </a>
                  ) : (
                    "No source recorded"
                  )}
                </dd>
                <dt>Freshness</dt>
                <dd>
                  {prospect.observedAt
                    ? `Checked ${dateLabel(prospect.observedAt)}`
                    : "Not verified"}
                </dd>
              </dl>
              <h3>Qualification · your assessment</h3>
              <p className="preserve-lines">
                {prospect.qualification ||
                  "Not assessed. Add your reasoning to qualify this business."}
              </p>
              <p className="muted small-text">
                No automated score or inferred contact information.
              </p>
              {write && (
                <div className="button-row">
                  <button
                    className="button secondary"
                    onClick={() => setEdit(true)}
                  >
                    Edit / qualify prospect
                  </button>
                  {prospect.opportunity ? (
                    <button className="button" onClick={() => go("pipeline")}>
                      Open pipeline <ArrowUpRight size={15} />
                    </button>
                  ) : (
                    <button
                      className="button"
                      disabled={busy || prospect.status !== "QUALIFIED"}
                      onClick={() =>
                        void act(
                          () => api(`prospects/${prospect.id}/convert`, {}),
                          "Opportunity created. Open Pipeline to set the next follow-up.",
                        )
                      }
                    >
                      Add to pipeline
                    </button>
                  )}
                </div>
              )}
              {prospect.status !== "QUALIFIED" && !prospect.opportunity && (
                <small>
                  Qualify this prospect before adding it to the pipeline.
                </small>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
        </DetailPanel>
      )}
    </>
  );
}
