"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import {
  BookOpen,
  ExternalLink,
  Globe,
  Link2,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { CanvasNode, LinkNodeData } from "@/lib/types";
import {
  WebArticleViewer,
  type WebSelectionEvent,
  type WebViewerHandle,
} from "@/components/viewers/WebArticleViewer";
import { hostnameOf, normalizeUrl } from "@/lib/url";
import { usePendingHighlightJump } from "@/lib/hooks/use-pending-highlight-jump";
import { NotesSidebar } from "@/components/ui/NotesSidebar";
import { HighlightsListPanel } from "@/components/highlights/HighlightsListPanel";
import { HighlightDetailPanel } from "@/components/highlights/HighlightDetailPanel";
import { LiveSourceView } from "./link/LiveSourceView";
import { ArticleHeader } from "./link/ArticleHeader";
import { EmptyUrlState } from "./link/EmptyUrlState";
import { ExtractErrorState } from "./link/ExtractErrorState";
import { LinkMetaEditor } from "./link/LinkMetaEditor";

type ExtractResponse = {
  finalUrl: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  contentHtml: string;
  fetchedAt: number;
};

export function LinkPanelBody({ node }: { node: CanvasNode }) {
  const data = node.data as LinkNodeData;
  const nodeId = node.id;

  const updateNodeData = useStore((s) => s.updateNodeData);
  const setLinkExtraction = useStore((s) => s.setLinkExtraction);
  const addWebHighlight = useStore((s) => s.addWebHighlight);
  const deleteWebHighlight = useStore((s) => s.deleteWebHighlight);
  const addWebComment = useStore((s) => s.addWebComment);
  const deleteWebComment = useStore((s) => s.deleteWebComment);
  const consumePendingHighlightJump = useStore(
    (s) => s.consumePendingHighlightJump
  );

  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [highlightsOpen, setHighlightsOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  // "reader" = sanitised Readability HTML (the surface where highlighting
  // works), "source" = the live original page rendered in an Electron
  // <webview> (or <iframe> when we're not inside Electron). Defaults to
  // reader because that's where the citable highlights live.
  const [viewMode, setViewMode] = useState<"reader" | "source">("reader");

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const viewerRef = useRef<WebViewerHandle>(null);
  const layoutRef = useRef<HTMLElement>(null);
  const [layoutWidth, setLayoutWidth] = useState(1200);

  useEffect(() => {
    const el = layoutRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setLayoutWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Snapped tiles are often narrow; fixed 340px sidebars were eating the
  // whole panel and leaving almost no room for the article / webview.
  const compactLayout = layoutWidth < 880;

  const highlights = useMemo(
    () => data.highlights ?? [],
    [data.highlights]
  );
  const activeHighlight =
    highlights.find((h) => h.id === activeHighlightId) ?? null;
  const resolvedUrl = normalizeUrl(data.url);
  const articleHostname =
    hostnameOf(data.extractedFinalUrl ?? resolvedUrl) || hostnameOf(data.url);

  // -- extraction --------------------------------------------------------

  const runExtract = useCallback(
    async (overrideUrl?: string) => {
      const target = normalizeUrl(overrideUrl ?? data.url);
      if (!target) {
        setExtractError("Add a URL first.");
        return;
      }
      setExtracting(true);
      setExtractError(null);
      try {
        const res = await fetch("/api/web/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: target }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error || `extract failed (${res.status})`);
        }
        const payload = (await res.json()) as ExtractResponse;
        setLinkExtraction(nodeId, {
          finalUrl: payload.finalUrl,
          title: payload.title,
          byline: payload.byline,
          siteName: payload.siteName,
          excerpt: payload.excerpt,
          contentHtml: payload.contentHtml,
          fetchedAt: payload.fetchedAt,
        });
        // If the link still has the placeholder title "New link", adopt the
        // extracted title so the canvas card reads sensibly.
        if (!data.title || data.title === "New link") {
          updateNodeData(nodeId, {
            title: payload.title || hostnameOf(payload.finalUrl) || data.title,
          } as Partial<LinkNodeData>);
        }
      } catch (err) {
        setExtractError((err as Error).message);
      } finally {
        setExtracting(false);
      }
    },
    [data.url, data.title, nodeId, setLinkExtraction, updateNodeData]
  );

  // Auto-fetch on mount when we have a URL but no snapshot yet. Defer to a
  // microtask so the setState calls inside runExtract don't run synchronously
  // during the effect's render phase.
  useEffect(() => {
    if (!resolvedUrl) return;
    if (data.extractedHtml) return;
    if (extracting) return;
    queueMicrotask(() => runExtract());
    // We only want this to fire when the URL changes or on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedUrl, data.extractedHtml]);

  // -- citation-jump plumbing -------------------------------------------

  const jumpStateRef = useRef({ ready: !!data.extractedHtml, highlights });
  useEffect(() => {
    jumpStateRef.current = {
      ready: !!data.extractedHtml,
      highlights,
    };
  }, [data.extractedHtml, highlights]);

  const tryJumpToHighlight = useCallback(
    (highlightId: string) => {
      const { ready, highlights: current } = jumpStateRef.current;
      const target = current.find((h) => h.id === highlightId);
      if (!target) {
        consumePendingHighlightJump(nodeId);
        return;
      }
      if (!ready) return;
      // Jumping only makes sense against the reader view — that's where
      // the anchor lives. If the user happens to be on the source view
      // (or arrives via a /cite link while in source view), flip back
      // first so the scroll target actually exists in the DOM.
      setViewMode("reader");
      setActiveHighlightId(highlightId);
      setHighlightsOpen(true);
      requestAnimationFrame(() => {
        viewerRef.current?.jumpToHighlight(highlightId);
        consumePendingHighlightJump(nodeId);
      });
    },
    [nodeId, consumePendingHighlightJump]
  );

  usePendingHighlightJump(nodeId, tryJumpToHighlight);

  // -- highlight creation ------------------------------------------------

  const createWebHighlight = (
    selection: WebSelectionEvent,
    color: string
  ) => {
    const id = addWebHighlight(
      nodeId,
      selection.text,
      selection.prefix,
      selection.suffix,
      color
    );
    if (id) {
      setActiveHighlightId(id);
      setHighlightsOpen(true);
    }
  };

  return (
    <section ref={layoutRef} className="relative flex min-h-0 flex-1 overflow-hidden">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-[var(--pg-muted)]">
            <Link2 size={11} className="shrink-0" />
            <span className="truncate">
              {articleHostname || "No URL"}
            </span>
            {data.extractedAt ? (
              <span className="hidden text-[var(--pg-muted-soft)] md:inline">
                · fetched{" "}
                {new Date(data.extractedAt).toLocaleDateString()}
              </span>
            ) : null}
            {resolvedUrl ? (
              <a
                href={resolvedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
                title="Open original in a new tab"
              >
                <ExternalLink size={11} />
                Source
              </a>
            ) : null}
          </div>
          <button
            type="button"
            title="Edit URL / title"
            onClick={() => setEditingMeta((v) => !v)}
            className={clsx(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors",
              editingMeta
                ? "bg-[color-mix(in_srgb,var(--pg-accent)_18%,transparent)] text-[var(--pg-accent)]"
                : "text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            )}
          >
            <Pencil size={11} />
            Edit
          </button>
          <button
            type="button"
            title="Refresh from source"
            disabled={!resolvedUrl || extracting}
            onClick={() => {
              if (
                highlights.length > 0 &&
                !window.confirm(
                  "Refresh from source? Existing highlights may not re-anchor if the article changed."
                )
              ) {
                return;
              }
              runExtract();
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)] disabled:opacity-50"
          >
            <RefreshCw
              size={11}
              className={extracting ? "animate-spin" : undefined}
            />
            {extracting ? "Refreshing…" : "Refresh"}
          </button>
          {resolvedUrl ? (
            <div
              role="tablist"
              aria-label="View mode"
              className="inline-flex h-7 items-center gap-px rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg)] p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "reader"}
                onClick={() => setViewMode("reader")}
                title="Clean reader view (highlight-able)"
                className={clsx(
                  "inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] transition-colors",
                  viewMode === "reader"
                    ? "bg-[var(--pg-bg-elevated)] text-[var(--pg-fg)]"
                    : "text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
                )}
              >
                <BookOpen size={11} />
                Reader
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "source"}
                onClick={() => setViewMode("source")}
                title="Live original page"
                className={clsx(
                  "inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] transition-colors",
                  viewMode === "source"
                    ? "bg-[var(--pg-bg-elevated)] text-[var(--pg-fg)]"
                    : "text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
                )}
              >
                <Globe size={11} />
                Web
              </button>
            </div>
          ) : null}
          <button
            title={notesOpen ? "Hide notes" : "Open notes side-by-side"}
            onClick={() => setNotesOpen((v) => !v)}
            className={clsx(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors",
              notesOpen
                ? "bg-[color-mix(in_srgb,var(--pg-accent)_18%,transparent)] text-[var(--pg-accent)]"
                : "text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            )}
          >
            {notesOpen ? (
              <PanelRightClose size={12} />
            ) : (
              <PanelRightOpen size={12} />
            )}
            Notes
          </button>
          <button
            title={
              highlightsOpen
                ? "Hide highlights panel"
                : "Show highlights panel"
            }
            onClick={() => {
              setHighlightsOpen((v) => {
                const next = !v;
                if (!next) setActiveHighlightId(null);
                return next;
              });
            }}
            className={clsx(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors",
              highlightsOpen
                ? "bg-[color-mix(in_srgb,var(--pg-accent)_18%,transparent)] text-[var(--pg-accent)]"
                : "text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            )}
          >
            {highlightsOpen ? (
              <PanelRightClose size={12} />
            ) : (
              <PanelRightOpen size={12} />
            )}
            Highlights
            {highlights.length ? (
              <span
                className={clsx(
                  "ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px]",
                  highlightsOpen
                    ? "bg-[color-mix(in_srgb,var(--pg-accent)_25%,transparent)] text-[var(--pg-accent)]"
                    : "bg-[var(--pg-bg-elevated)] text-[var(--pg-muted)]"
                )}
              >
                {highlights.length}
              </span>
            ) : null}
          </button>
        </div>

        {editingMeta ? (
          <LinkMetaEditor
            data={data}
            onSave={(patch) => {
              const urlChanged =
                patch.url !== undefined && patch.url !== data.url;
              updateNodeData(nodeId, patch);
              setEditingMeta(false);
              if (urlChanged) {
                // Drop the stale snapshot so the auto-fetch kicks in for the
                // new URL. Highlights from the old article remain attached;
                // the user can clear them or accept that they may orphan.
                updateNodeData(nodeId, {
                  extractedHtml: undefined,
                  extractedTitle: undefined,
                  extractedByline: undefined,
                  extractedSiteName: undefined,
                  extractedExcerpt: undefined,
                  extractedFinalUrl: undefined,
                  extractedAt: undefined,
                } as Partial<LinkNodeData>);
              }
            }}
            onCancel={() => setEditingMeta(false)}
          />
        ) : null}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {!resolvedUrl ? (
            <EmptyUrlState
              onSubmit={(url) => {
                updateNodeData(nodeId, { url } as Partial<LinkNodeData>);
                runExtract(url);
              }}
            />
          ) : viewMode === "source" ? (
            // Source view loads the live page independently of the
            // extraction snapshot — useful for paywalled / interactive
            // sites and for double-checking the reader didn't lose
            // anything. Highlighting is intentionally read-only here:
            // creating highlights stays gated on the reader view since
            // that's where the anchor text lives.
            <LiveSourceView url={resolvedUrl} />
          ) : extracting && !data.extractedHtml ? (
            <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--pg-muted)]">
              Loading reader view…
            </div>
          ) : extractError && !data.extractedHtml ? (
            <ExtractErrorState
              error={extractError}
              url={resolvedUrl}
              onRetry={() => runExtract()}
            />
          ) : data.extractedHtml ? (
            <>
              <ArticleHeader
                title={data.extractedTitle ?? data.title}
                byline={data.extractedByline}
                siteName={data.extractedSiteName}
              />
              <WebArticleViewer
                ref={viewerRef}
                html={data.extractedHtml}
                highlights={highlights}
                activeHighlightId={activeHighlightId}
                onSelectionHighlight={createWebHighlight}
                onHighlightClick={(id) => {
                  setActiveHighlightId(id);
                  setHighlightsOpen(true);
                }}
              />
              {extractError ? (
                <div className="border-t border-[var(--pg-border)] bg-red-500/5 px-4 py-2 text-[12px] text-red-400">
                  {extractError}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {notesOpen ? (
        <NotesSidebar
          value={data.notes ?? ""}
          onChange={(html) =>
            updateNodeData(nodeId, { notes: html } as Partial<LinkNodeData>)
          }
          onClose={() => setNotesOpen(false)}
          placeholder="Take notes on this article… press /cite to reference a highlight"
          citationContext={{
            sourceNodeId: nodeId,
            workspaceId: node.workspaceId,
          }}
          widthClass={
            compactLayout
              ? "absolute inset-y-0 right-0 z-30 w-[min(340px,92%)] shadow-[var(--pg-shadow-lg)]"
              : "w-[min(44%,640px)] min-w-[280px] max-w-[640px]"
          }
        />
      ) : null}

      {highlightsOpen ? (
        <aside
          className={clsx(
            "flex shrink-0 flex-col border-[var(--pg-border)] bg-[var(--pg-bg)]",
            compactLayout
              ? "absolute inset-y-0 right-0 z-40 w-[min(340px,92%)] border-l shadow-[var(--pg-shadow-lg)]"
              : "w-[min(340px,38%)] max-w-[340px] border-l"
          )}
        >
          {activeHighlight ? (
            <HighlightDetailPanel
              highlight={activeHighlight}
              locatorLabel={`From ${articleHostname || "this article"}`}
              jumpLabel="Scroll to"
              onBack={() => setActiveHighlightId(null)}
              onJump={() => {
                setViewMode("reader");
                requestAnimationFrame(() =>
                  viewerRef.current?.jumpToHighlight(activeHighlight.id)
                );
              }}
              onRemove={() => {
                deleteWebHighlight(nodeId, activeHighlight.id);
                setActiveHighlightId(null);
              }}
              commentDraft={commentDraft}
              setCommentDraft={setCommentDraft}
              onAddComment={(text) =>
                addWebComment(nodeId, activeHighlight.id, text)
              }
              onDeleteComment={(commentId) =>
                deleteWebComment(nodeId, activeHighlight.id, commentId)
              }
            />
          ) : (
            <HighlightsListPanel
              highlights={highlights.map((h) => ({
                id: h.id,
                color: h.color,
                text: h.text,
                sortKey: h.createdAt,
                locator: articleHostname || "Article",
                commentCount: h.comments.length,
              }))}
              emptyHint="Select text in the article to create your first highlight."
              onOpen={(id) => {
                setViewMode("reader");
                setActiveHighlightId(id);
                requestAnimationFrame(() =>
                  viewerRef.current?.jumpToHighlight(id)
                );
              }}
              onDelete={(id) => {
                deleteWebHighlight(nodeId, id);
                if (activeHighlightId === id) setActiveHighlightId(null);
              }}
            />
          )}
        </aside>
      ) : null}
    </section>
  );
}

