"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import {
  pageRectsFromSelection,
  withAlpha,
} from "@/lib/pdf-geometry";
import type { PdfHighlight, PdfHighlightRect } from "@/lib/types";
import { SelectionColorToolbar } from "@/components/ui/SelectionColorToolbar";
import { usePdfDocument, type PdfPage } from "./pdf/usePdfDocument";

if (typeof Map.prototype.getOrInsertComputed !== "function") {
  Map.prototype.getOrInsertComputed = function (key, callbackFn) {
    if (this.has(key)) return this.get(key);
    const value = callbackFn(key);
    this.set(key, value);
    return value;
  };
}

export type PdfSelectionEvent = {
  page: number;
  rects: PdfHighlightRect[];
  text: string;
};

export type PdfViewerHandle = {
  jumpToHighlight: (highlightId: string) => void;
};

type PdfViewerProps = {
  src: string;
  highlights: PdfHighlight[];
  activeHighlightId: string | null;
  onSelectionHighlight: (selection: PdfSelectionEvent, color: string) => void;
  onHighlightClick: (id: string) => void;
  onDocumentLoaded?: (info: { pageCount: number }) => void;
};

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(
  function PdfViewer(
    {
      src,
      highlights,
      activeHighlightId,
      onSelectionHighlight,
      onHighlightClick,
      onDocumentLoaded,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    const { pdfjs, pages, loading, error } = usePdfDocument(
      src,
      onDocumentLoaded
    );

    const [scale, setScale] = useState(1.25);
    const [scaleReady, setScaleReady] = useState(false);
    const [userScale, setUserScale] = useState<number | null>(null);
    const [selectionToolbar, setSelectionToolbar] = useState<{
      event: PdfSelectionEvent;
      x: number;
      y: number;
    } | null>(null);

    // Reset the scale-ready flag whenever a new document is being loaded
    // so the auto-fit effect re-fires and the first paint isn't
    // stamped at the old scale.
    useEffect(() => {
      if (loading) setScaleReady(userScale !== null);
    }, [loading, userScale]);

    useEffect(() => {
      if (userScale !== null || pages.length === 0 || !containerRef.current) return;
      const container = containerRef.current;
      const maxBaseWidth = Math.max(...pages.map((p) => p.baseWidth));
      const padding = 48;
      let lastWidth = -1;

      const computeAndSet = () => {
        const availableWidth = container.clientWidth - padding;
        if (availableWidth <= 0 || maxBaseWidth <= 0) return;
        if (Math.abs(availableWidth - lastWidth) < 4) return;
        lastWidth = availableWidth;
        setScale(Math.max(0.5, +Math.min(availableWidth / maxBaseWidth, 3).toFixed(2)));
        setScaleReady(true);
      };

      computeAndSet();
      const observer = new ResizeObserver(computeAndSet);
      observer.observe(container);
      return () => observer.disconnect();
    }, [pages, userScale]);

    useImperativeHandle(
      ref,
      () => ({
        jumpToHighlight: (highlightId: string) => {
          const h = highlights.find((x) => x.id === highlightId);
          if (!h) return;
          const pageEl = pageRefs.current.get(h.page);
          if (!pageEl || !containerRef.current) return;
          const container = containerRef.current;
          const pageRect = pageEl.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const topRel =
            pageRect.top -
            containerRect.top +
            container.scrollTop +
            (h.rects[0]?.y ?? 0) * pageRect.height -
            48;
          container.scrollTo({ top: Math.max(0, topRel), behavior: "smooth" });
        },
      }),
      [highlights]
    );

    useEffect(() => {
      if (!pdfjs || pages.length === 0) return;
      let cancelled = false;

      const tasks: Array<{ cancel: () => void }> = [];

      pages.forEach(async (info, index) => {
        const pageEl = pageRefs.current.get(index + 1);
        if (!pageEl) return;
        const canvas = pageEl.querySelector<HTMLCanvasElement>(
          "canvas[data-role='pdf-canvas']"
        );
        const textLayerEl = pageEl.querySelector<HTMLDivElement>(
          "[data-role='pdf-textlayer']"
        );
        if (!canvas || !textLayerEl) return;

        const viewport = info.page.getViewport({ scale });
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        pageEl.style.width = `${Math.floor(viewport.width)}px`;
        pageEl.style.height = `${Math.floor(viewport.height)}px`;

        textLayerEl.innerHTML = "";
        textLayerEl.style.setProperty(
          "--total-scale-factor",
          String(scale)
        );

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        const renderTask = info.page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        } as Parameters<PdfPage["render"]>[0]);
        let activeTextLayer: { cancel?: () => void } | null = null;
        tasks.push({
          cancel: () => {
            try {
              renderTask.cancel();
            } catch {}
            try {
              activeTextLayer?.cancel?.();
            } catch {}
          },
        });
        try {
          await renderTask.promise;
          if (cancelled) return;
          // Pass the raw text-content ReadableStream straight to TextLayer.
          // pdf.js's `page.getTextContent()` does `for await (… of stream)`
          // internally, which throws on browsers without
          // `ReadableStream.prototype[Symbol.asyncIterator]` (Safari < 17.4),
          // breaking the selectable text overlay. `TextLayer` consumes the
          // stream via `getReader()` and works everywhere.
          const textContentSource = (
            info.page as unknown as {
              streamTextContent: (opts?: {
                includeMarkedContent?: boolean;
                disableNormalization?: boolean;
              }) => ReadableStream;
            }
          ).streamTextContent();
          const textLayer = new pdfjs.TextLayer({
            textContentSource,
            container: textLayerEl,
            viewport,
          });
          activeTextLayer = textLayer as unknown as { cancel?: () => void };
          await textLayer.render();
        } catch (err) {
          const name = (err as { name?: string })?.name;
          // Cancellations are expected when the user pans/zooms or the
          // page unmounts mid-render: pdf.js raises
          // `RenderingCancelledException` for canvas tasks and
          // `AbortException` (e.g. "TextLayer task cancelled") for the
          // text-layer stream. Neither is actionable.
          if (name !== "RenderingCancelledException" && name !== "AbortException") {
            console.warn("pdf render error", err);
          }
        }
      });

      return () => {
        cancelled = true;
        tasks.forEach((t) => t.cancel());
      };
    }, [pdfjs, pages, scale]);

    const evaluateSelection = useCallback(() => {
      const container = containerRef.current;
      const selection = window.getSelection();
      if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
        setSelectionToolbar(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const anchorNode = range.commonAncestorContainer;
      const anchorEl = (
        anchorNode.nodeType === 1
          ? (anchorNode as Element)
          : (anchorNode.parentElement as Element | null)
      ) as Element | null;
      const pageEl = anchorEl?.closest<HTMLDivElement>("[data-role='pdf-page']") ?? null;
      if (!pageEl || !container.contains(pageEl)) {
        setSelectionToolbar(null);
        return;
      }
      const pageIndex = Number(pageEl.dataset.pageIndex ?? 0);
      const rects = pageRectsFromSelection(pageEl, range);
      const text = selection.toString().trim();
      if (!rects.length || !text) {
        setSelectionToolbar(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setSelectionToolbar({
        event: { page: pageIndex, rects, text },
        x: rect.left + rect.width / 2 - containerRect.left + container.scrollLeft,
        y: rect.top - containerRect.top + container.scrollTop,
      });
    }, []);

    useEffect(() => {
      const onMouseUp = () => {
        // Defer one frame so selection has settled (Safari fires mouseup before
        // selectionchange in some cases).
        requestAnimationFrame(() => evaluateSelection());
      };
      document.addEventListener("mouseup", onMouseUp);
      return () => document.removeEventListener("mouseup", onMouseUp);
    }, [evaluateSelection]);

    useEffect(() => {
      const onChange = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) setSelectionToolbar(null);
      };
      document.addEventListener("selectionchange", onChange);
      return () => document.removeEventListener("selectionchange", onChange);
    }, []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const onScroll = () => setSelectionToolbar(null);
      container.addEventListener("scroll", onScroll, { passive: true });
      return () => container.removeEventListener("scroll", onScroll);
    }, []);

    const highlightsByPage = useMemo(() => {
      const map = new Map<number, PdfHighlight[]>();
      for (const h of highlights) {
        const list = map.get(h.page) ?? [];
        list.push(h);
        map.set(h.page, list);
      }
      return map;
    }, [highlights]);

    return (
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 text-[11px] text-[var(--pg-muted)]">
          <div className="flex items-center gap-3">
            <span>
              {pages.length ? `${pages.length} pages` : loading ? "Loading…" : "—"}
            </span>
            {error ? (
              <span className="text-red-400">Error: {error}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <button
              className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              onClick={() => {
                setUserScale(null);
              }}
              title="Fit to width"
            >
              Fit
            </button>
            <button
              className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              onClick={() => {
                const next = Math.max(0.5, +(scale - 0.1).toFixed(2));
                setScale(next);
                setUserScale(next);
              }}
            >
              −
            </button>
            <span className="w-10 text-center font-mono">
              {Math.round(scale * 100)}%
            </span>
            <button
              className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              onClick={() => {
                const next = Math.min(3, +(scale + 0.1).toFixed(2));
                setScale(next);
                setUserScale(next);
              }}
            >
              +
            </button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 overflow-auto bg-[var(--pg-bg-elevated)]"
        >
          {!pdfjs || loading ? (
            <div className="flex h-full items-center justify-center text-[11px] text-[var(--pg-muted)]">
              {error ? `Failed: ${error}` : "Preparing PDF viewer…"}
            </div>
          ) : null}

          <div
            className="mx-auto flex flex-col items-center gap-5 py-6"
            style={{ visibility: scaleReady ? "visible" : "hidden" }}
          >
            {pages.map((info, idx) => {
              const pageNum = idx + 1;
              const pageHighlights = highlightsByPage.get(pageNum) ?? [];
              return (
                <div
                  key={pageNum}
                  ref={(el) => {
                    if (el) pageRefs.current.set(pageNum, el);
                    else pageRefs.current.delete(pageNum);
                  }}
                  data-role="pdf-page"
                  data-page-index={pageNum}
                  className="pg-pdf-page bg-white"
                  style={{
                    width: info.baseWidth * scale,
                    height: info.baseHeight * scale,
                  }}
                >
                  <canvas data-role="pdf-canvas" />
                  <div
                    data-role="pdf-textlayer"
                    className="pg-pdf-textlayer"
                  />
                  <div className="pg-pdf-highlight-layer">
                    {pageHighlights.map((h) =>
                      h.rects.map((r, i) => (
                        <div
                          key={`${h.id}-${i}`}
                          className={clsx(
                            "pg-pdf-highlight",
                            activeHighlightId === h.id && "active"
                          )}
                          style={{
                            left: `${r.x * 100}%`,
                            top: `${r.y * 100}%`,
                            width: `${r.width * 100}%`,
                            height: `${r.height * 100}%`,
                            backgroundColor: withAlpha(
                              h.color,
                              activeHighlightId === h.id ? 0.55 : 0.38
                            ),
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            onHighlightClick(h.id);
                          }}
                          title={h.text.slice(0, 140)}
                        />
                      ))
                    )}
                  </div>
                  <div className="pointer-events-none absolute right-2 top-2 rounded-sm bg-black/55 px-1.5 py-0.5 text-[10px] font-mono text-white">
                    {pageNum}
                  </div>
                </div>
              );
            })}
          </div>

          {selectionToolbar ? (
            <SelectionColorToolbar
              top={selectionToolbar.y - 8}
              left={selectionToolbar.x}
              onPickColor={(color) => {
                onSelectionHighlight(selectionToolbar.event, color);
                setSelectionToolbar(null);
                window.getSelection()?.removeAllRanges();
              }}
            />
          ) : null}
        </div>
      </div>
    );
  }
);
