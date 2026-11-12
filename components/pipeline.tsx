"use client";
import { useEffect, useState } from "react";
import { Plus, LayoutList, Columns3 } from "lucide-react";
import {
  Card,
  Empty,
  Badge,
  Table,
  Modal,
  currency,
  dateLabel,
  today,
} from "./ui";
import { DetailPanel, EditFields, type Field } from "./workflow-ui";
import type { WorkspaceData } from "@/lib/workspace-types";
import type { State } from "@/lib/client-types";
export const stageDefinitions = [
  ["NEW", "New", "An inquiry to assess"],
  ["QUALIFIED", "Qualified", "Fit reviewed; ready for discovery"],
  ["PROPOSAL", "Proposal", "Preparing or discussing an offer"],
  ["NEGOTIATION", "Negotiation", "Agreeing scope and terms"],
  ["WON", "Won", "Confirmed work, linked to a client"],
  ["LOST", "Lost", "Closed with a recorded reason"],
];
export function Pipeline({
  initialStatus,
  openId,
  data,
  state,
  reload,
  openClient,
  createClient,
}: {
  initialStatus?: string;
  openId?: string | null;
  data: WorkspaceData;
  state: State;
  reload: () => Promise<void>;
  openClient: (id: string) => void;
  createClient: (
    initial: Record<string, unknown>,
    opportunityId: string,
  ) => void;
}) {
  const [view, setView] = useState("table");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState(initialStatus || "ALL");
  const [owner, setOwner] = useState("");
  const [sort, setSort] = useState("followUp");
  const [id, setId] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState(false);
  useEffect(() => {
    if (openId) {
      setId(openId);
      setEdit(false);
    }
  }, [openId]);
  const [stageDraft, setStageDraft] = useState<string | undefined>();
  const write = state.actor.role !== "ACCOUNTANT";
  const opp = data.opportunities.find((o) => o.id === id);
  const fields: Field[] = [
    { key: "name", label: "Opportunity name", required: true },
    {
      key: "stage",
      label: "Stage",
      options: stageDefinitions.map(([v, l]) => [v, l]),
    },
    { key: "ownerName", label: "Owner" },
    {
      key: "value",
      label: "Expected value (USD)",
      type: "number",
      help: "An estimate, excluded from accounting revenue.",
    },
    { key: "followUp", label: "Next follow-up", type: "date" },
    {
      key: "clientId",
      label: "Linked client",
      options: [
        ["", "No client linked"],
        ...state.clients.map((c) => [c.id, c.name] as [string, string]),
      ],
      help: "Required to mark won. Create a client below if needed.",
    },
    {
      key: "lossReason",
      label: "Loss reason",
      type: "textarea",
      help: "Required when marking lost (at least 5 characters).",
    },
  ];
  const rows = data.opportunities
    .filter(
      (o) =>
        o.name.toLowerCase().includes(query.toLowerCase()) &&
        (stage === "ALL" ||
          o.stage === stage ||
          (stage === "OPEN" && !["WON", "LOST"].includes(o.stage)) ||
          (stage === "DUE" &&
            !["WON", "LOST"].includes(o.stage) &&
            !!o.followUp &&
            o.followUp.slice(0, 10) <= today())) &&
        o.ownerName.toLowerCase().includes(owner.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "value"
          ? Number(b.value) - Number(a.value)
          : (a.followUp || "9999").localeCompare(b.followUp || "9999"),
    );
  const open = (id: string) => {
    setId(id);
    setEdit(false);
    setNote(false);
  };
  return (
    <>
      <div className="workspace-intro">
        <p>Every conversation has a next step. Keep yours in view.</p>
        {write && (
          <button className="button" onClick={() => setCreate(true)}>
            <Plus size={16} />
            Add opportunity
          </button>
        )}
      </div>
      <Card>
        <div className="table-toolbar">
          <input
            aria-label="Search opportunities"
            placeholder="Search opportunities…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Filter stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="ALL">All stages</option>
            <option value="OPEN">Open opportunities</option>
            <option value="DUE">Follow-up due</option>
            {stageDefinitions.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input
            aria-label="Filter owner"
            placeholder="All owners"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          />
          <select
            aria-label="Sort opportunities"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="followUp">Next follow-up</option>
            <option value="name">Name A–Z</option>
            <option value="value">Highest value</option>
          </select>
          <div className="view-switch">
            <button
              aria-pressed={view === "table"}
              aria-label="Table view"
              onClick={() => setView("table")}
            >
              <LayoutList size={17} />
              Table
            </button>
            <button
              aria-pressed={view === "kanban"}
              aria-label="Kanban view"
              onClick={() => setView("kanban")}
            >
              <Columns3 size={17} />
              Board
            </button>
          </div>
        </div>
        {!rows.length ? (
          <Empty
            title="Make room for your next opportunity"
            description="Qualify a saved prospect or add an inquiry. Stage changes and follow-ups are saved to the same records in both views."
          />
        ) : view === "table" ? (
          <Table
            headers={[
              "Opportunity",
              "Stage",
              "Owner",
              "Expected value",
              "Next follow-up",
            ]}
          >
            {rows.map((o) => (
              <tr key={o.id}>
                <td>
                  <button className="table-link" onClick={() => open(o.id)}>
                    {o.name}
                  </button>
                </td>
                <td>
                  <Badge value={o.stage} />
                </td>
                <td>{o.ownerName || "Unassigned"}</td>
                <td>{currency(o.value)}</td>
                <td>{dateLabel(o.followUp)}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <div className="kanban">
            {stageDefinitions.map(([s, l, d]) => (
              <section key={s} className="kanban-column">
                <h3>
                  {l}
                  <small>{rows.filter((o) => o.stage === s).length}</small>
                </h3>
                <p className="muted small-text">{d}</p>
                {rows
                  .filter((o) => o.stage === s)
                  .map((o) => (
                    <button
                      className="opportunity-card"
                      key={o.id}
                      onClick={() => open(o.id)}
                    >
                      <strong>{o.name}</strong>
                      <span>{currency(o.value)}</span>
                      <small>
                        {o.ownerName || "Unassigned"} · {dateLabel(o.followUp)}
                      </small>
                    </button>
                  ))}
              </section>
            ))}
          </div>
        )}
      </Card>
      <details className="stage-guide">
        <summary>What do the stages mean?</summary>
        {stageDefinitions.map(([s, l, d]) => (
          <p key={s}>
            <strong>{l}:</strong> {d}.
          </p>
        ))}
        <p>
          Open an opportunity and choose “Change stage / follow-up.” No dragging
          required. Stage labels do not assert proposal acceptance or contract
          signature.
        </p>
      </details>
      {create && (
        <Modal title="Add opportunity" onClose={() => setCreate(false)}>
          <div className="modal-body">
            <EditFields
              fields={fields}
              initial={{
                stage: "NEW",
                value: "0",
                ownerName: state.actor.name,
              }}
              endpoint="opportunities"
              submit="Create opportunity"
              onSaved={async () => {
                await reload();
                setCreate(false);
              }}
            />
          </div>
        </Modal>
      )}
      {opp && (
        <DetailPanel title={opp.name} onClose={() => setId(null)}>
          <Badge value={opp.stage} />
          {edit ? (
            <EditFields
              fields={fields}
              initial={{ ...opp, stage: stageDraft || opp.stage }}
              endpoint={`opportunities/${opp.id}`}
              onSaved={async () => {
                await reload();
                setEdit(false);
              }}
            />
          ) : (
            <>
              <dl className="detail-list">
                <dt>Owner</dt>
                <dd>{opp.ownerName || "Unassigned"}</dd>
                <dt>Expected value</dt>
                <dd>{currency(opp.value)}</dd>
                <dt>Next follow-up</dt>
                <dd>{dateLabel(opp.followUp)}</dd>
                <dt>Source prospect</dt>
                <dd>
                  {opp.prospect ? (
                    <a
                      href={`/?module=prospecting&record=${encodeURIComponent(opp.prospect.id)}`}
                    >
                      {opp.prospect.name} ↗
                    </a>
                  ) : (
                    "Direct inquiry"
                  )}
                </dd>
                <dt>Client</dt>
                <dd>
                  {opp.clientId ? (
                    <button
                      className="text-button"
                      onClick={() => openClient(opp.clientId!)}
                    >
                      {state.clients.find((c) => c.id === opp.clientId)?.name ||
                        "Open client"}
                    </button>
                  ) : (
                    "Not linked"
                  )}
                </dd>
              </dl>
              {opp.prospect && (
                <>
                  <h3>Qualification evidence</h3>
                  <p className="preserve-lines">
                    {opp.prospect.evidence || "No sourced facts recorded."}
                  </p>
                  {opp.prospect.sourceUrl && (
                    <a
                      href={opp.prospect.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View original source ↗
                    </a>
                  )}
                  <p className="muted">
                    Assessment: {opp.prospect.qualification || "Not assessed"}
                  </p>
                </>
              )}
              {opp.stage === "LOST" && <p>Loss reason: {opp.lossReason}</p>}
              {write && (
                <div className="button-row">
                  <button
                    className="button"
                    onClick={() => {
                      setStageDraft(undefined);
                      setEdit(true);
                    }}
                  >
                    Change stage / follow-up
                  </button>
                  {!["WON", "LOST"].includes(opp.stage) && (
                    <>
                      <button
                        className="button secondary"
                        onClick={() => {
                          setStageDraft("WON");
                          setEdit(true);
                        }}
                      >
                        Mark won
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => {
                          setStageDraft("LOST");
                          setEdit(true);
                        }}
                      >
                        Mark lost
                      </button>
                    </>
                  )}
                  {!opp.clientId && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        createClient(
                          {
                            name: opp.name,
                            email: opp.prospect?.email || "",
                            website: opp.prospect?.website || "",
                            phone: opp.prospect?.phone || "",
                          },
                          opp.id,
                        )
                      }
                    >
                      Create linked client
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          <div className="section-label">
            <h3>Notes</h3>
            {write && (
              <button className="text-button" onClick={() => setNote(!note)}>
                Add note
              </button>
            )}
          </div>
          {note && (
            <EditFields
              fields={[
                {
                  key: "content",
                  label: "Opportunity note",
                  required: true,
                  type: "textarea",
                },
              ]}
              endpoint={`opportunities/${opp.id}/notes`}
              submit="Save note"
              onSaved={async () => {
                await reload();
                setNote(false);
              }}
            />
          )}
          {opp.notes.length ? (
            opp.notes.map((n) => (
              <article className="timeline-note" key={n.id}>
                <p className="preserve-lines">{n.content}</p>
                <small>
                  {n.authorName} · {dateLabel(n.createdAt)}
                </small>
              </article>
            ))
          ) : (
            <p className="muted">
              Capture discovery notes and the next agreed action.
            </p>
          )}
        </DetailPanel>
      )}
    </>
  );
}
