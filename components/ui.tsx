"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Plus, Inbox, ChevronRight } from "lucide-react";
import { Children, useRef, type ReactNode } from "react";
export function Logo() {
  return (
    <div className="brand">
      <img
        className="brand-mark"
        src="/mark.svg"
        width="36"
        height="36"
        alt="Wintron Technologies"
      />
      <div>
        <strong>Wintron OS</strong>
        <small>Wintron Technologies LLC</small>
      </div>
    </div>
  );
}
export function Card({
  title,
  icon,
  action,
  children,
  className = "",
}: {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="card-heading">
          <h2>
            {icon}
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Badge({ value }: { value: string }) {
  const good = [
    "ACTIVE",
    "PAID",
    "SUCCESS",
    "SENT",
    "DELIVERED",
    "COMPLETED",
    "REVIEWED",
  ];
  const bad = ["OVERDUE", "VOID", "FAILED", "CANCELLED"];
  return (
    <span
      className={`badge ${good.includes(value) ? "green" : bad.includes(value) ? "red" : value === "DRAFT" || value === "INACTIVE" ? "gray" : "blue"}`}
    >
      {value.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}
export function Empty({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={23} />
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
      {action && (
        <button className="button small" onClick={onAction}>
          <Plus size={14} />
          {action}
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement),
  );
  const close = () => {
    if (
      !content.current?.querySelector('[data-unsaved="true"]') ||
      window.confirm("Discard unsaved changes?")
    )
      onClose();
  };
  return (
    <Dialog.Root open onOpenChange={(v) => !v && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
          }}
          ref={content}
          className={`modal ${wide ? "wide" : ""}`}
        >
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "Manage your business records securely."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Children.toArray(children).length ? (
            children
          ) : (
            <tr>
              <td colSpan={headers.length}>
                <p className="inset-copy muted">
                  No records match this view. Adjust the filters or add a record
                  to continue.
                </p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
export function ViewAll({ onClick }: { onClick: () => void }) {
  return (
    <button className="text-button" onClick={onClick}>
      View all
      <ChevronRight size={13} />
    </button>
  );
}
export const currency = (v: unknown) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(v || 0));
export const dateLabel = (v: unknown) =>
  v
    ? new Date(String(v)).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch("/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers:
      data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.location.href = "/login";
    throw new Error(result.error || "Request failed");
  }
  return result as T;
}
