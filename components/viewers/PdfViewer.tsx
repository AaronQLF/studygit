"use client";

// PDF viewer: virtualized pdf.js rendering with highlights, text
// selection, search, and page navigation.
//
// Rendering model — only pages near the viewport are real:
//   - Every page gets a correctly-sized container div up front (we know
//     baseWidth/Height × scale without rendering), so the scrollbar and
//     jump targets are exact from the first frame.
//   - An IntersectionObserver with a generous rootMargin marks pages
//     "near" the viewport; only those get a canvas render + text layer.
//     Pages that scroll far away are torn back down to free canvas
//     memory — a 600-page textbook holds ~5 live canvases instead of 600.
//   - Zoom changes re-render only the live pages, anchored so the point
//     you were reading stays put.
//
// Search builds a lazy per-page text index (pdf.js getTextContent) the
// first time it's used, then marks matches directly in the rendered
// text layers. ⌘F focuses it while the pointer is in the viewer;
// Enter / Shift+Enter step through matches across pages.

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
  ChevronDown,
  ChevronUp,
  Loader2,
  Moon,
  Search,
  X,
} from "lucide-react";
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

const DIM_STORAGE_KEY = "studygit:pdf-dim";
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

// ---------------------------------------------------------------------
// Search-mark DOM helpers. The text layer is plain spans of text nodes;
// we wrap case-insensitive matches in <mark> elements and unwrap them
// when the query changes. Operating on the DOM (not re-rendering) keeps
// pdf.js's carefully positioned spans byte-identical.
// ---------------------------------------------------------------------

