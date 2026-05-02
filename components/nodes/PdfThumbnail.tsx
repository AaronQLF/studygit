"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";

type PdfJsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJsModule> | null = null;
function loadPdfJs(): Promise<PdfJsModule> {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const lib = await import("pdfjs-dist");
    if (!lib.GlobalWorkerOptions.workerSrc) {
      lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${lib.version}/build/pdf.worker.min.mjs`;
    }
    return lib;
  })();
  return pdfjsPromise;
}

const cache = new Map<string, string>();

export function PdfThumbnail({
  src,
  width = 280,
  className,
  onRetry,
}: {
  src: string;
  width?: number;
  className?: string;
  onRetry?: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(() => cache.get(src) ?? null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const placeholderClass = [
    "flex min-h-32 w-full items-center justify-center rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-elevated)] text-[var(--pg-muted)]",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    cancelRef.current = false;
    if (!src) return;
    const cached = cache.get(src);
    if (cached) {
      setDataUrl(cached);
      return;
    }
    setDataUrl(null);
    setError(null);
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const doc = await pdfjs.getDocument(src).promise;
        if (cancelRef.current) {
          await doc.destroy();
          return;
        }
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const scale = width / viewport.width;
        const scaled = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(scaled.width * dpr);
        canvas.height = Math.floor(scaled.height * dpr);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no canvas context");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        await page.render({
          canvasContext: ctx,
          viewport: scaled,
          canvas,
        } as Parameters<typeof page.render>[0]).promise;
        if (cancelRef.current) {
          await doc.destroy();
          return;
        }
        const url = canvas.toDataURL("image/png");
        cache.set(src, url);
        setDataUrl(url);
        await doc.destroy();
      } catch (err) {
        if (!cancelRef.current) setError((err as Error).message);
      }
    })();
    return () => {
      cancelRef.current = true;
    };
  }, [src, width]);

  if (error) {
    return (
      <div className={`${placeholderClass} flex-col gap-2 px-3 text-center`}>
        <FileText size={18} className="text-[var(--pg-muted)]" />
        <div className="pg-serif text-[11px] italic text-[var(--pg-muted)]">
          Preview unavailable
        </div>
        {onRetry ? (
          <button
            type="button"
            className="rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] px-2 py-1 text-[10px] text-[var(--pg-fg-soft)] hover:bg-[var(--pg-bg-elevated)]"
            onClick={(event) => {
              event.stopPropagation();
              onRetry();
            }}
          >
            Retry preview
          </button>
        ) : null}
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div className={`${placeholderClass} flex-col gap-2 px-3 text-center`}>
        <FileText size={18} className="animate-pulse text-[var(--pg-muted)]" />
        <span className="text-[10px] text-[var(--pg-muted)]">Rendering first page...</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt="PDF preview"
      className={
        className ??
        "block w-full rounded-md border border-[var(--pg-border)] bg-white object-contain"
      }
    />
  );
}
