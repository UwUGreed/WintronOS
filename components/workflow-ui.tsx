"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { api } from "./ui";
export function DetailPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
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
        <Dialog.Overlay className="panel-overlay" />
        <Dialog.Content
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
          }}
          ref={content}
          className="detail-panel"
        >
          <div className="panel-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                Record details and next steps
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close details">
              <X size={20} />
            </Dialog.Close>
          </div>
          <div className="panel-content">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export type Field = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: [string, string][];
  help?: string;
};
export function EditFields({
  fields,
  initial,
  endpoint,
  onSaved,
  submit = "Save changes",
}: {
  fields: Field[];
  initial?: Record<string, unknown>;
  endpoint: string;
  onSaved: () => void | Promise<void>;
  submit?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((f) => [
        f.key,
        String(initial?.[f.key] ?? "").slice(
          0,
          f.type === "date" ? 10 : undefined,
        ),
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <form
      data-unsaved={dirty}
      className="workflow-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          await api(endpoint, values);
          setDirty(false);
          await onSaved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((f) => (
        <label key={f.key}>
          <span>
            {f.label}
            {f.required ? " *" : ""}
          </span>
          {f.options ? (
            <select
              aria-label={f.label}
              required={f.required}
              value={values[f.key]}
              onChange={(e) => {
                setDirty(true);
                setValues({ ...values, [f.key]: e.target.value });
              }}
            >
              {f.options.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              aria-label={f.label}
              required={f.required}
              rows={4}
              value={values[f.key]}
              onChange={(e) => {
                setDirty(true);
                setValues({ ...values, [f.key]: e.target.value });
              }}
            />
          ) : (
            <input
              aria-label={f.label}
              required={f.required}
              type={f.type || "text"}
              step={f.type === "number" ? "0.01" : undefined}
              min={f.type === "number" ? "0" : undefined}
              value={values[f.key]}
              onChange={(e) => {
                setDirty(true);
                setValues({ ...values, [f.key]: e.target.value });
              }}
            />
          )}
          {f.help && <small>{f.help}</small>}
        </label>
      ))}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : submit}
        </button>
        {dirty && (
          <span className="muted small-text">
            Unsaved changes · save before closing
          </span>
        )}
      </div>
    </form>
  );
}
