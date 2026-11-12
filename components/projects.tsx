"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Card, Table, Empty, Badge, api, dateLabel, today } from "./ui";
import { DetailPanel, EditFields } from "./workflow-ui";
import type { WorkspaceData, Task } from "@/lib/workspace-types";
import type { FormKind } from "./forms";
export function Projects({
  initialStatus,
  openId,
  data,
  write,
  reload,
  openForm,
  openClient,
}: {
  initialStatus?: string;
  openId?: string | null;
  data: WorkspaceData;
  write: boolean;
  reload: () => Promise<void>;
  openForm: (kind: FormKind, initial?: Record<string, unknown>) => void;
  openClient: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(initialStatus || "ALL");
  const [id, setId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingTask, setPendingTask] = useState<{
    id: string;
    completed: boolean;
  } | null>(null);
  useEffect(() => {
    if (openId) setId(openId);
  }, [openId]);
  const project = data.projects.find((p) => p.id === id);
  const rows = data.projects.filter(
    (p) =>
      `${p.name} ${p.client.name} ${p.ownerName}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "ALL" ||
        status === p.status ||
        (status === "DUE" &&
          p.tasks.some(
            (t) =>
              !t.completed && t.dueDate && t.dueDate.slice(0, 10) <= today(),
          ))),
  );
  async function toggle(t: Task) {
    if (busy) return;
    setBusy(true);
    setPendingTask({ id: t.id, completed: !t.completed });
    setError("");
    try {
      await api(`tasks/${t.id}`, {
        ...t,
        dueDate: t.dueDate?.slice(0, 10) || "",
        completed: !t.completed,
      });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setPendingTask(null);
    }
  }
  return (
    <>
      <div className="workspace-intro">
        <p>Deliver the work, with the client and next deadline in reach.</p>
        {write && (
          <button className="button" onClick={() => openForm("project")}>
            <Plus size={16} />
            Add project
          </button>
        )}
      </div>
      <Card>
        <div className="table-toolbar">
          <input
            aria-label="Search projects"
            placeholder="Search projects, clients, owners…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Project status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="ALL">All statuses</option>
            <option value="DUE">Tasks due today or overdue</option>
            {["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <span className="toolbar-spacer" />
          <span>{rows.length} projects</span>
        </div>
        {rows.length ? (
          <Table
            headers={["Project", "Client", "Owner", "Status", "Tasks", "Due"]}
          >
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <button
                    className="table-link"
                    onClick={() => {
                      setId(p.id);
                      setAdding(false);
                    }}
                  >
                    {p.name}
                  </button>
                  <small className="block">
                    {p.description || "No scope recorded"}
                  </small>
                </td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => openClient(p.clientId)}
                  >
                    {p.client.name}
                  </button>
                </td>
                <td>{p.ownerName || "Unassigned"}</td>
                <td>
                  <Badge value={p.status} />
                </td>
                <td>
                  {p.tasks.filter((t) => t.completed).length} / {p.tasks.length}{" "}
                  complete
                </td>
                <td>{dateLabel(p.dueDate)}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title="Give your next project a home"
            description="Connect a client, define the work, and track tasks through delivery."
          />
        )}
      </Card>
      {project && (
        <DetailPanel title={project.name} onClose={() => setId(null)}>
          <Badge value={project.status} />
          <p className="preserve-lines">
            {project.description || "No delivery scope recorded."}
          </p>
          <dl className="detail-list">
            <dt>Client</dt>
            <dd>
              <button
                className="text-button"
                onClick={() => openClient(project.clientId)}
              >
                {project.client.name}
              </button>
            </dd>
            <dt>Owner</dt>
            <dd>{project.ownerName || "Unassigned"}</dd>
            <dt>Due</dt>
            <dd>{dateLabel(project.dueDate)}</dd>
          </dl>
          {write && (
            <button
              className="button secondary"
              onClick={() => openForm("project", { ...project })}
            >
              Edit project / status
            </button>
          )}
          <h3>
            Tasks · {project.tasks.filter((t) => t.completed).length} of{" "}
            {project.tasks.length} complete
          </h3>
          {project.tasks.map((t) => (
            <label className="task-row" key={t.id}>
              <input
                type="checkbox"
                disabled={!write || busy}
                checked={
                  pendingTask?.id === t.id ? pendingTask.completed : t.completed
                }
                onChange={() => void toggle(t)}
              />
              <span>
                {t.title}
                <small className="block">
                  {t.ownerName || "Unassigned"} · {dateLabel(t.dueDate)}
                </small>
              </span>
            </label>
          ))}
          {!project.tasks.length && (
            <p className="muted">Add a task to make the next step clear.</p>
          )}
          {write && (
            <button className="text-button" onClick={() => setAdding(!adding)}>
              Add task
            </button>
          )}
          {adding && (
            <EditFields
              fields={[
                {
                  key: "projectId",
                  label: "Project",
                  options: [[project.id, project.name]],
                },
                { key: "title", label: "Task title", required: true },
                { key: "ownerName", label: "Task owner" },
                { key: "dueDate", label: "Task due date", type: "date" },
              ]}
              initial={{ projectId: project.id, ownerName: project.ownerName }}
              endpoint="tasks"
              submit="Save task"
              onSaved={async () => {
                await reload();
                setAdding(false);
              }}
            />
          )}
          <h3>Related files and billing</h3>
          <p className="muted">
            Open the client workspace to view its documents, invoices, and
            payments. Client billing is not automatically attributed to this
            project.
          </p>
          <button
            className="button secondary"
            onClick={() => openClient(project.clientId)}
          >
            Open client records
          </button>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </DetailPanel>
      )}
    </>
  );
}
