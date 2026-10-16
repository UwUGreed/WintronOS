"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";

export function PdfPreview({ blob, name }: { blob: Blob; name: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);
  const [pageText, setPageText] = useState("");
  const [width, setWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    void (async () => {
      try {
        const library = await import("pdfjs-dist");
        const assetBase = `/pdfjs/${library.version}/`;
        library.GlobalWorkerOptions.workerSrc =
          assetBase + "pdf.worker.min.mjs";
        const data = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return;
        loadingTask = library.getDocument({
          data,
          cMapUrl: assetBase + "cmaps/",
          cMapPacked: true,
          standardFontDataUrl: assetBase + "standard_fonts/",
          wasmUrl: assetBase + "wasm/",
          maxImageSize: 16000000,
        });
        const loaded = await loadingTask.promise;
        if (!cancelled) setPdf(loaded);
      } catch (e) {
        if (!cancelled) {
          const passwordProtected = (e as Error).name === "PasswordException";
          setError(
            passwordProtected
              ? "This PDF is password protected. Download it to open it with its password."
              : "This PDF could not be displayed. Download it to inspect the original file.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [blob]);
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(180, entries[0].contentRect.width - 24)),
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    setRendering(true);
    setPageText("");
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const base = page.getViewport({ scale: 1 });
        const requestedScale = ((width / base.width) * zoom) / 100;
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const scale = Math.min(
          requestedScale,
          Math.sqrt(16000000 / (base.width * base.height)) / outputScale,
        );
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        renderTask = page.render({
          canvas,
          viewport,
          transform: [outputScale, 0, 0, outputScale, 0, 0],
        });
        await renderTask.promise;
        if (!cancelled) setRendering(false);
        const text = await page.getTextContent();
        if (!cancelled)
          setPageText(
            text.items.map((item) => ("str" in item ? item.str : "")).join(" "),
          );
      } catch (e) {
        if (!cancelled && (e as Error).name !== "RenderingCancelledException")
          setError(
            "This PDF page could not be rendered. Download it to inspect the original file.",
          );
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber, zoom, width]);
  return (
    <div className="pdf-preview">
      {pdf && (
        <div className="pdf-controls">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous page"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => p - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span aria-live="polite">
            Page {pageNumber} of {pdf.numPages}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Next page"
            disabled={pageNumber >= pdf.numPages}
            onClick={() => setPageNumber((p) => p + 1)}
          >
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom out"
            disabled={zoom <= 50}
            onClick={() => setZoom((v) => Math.max(50, v - 25))}
          >
            <ZoomOut size={17} />
          </button>
          <span>{zoom}%</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom in"
            disabled={zoom >= 250}
            onClick={() => setZoom((v) => Math.min(250, v + 25))}
          >
            <ZoomIn size={17} />
          </button>
        </div>
      )}
      <div className="pdf-pages" ref={containerRef}>
        {error ? (
          <p role="alert" className="document-message">
            {error}
          </p>
        ) : (
          <>
            {rendering && (
              <p role="status" className="pdf-loading">
                Rendering PDF…
              </p>
            )}
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`${name}, page ${pageNumber}`}
              data-rendered={pdf && !rendering ? "true" : "false"}
              style={{ visibility: pdf && !rendering ? "visible" : "hidden" }}
            />
            {pageText && <p className="sr-only">{pageText}</p>}
          </>
        )}
      </div>
    </div>
  );
}