function clearMarks(textLayerEl: HTMLElement): void {
  const marks = textLayerEl.querySelectorAll("mark.pg-pdf-mark");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

function applyMarks(textLayerEl: HTMLElement, query: string): void {
  clearMarks(textLayerEl);
  const q = query.trim().toLowerCase();
  if (!q) return;
  const spans = textLayerEl.querySelectorAll<HTMLElement>("span");
  spans.forEach((span) => {
    // pdf.js emits one text node per span; skip anything unusual.
    const textNode = span.firstChild;
    if (
      !textNode ||
      textNode.nodeType !== Node.TEXT_NODE ||
      span.childNodes.length !== 1
    ) {
      return;
    }
    const text = textNode.textContent ?? "";
    const lower = text.toLowerCase();
    if (!lower.includes(q)) return;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let at = lower.indexOf(q);
    while (at !== -1) {
      if (at > cursor) {
        fragment.appendChild(
          document.createTextNode(text.slice(cursor, at))
        );
      }
      const mark = document.createElement("mark");
      mark.className = "pg-pdf-mark";
      mark.textContent = text.slice(at, at + q.length);
      fragment.appendChild(mark);
      cursor = at + q.length;
      at = lower.indexOf(q, cursor);
    }
    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }
    span.replaceChild(fragment, textNode);
  });
}

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

    // Virtualization: which pages are near the viewport right now.
    const [livePages, setLivePages] = useState<Set<number>>(() => new Set());
    // Per-page "rendered at scale" bookkeeping so the render effect can
    // skip work that's already up to date and tear down far pages.
    const renderedScaleRef = useRef<Map<number, number>>(new Map());
    // Pages with a live canvas — drives the "pending" shimmer class from
    // React state (classList toggles would be clobbered by re-renders).
    const [renderedPages, setRenderedPages] = useState<Set<number>>(
      () => new Set()
    );

    // Page navigation.
    const [currentPage, setCurrentPage] = useState(1);
    const [pageDraft, setPageDraft] = useState<string | null>(null);

    // Dark-friendly reading mode (inverts page pixels).
    const [dimPages, setDimPages] = useState(false);

    // Search.
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [indexing, setIndexing] = useState(false);
    const [matches, setMatches] = useState<
      Array<{ page: number; idxOnPage: number }>
    >([]);
    const [activeMatch, setActiveMatch] = useState(0);
    const queryRef = useRef("");
    const textIndexRef = useRef<{ src: string; pages: string[][] } | null>(
      null
    );
    const pendingMarkRef = useRef<{ page: number; idxOnPage: number } | null>(
      null
    );
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      queueMicrotask(() => {
        try {
          setDimPages(window.localStorage.getItem(DIM_STORAGE_KEY) === "1");
        } catch {
          // localStorage unavailable — keep default.
        }
      });
    }, []);

    const toggleDim = useCallback(() => {
      setDimPages((v) => {
        try {
          window.localStorage.setItem(DIM_STORAGE_KEY, v ? "0" : "1");
        } catch {
          // noop
        }
        return !v;
      });
    }, []);

    // Reset per-document state on src change.
    useEffect(() => {
      renderedScaleRef.current.clear();
      setLivePages(new Set());
      setRenderedPages(new Set());
      setCurrentPage(1);
      setMatches([]);
      setActiveMatch(0);
      setQuery("");
      queryRef.current = "";
      textIndexRef.current = null;
      pendingMarkRef.current = null;
    }, [src]);

    // Reset the scale-ready flag whenever a new document is being loaded
    // so the auto-fit effect re-fires and the first paint isn't stamped
    // at the old scale.
    useEffect(() => {
      if (loading) setScaleReady(userScale !== null);
    }, [loading, userScale]);

    // Fit-to-width until the user zooms manually.
    useEffect(() => {
      if (userScale !== null || pages.length === 0 || !containerRef.current)
        return;
      const container = containerRef.current;
      const maxBaseWidth = Math.max(...pages.map((p) => p.baseWidth));
      const padding = 48;
      let lastWidth = -1;

      const computeAndSet = () => {
        const availableWidth = container.clientWidth - padding;
        if (availableWidth <= 0 || maxBaseWidth <= 0) return;
        if (Math.abs(availableWidth - lastWidth) < 4) return;
        lastWidth = availableWidth;
        setScale(
          Math.max(
            MIN_SCALE,
            +Math.min(availableWidth / maxBaseWidth, MAX_SCALE).toFixed(2)
          )
        );
        setScaleReady(true);
      };

      computeAndSet();
      const observer = new ResizeObserver(computeAndSet);
      observer.observe(container);
      return () => observer.disconnect();
    }, [pages, userScale]);

    // Zoom that keeps the current reading position anchored: capture the
    // viewport-center as a fraction of the scroll height, restore it after
    // the new scale has laid out (page dims are set declaratively from
    // `scale`, so the next frame is accurate).
    const setScaleAnchored = useCallback((next: number) => {
      const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, +next.toFixed(2)));
      const container = containerRef.current;
      if (!container) {
        setScale(clamped);
        return;
      }
      const ratio =
        (container.scrollTop + container.clientHeight / 2) /
        Math.max(1, container.scrollHeight);
      setScale(clamped);
      requestAnimationFrame(() => {
        const c = containerRef.current;
        if (!c) return;
        c.scrollTop = ratio * c.scrollHeight - c.clientHeight / 2;
      });
    }, []);

    // ---- virtualization ------------------------------------------------
    useEffect(() => {
      const container = containerRef.current;
      if (!container || pages.length === 0) return;
      const observer = new IntersectionObserver(
        (entries) => {
          setLivePages((prev) => {
            let changed = false;
            const next = new Set(prev);
            for (const entry of entries) {
              const num = Number(
                (entry.target as HTMLElement).dataset.pageIndex
              );
              if (!num) continue;
              if (entry.isIntersecting && !next.has(num)) {
                next.add(num);
                changed = true;
              } else if (!entry.isIntersecting && next.has(num)) {
                next.delete(num);
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        },
        // Pre-render roughly one viewport above and below so normal
        // scrolling never catches a blank page.
        { root: container, rootMargin: "120% 0px" }
      );
      pageRefs.current.forEach((el) => observer.observe(el));
      return () => observer.disconnect();
    }, [pages]);

    // Track the page under the viewport center for the toolbar indicator.
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      let raf = 0;
      const measure = () => {
        raf = 0;
        const probe =
          container.scrollTop + Math.min(160, container.clientHeight * 0.35);
        let best = 1;
        pageRefs.current.forEach((el, num) => {
          if (el.offsetTop <= probe) {
            best = Math.max(best, num);
          }
        });
        setCurrentPage((prev) => (prev === best ? prev : best));
      };
      const onScroll = () => {
        if (!raf) raf = requestAnimationFrame(measure);
      };
      container.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        container.removeEventListener("scroll", onScroll);
        if (raf) cancelAnimationFrame(raf);
      };
    }, [pages.length]);

    const scrollToPage = useCallback((pageNum: number) => {
      const el = pageRefs.current.get(pageNum);
      const container = containerRef.current;
      if (!el || !container) return;
      container.scrollTo({ top: Math.max(0, el.offsetTop - 16) });
      setCurrentPage(pageNum);
    }, []);

    const commitPageDraft = useCallback(() => {
      if (pageDraft == null) return;
      const n = Math.max(1, Math.min(pages.length, Number(pageDraft) || 1));
      setPageDraft(null);
      scrollToPage(n);
    }, [pageDraft, pages.length, scrollToPage]);

    useImperativeHandle(
      ref,
      () => ({
        jumpToHighlight: (highlightId: string) => {
          const h = highlights.find((x) => x.id === highlightId);
          if (!h) return;
          const pageEl = pageRefs.current.get(h.page);
          if (!pageEl || !containerRef.current) return;
          const container = containerRef.current;
          const topRel =
            pageEl.offsetTop +
            (h.rects[0]?.y ?? 0) * pageEl.offsetHeight -
            48;
          container.scrollTo({ top: Math.max(0, topRel), behavior: "smooth" });
        },
      }),
      [highlights]
    );

    // Activate (style + reveal) the nth match mark on a page. Returns
    // false when the page hasn't rendered its marks yet.
    const activateMark = useCallback(
      (page: number, idxOnPage: number): boolean => {
        const container = containerRef.current;
        if (!container) return false;
        container
          .querySelectorAll("mark.pg-pdf-mark.active")
          .forEach((m) => m.classList.remove("active"));
        const pageEl = pageRefs.current.get(page);
        if (!pageEl) return false;
        const marks = pageEl.querySelectorAll("mark.pg-pdf-mark");
        if (marks.length === 0) return false;
        const target = marks[Math.min(idxOnPage, marks.length - 1)];
        target.classList.add("active");
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        return true;
      },
      []
    );

    const jumpToMatch = useCallback(
      (match: { page: number; idxOnPage: number }) => {
        if (!activateMark(match.page, match.idxOnPage)) {
          // Page not rendered yet — scroll it into view; the render
          // effect picks the pending match up once its marks exist.
          pendingMarkRef.current = match;
          scrollToPage(match.page);
        }
      },
      [activateMark, scrollToPage]
    );

    // ---- page rendering -------------------------------------------------
    // Per-page render tasks persist ACROSS effect passes (in a ref) rather
    // than being cancelled by the effect cleanup. A livePages change while
    // page N is mid-render must not cancel N's still-relevant render —
    // with cleanup-cancellation the next pass would see stale "already
    // rendered" bookkeeping and leave the page permanently blank.
    const inFlightRef = useRef<
      Map<number, { scale: number; cancel: () => void }>
    >(new Map());

    // Unmount-only sweep.
    useEffect(() => {
      const inFlight = inFlightRef.current;
      return () => {
        inFlight.forEach((task) => task.cancel());
        inFlight.clear();
      };
    }, []);

    useEffect(() => {
      if (!pdfjs || pages.length === 0) return;

      const teardownPage = (pageNum: number) => {
        renderedScaleRef.current.delete(pageNum);
        setRenderedPages((prev) => {
          if (!prev.has(pageNum)) return prev;
          const next = new Set(prev);
          next.delete(pageNum);
          return next;
        });
        const pageEl = pageRefs.current.get(pageNum);
        if (!pageEl) return;
        const canvas = pageEl.querySelector<HTMLCanvasElement>(
          "canvas[data-role='pdf-canvas']"
        );
        const textLayerEl = pageEl.querySelector<HTMLDivElement>(
          "[data-role='pdf-textlayer']"
        );
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
          canvas.style.width = "0px";
          canvas.style.height = "0px";
        }
        if (textLayerEl) textLayerEl.innerHTML = "";
      };

      // Pages that drifted far from the viewport: cancel any in-flight
      // render and free their canvas memory.
      inFlightRef.current.forEach((task, pageNum) => {
        if (livePages.has(pageNum)) return;
        task.cancel();
        inFlightRef.current.delete(pageNum);
      });
      renderedScaleRef.current.forEach((_, pageNum) => {
        if (!livePages.has(pageNum)) teardownPage(pageNum);
      });

      livePages.forEach((pageNum) => {
        const info = pages[pageNum - 1];
        const pageEl = pageRefs.current.get(pageNum);
        if (!info || !pageEl) return;

        const existing = inFlightRef.current.get(pageNum);
        if (existing) {
          if (existing.scale === scale) return; // still-relevant render
          existing.cancel(); // stale scale — replace it
          inFlightRef.current.delete(pageNum);
        }
        if (renderedScaleRef.current.get(pageNum) === scale) return;

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

        textLayerEl.innerHTML = "";
        textLayerEl.style.setProperty("--total-scale-factor", String(scale));

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        const renderTask = info.page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        } as Parameters<PdfPage["render"]>[0]);

        let activeTextLayer: { cancel?: () => void } | null = null;
        const handle = {
          scale,
          cancel: () => {
            try {
              renderTask.cancel();
            } catch {}
            try {
              activeTextLayer?.cancel?.();
            } catch {}
          },
        };
        inFlightRef.current.set(pageNum, handle);

        const run = async () => {
          try {
            await renderTask.promise;
            // Stream text content straight to TextLayer — see note in
            // usePdfDocument about Safari's missing async iterator.
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

            renderedScaleRef.current.set(pageNum, scale);
            setRenderedPages((prev) => {
              if (prev.has(pageNum)) return prev;
              const next = new Set(prev);
              next.add(pageNum);
              return next;
            });
            if (queryRef.current) {
              applyMarks(textLayerEl, queryRef.current);
              const pending = pendingMarkRef.current;
              if (pending && pending.page === pageNum) {
                pendingMarkRef.current = null;
                activateMark(pending.page, pending.idxOnPage);
              }
            }
          } catch (err) {
            const name = (err as { name?: string })?.name;
            // Cancellations are expected on zoom/scroll churn —
            // RenderingCancelledException for canvas tasks, AbortException
            // for the text-layer stream. Neither is actionable; the page
            // simply re-renders next time it qualifies.
            if (
              name !== "RenderingCancelledException" &&
              name !== "AbortException"
            ) {
              console.warn("pdf render error", err);
            }
          } finally {
            if (inFlightRef.current.get(pageNum) === handle) {
              inFlightRef.current.delete(pageNum);
            }
          }
        };
        void run();
      });
    }, [pdfjs, pages, scale, livePages, activateMark]);

    // ---- search ----------------------------------------------------------
    const ensureIndex = useCallback(async (): Promise<string[][]> => {
      if (textIndexRef.current?.src === src) return textIndexRef.current.pages;
      setIndexing(true);
      const all: string[][] = [];
      try {
        for (const info of pages) {
          const tc = await info.page.getTextContent();
          all.push(
            (tc.items as Array<{ str?: string }>).map((it) => it.str ?? "")
          );
        }
        textIndexRef.current = { src, pages: all };
      } finally {
        setIndexing(false);
      }
      return all;
    }, [src, pages]);

    const runSearch = useCallback(
      async (rawQuery: string) => {
        const q = rawQuery.trim().toLowerCase();
        queryRef.current = q;
        // Re-mark every live page for the new query.
        pageRefs.current.forEach((pageEl, pageNum) => {
          if (!renderedScaleRef.current.has(pageNum)) return;
          const textLayerEl = pageEl.querySelector<HTMLDivElement>(
            "[data-role='pdf-textlayer']"
          );
          if (textLayerEl) applyMarks(textLayerEl, q);
        });
        if (!q) {
          setMatches([]);
          setActiveMatch(0);
          return;
        }
        const index = await ensureIndex();
        // The query may have changed while indexing — only the newest run
        // gets to publish results.
        if (queryRef.current !== q) return;
        const found: Array<{ page: number; idxOnPage: number }> = [];
        index.forEach((items, pageIdx) => {
          let onPage = 0;
          for (const item of items) {
            const lower = item.toLowerCase();
            let at = lower.indexOf(q);
            while (at !== -1) {
              found.push({ page: pageIdx + 1, idxOnPage: onPage });
              onPage += 1;
              at = lower.indexOf(q, at + q.length);
            }
          }
        });
        setMatches(found);
        setActiveMatch(0);
        if (found.length > 0) jumpToMatch(found[0]);
      },
      [ensureIndex, jumpToMatch]
    );

    const onQueryChange = useCallback(
      (next: string) => {
        setQuery(next);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
          searchTimerRef.current = null;
          void runSearch(next);
        }, 250);
      },
      [runSearch]
    );

    const stepMatch = useCallback(
      (dir: 1 | -1) => {
        if (matches.length === 0) return;
        const next =
          (activeMatch + dir + matches.length) % matches.length;
        setActiveMatch(next);
        jumpToMatch(matches[next]);
      },
      [matches, activeMatch, jumpToMatch]
    );

    const closeSearch = useCallback(() => {
      setSearchOpen(false);
      setQuery("");
      queryRef.current = "";
      setMatches([]);
      setActiveMatch(0);
      pageRefs.current.forEach((pageEl) => {
        const textLayerEl = pageEl.querySelector<HTMLDivElement>(
          "[data-role='pdf-textlayer']"
        );
        if (textLayerEl) clearMarks(textLayerEl);
      });
    }, []);

    // ⌘F inside the viewer opens/focuses search instead of the browser's.
    const onRootKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "f"
        ) {
          event.preventDefault();
          event.stopPropagation();
          setSearchOpen(true);
          requestAnimationFrame(() => searchInputRef.current?.focus());
        }
      },
      []
    );

    // ---- selection → highlight ------------------------------------------
    const evaluateSelection = useCallback(() => {
      const container = containerRef.current;
      const selection = window.getSelection();
      if (
        !container ||
        !selection ||
        selection.isCollapsed ||
        selection.rangeCount === 0
      ) {
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
      const pageEl =
        anchorEl?.closest<HTMLDivElement>("[data-role='pdf-page']") ?? null;
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
        x:
          rect.left +
          rect.width / 2 -
          containerRect.left +
          container.scrollLeft,
        y: rect.top - containerRect.top + container.scrollTop,
      });
    }, []);

    useEffect(() => {
      const onMouseUp = () => {
        // Defer one frame so selection has settled (Safari fires mouseup
        // before selectionchange in some cases).
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
      <div
        className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col"
        onKeyDownCapture={onRootKeyDown}
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2 text-[11px] text-[var(--pg-muted)]">
          {/* Page navigation */}
          <div className="flex items-center gap-0.5">
            <button
              className="rounded-md p-1 transition-colors hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)] disabled:opacity-40"
              onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              title="Previous page"
            >
              <ChevronUp size={13} />
            </button>
            <input
              value={pageDraft ?? String(currentPage)}
              onChange={(e) =>
                setPageDraft(e.target.value.replace(/[^0-9]/g, ""))
              }
              onFocus={(e) => {
                setPageDraft(String(currentPage));
                e.currentTarget.select();
              }}
              onBlur={commitPageDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitPageDraft();
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  setPageDraft(null);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-9 rounded-md border border-transparent bg-transparent text-center font-mono tabular-nums text-[var(--pg-fg)] outline-none focus:border-[var(--pg-border-strong)] focus:bg-[var(--pg-bg)]"
              aria-label="Current page"
            />
            <span className="font-mono text-[var(--pg-muted)]">
              / {pages.length || "—"}
            </span>
            <button
              className="rounded-md p-1 transition-colors hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)] disabled:opacity-40"
              onClick={() =>
                scrollToPage(Math.min(pages.length, currentPage + 1))
              }
              disabled={currentPage >= pages.length}
              title="Next page"
            >
              <ChevronDown size={13} />
            </button>
          </div>

          {error ? (
            <span className="truncate text-red-400">Error: {error}</span>
          ) : loading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" /> Loading…
            </span>
          ) : null}

          <div className="ml-auto flex min-w-0 items-center gap-1">
            {/* Search */}
            {searchOpen ? (
              <div className="flex items-center gap-1 rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg)] pl-1.5">
                <Search size={11} className="shrink-0" />
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      stepMatch(e.shiftKey ? -1 : 1);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      closeSearch();
                    }
                  }}
                  placeholder="Search in PDF…"
                  className="w-[120px] bg-transparent py-1 text-[11px] text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)]"
                />
                <span className="shrink-0 font-mono tabular-nums">
                  {indexing ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : matches.length > 0 ? (
                    `${activeMatch + 1}/${matches.length}`
                  ) : query.trim() ? (
                    "0"
                  ) : (
                    ""
                  )}
                </span>
                <button
                  className="rounded p-1 hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)] disabled:opacity-40"
                  onClick={() => stepMatch(-1)}
                  disabled={matches.length === 0}
                  title="Previous match (Shift+Enter)"
                >
                  <ChevronUp size={11} />
                </button>
                <button
                  className="rounded p-1 hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)] disabled:opacity-40"
                  onClick={() => stepMatch(1)}
                  disabled={matches.length === 0}
                  title="Next match (Enter)"
                >
                  <ChevronDown size={11} />
                </button>
                <button
                  className="rounded p-1 hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
                  onClick={closeSearch}
                  title="Close search (Esc)"
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <button
                className="rounded-md p-1.5 transition-colors hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
                onClick={() => {
                  setSearchOpen(true);
                  requestAnimationFrame(() =>
                    searchInputRef.current?.focus()
                  );
                }}
                title="Search in PDF (⌘F)"
              >
                <Search size={13} />
              </button>
            )}

            {/* Dim pages (dark reading mode) */}
            <button
              className={clsx(
                "rounded-md p-1.5 transition-colors hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]",
                dimPages && "bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]"
              )}
              onClick={toggleDim}
              title={dimPages ? "Normal page colors" : "Dim pages for dark rooms"}
              aria-pressed={dimPages}
            >
              <Moon size={13} />
            </button>

            <span className="mx-0.5 h-4 w-px bg-[var(--pg-border)]/70" />

            {/* Zoom */}
            <button
              className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              onClick={() => setUserScale(null)}
              title="Fit to width"
            >
              Fit
            </button>
            <button
              className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              onClick={() => {
                const next = Math.max(MIN_SCALE, +(scale - 0.1).toFixed(2));
                setScaleAnchored(next);
                setUserScale(next);
              }}
              title="Zoom out"
            >
              −
            </button>
            <span className="w-10 text-center font-mono tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <button
              className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              onClick={() => {
                const next = Math.min(MAX_SCALE, +(scale + 0.1).toFixed(2));
                setScaleAnchored(next);
                setUserScale(next);
              }}
              title="Zoom in"
            >
              +
            </button>
          </div>
        </div>

        <div
          ref={containerRef}
          className={clsx(
            "relative flex-1 min-h-0 overflow-auto bg-[var(--pg-bg-elevated)]",
            dimPages && "pg-pdf-dim"
          )}
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
                  className={clsx(
                    "pg-pdf-page bg-white",
                    !renderedPages.has(pageNum) && "pg-pdf-page-pending"
                  )}
                  style={{
                    width: info.baseWidth * scale,
                    height: info.baseHeight * scale,
                  }}
                >
                  <canvas data-role="pdf-canvas" />
                  <div data-role="pdf-textlayer" className="pg-pdf-textlayer" />
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
