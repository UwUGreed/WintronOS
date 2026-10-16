"use client";
import { useEffect, useState } from "react";
import { Download, Eye, ZoomIn, ZoomOut } from "lucide-react";
import { PdfPreview } from "./pdf-preview";
import { Modal } from "./ui";
import type { Row } from "@/lib/client-types";

export function DocumentLink({
  document,
  label,
}: {
  document: Row;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="text-button"
        onClick={() => setOpen(true)}
      >
        <Eye size={14} />
        {label || String(document.name)}
      </button>
      {open && (
        <DocumentPreview document={document} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function DocumentPreview({
  document,
  onClose,
}: {
  document: Row;
  onClose: () => void;
}) {
  const [source, setSource] = useState("");
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [mime, setMime] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(100);
  const supported = ["application/pdf", "image/png", "image/jpeg"].includes(
    String(document.mimeType),
  );
  useEffect(() => {
    if (!supported) return;
    const controller = new AbortController();
    let objectUrl = "";
    setSource("");
    setPdfBlob(null);
    setError("");
    void (async () => {
      try {
        const response = await fetch(`/api/documents/${document.id}/preview`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || "Unable to load this document.");
        }
        const content = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(content);
        setMime(content.type);
        if (content.type === "application/pdf") setPdfBlob(content);
        setSource(objectUrl);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [document.id, supported, attempt]);
  return (
    <Modal
      title={String(document.name)}
      description="Private document preview"
      onClose={onClose}
      wide
    >
      <div className="document-toolbar">
        <span className="muted">
          {Math.ceil(Number(document.size) / 1024)} KB
        </span>
        {source && mime.startsWith("image/") && (
          <div className="document-zoom">
            <button
              className="icon-button"
              aria-label="Zoom out"
              disabled={zoom <= 50}
              onClick={() => setZoom((v) => Math.max(50, v - 25))}
            >
              <ZoomOut size={17} />
            </button>
            <span>{zoom}%</span>
            <button
              className="icon-button"
              aria-label="Zoom in"
              disabled={zoom >= 300}
              onClick={() => setZoom((v) => Math.min(300, v + 25))}
            >
              <ZoomIn size={17} />
            </button>
          </div>
        )}
        <a
          className="button secondary small"
          href={`/api/documents/${document.id}`}
        >
          <Download size={15} />
          Download
        </a>
      </div>
      <div className="document-viewer">
        {!supported ? (
          <div className="document-message">
            <p>Preview is available for PDF, PNG and JPEG files.</p>
            <p className="muted">
              Download this document to open it in its application.
            </p>
          </div>
        ) : error ? (
          <div className="document-message">
            <p role="alert">{error}</p>
            <button
              className="button secondary"
              onClick={() => setAttempt((v) => v + 1)}
            >
              Try again
            </button>
          </div>
        ) : !source ? (
          <p className="document-message" role="status">
            Loading document…
          </p>
        ) : mime === "application/pdf" ? (
          pdfBlob && <PdfPreview blob={pdfBlob} name={String(document.name)} />
        ) : (
          <div className="document-image-scroll">
            <img
              src={source}
              alt={String(document.name)}
              style={{ width: `${zoom}%` }}
              onError={() =>
                setError(
                  "This image could not be displayed. Download it to inspect the original file.",
                )
              }
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
