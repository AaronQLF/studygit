"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  Globe,
  Highlighter,
  Link2,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  RefreshCw,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { CanvasNode, LinkNodeData, WebHighlight } from "@/lib/types";
import {
  WebArticleViewer,
  type WebSelectionEvent,
  type WebViewerHandle,
} from "../WebArticleViewer";
import { RichTextEditor } from "../RichTextEditor";

type ExtractResponse = {
  finalUrl: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  contentHtml: string;
  fetchedAt: number;
};

function normalizeUrl(url: string) {
  const value = url.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

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

  useEffect(() => {
    const initial =
      useStore.getState().pendingHighlightJumps[nodeId] ?? null;
    if (initial) tryJumpToHighlight(initial);

    const unsub = useStore.subscribe((state, prev) => {
      const next = state.pendingHighlightJumps[nodeId] ?? null;
      const before = prev.pendingHighlightJumps[nodeId] ?? null;
      if (!next || next === before) return;
      tryJumpToHighlight(next);
    });
    return unsub;
  }, [nodeId, tryJumpToHighlight]);

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
    <section className="flex min-h-0 flex-1 overflow-hidden">
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
        <aside className="flex w-[44%] min-w-[340px] max-w-[640px] shrink-0 flex-col border-l border-[var(--pg-border)] bg-[var(--pg-bg)]">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3">
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--pg-muted)]">
              <StickyNote size={12} />
              Notes
            </div>
            <button
              title="Close notes"
              onClick={() => setNotesOpen(false)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            >
              <PanelRightClose size={12} />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <RichTextEditor
              value={data.notes ?? ""}
              onChange={(html) =>
                updateNodeData(nodeId, {
                  notes: html,
                } as Partial<LinkNodeData>)
              }
              placeholder="Take notes on this article… press /cite to reference a highlight"
              citationContext={{
                sourceNodeId: nodeId,
                workspaceId: node.workspaceId,
              }}
            />
          </div>
        </aside>
      ) : null}

      {highlightsOpen ? (
        <aside className="flex w-[340px] shrink-0 flex-col border-l border-[var(--pg-border)] bg-[var(--pg-bg)]">
          {activeHighlight ? (
            <WebHighlightDetail
              highlight={activeHighlight}
              hostname={articleHostname}
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
            <WebHighlightsList
              highlights={highlights}
              hostname={articleHostname}
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

// Renders the live original page. Inside Electron we mount a real
// <webview> so cross-origin sites load without X-Frame-Options
// problems; in a regular browser we fall back to a sandboxed iframe
// (which most sites refuse via X-Frame-Options / CSP, hence the
// "Open original" escape hatch overlay).
function LiveSourceView({ url }: { url: string }) {
  // The `studygit` global is set by the Electron preload script (see
  // electron/preload.ts and the BrowserWindow component); its presence
  // is a reliable signal that we're inside the desktop shell.
  const [isElectron, setIsElectron] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Defer the setState a microtask so we don't sync-render twice
    // during the initial mount (matches the pattern used in
    // AppShell.tsx for the same platform-detection check).
    queueMicrotask(() => {
      setIsElectron(
        typeof window !== "undefined" &&
          !!(window as unknown as { studygit?: unknown }).studygit
      );
    });
  }, []);

  // Most cross-origin iframes that get blocked by X-Frame-Options
  // don't fire a useful `onError` — they just stay blank. Surface a
  // soft fallback after a beat so the user isn't staring at a void.
  useEffect(() => {
    if (isElectron) return;
    queueMicrotask(() => setIframeBlocked(false));
    const id = window.setTimeout(() => {
      try {
        const doc = iframeRef.current?.contentDocument;
        if (!doc || doc.body?.childElementCount === 0) {
          setIframeBlocked(true);
        }
      } catch {
        // Cross-origin contentDocument access throws — that's a strong
        // signal the iframe loaded SOMETHING (rather than being blank).
        // Don't show the fallback in that case.
      }
    }, 1800);
    return () => window.clearTimeout(id);
  }, [isElectron, url]);

  if (!url) {
    return (
      <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--pg-muted)]">
        No URL to load
      </div>
    );
  }

  if (isElectron) {
    // The webview shares the persist:browser partition with the main
    // in-app browser so a Substack / NYT login made there carries
    // over to the source view of any saved link.
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement("webview" as any, {
        src: url,
        partition: "persist:browser",
        style: {
          display: "inline-flex",
          width: "100%",
          height: "100%",
          background: "white",
        },
      })
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white">
      <iframe
        ref={iframeRef}
        src={url}
        className="h-full w-full border-0"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        title="Original page"
      />
      {iframeBlocked ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--pg-bg)_85%,transparent)]">
          <div className="pointer-events-auto max-w-sm rounded-lg border border-[var(--pg-border-strong)] bg-[var(--pg-bg-elevated)] p-4 text-center shadow-[var(--pg-shadow)]">
            <Globe size={18} className="mx-auto mb-2 text-[var(--pg-muted)]" />
            <div className="mb-1 text-[13px] font-medium text-[var(--pg-fg)]">
              This site refused to embed
            </div>
            <p className="mb-3 text-[12px] text-[var(--pg-fg-soft)]">
              Many sites send an{" "}
              <code className="rounded bg-[var(--pg-bg-subtle)] px-1">
                X-Frame-Options
              </code>{" "}
              header that blocks iframes. The desktop app loads it natively
              — or open the original in a new tab.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--pg-accent)] px-3 py-1.5 text-[12px] text-white hover:opacity-90"
            >
              <ExternalLink size={11} />
              Open original
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ArticleHeader({
  title,
  byline,
  siteName,
}: {
  title: string | undefined;
  byline: string | null | undefined;
  siteName: string | null | undefined;
}) {
  if (!title && !byline && !siteName) return null;
  return (
    <div className="mx-auto w-full max-w-[720px] px-8 pt-8 pb-2">
      {siteName ? (
        <div className="mb-2 text-[11px] uppercase tracking-wider text-[var(--pg-muted)]">
          {siteName}
        </div>
      ) : null}
      {title ? (
        <h1 className="pg-serif text-[28px] font-medium leading-tight text-[var(--pg-fg)]">
          {title}
        </h1>
      ) : null}
      {byline ? (
        <p className="mt-1.5 text-[13px] text-[var(--pg-fg-soft)]">{byline}</p>
      ) : null}
    </div>
  );
}

function EmptyUrlState({ onSubmit }: { onSubmit: (url: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-dashed border-[var(--pg-border-strong)] bg-[var(--pg-bg-subtle)] p-8 text-center">
        <Link2 size={28} className="mx-auto mb-2 text-[var(--pg-muted)]" />
        <div className="mb-1 text-sm font-semibold text-[var(--pg-fg)]">
          No URL yet
        </div>
        <div className="mb-4 text-[12px] text-[var(--pg-fg-soft)]">
          Paste a link to an article, blog post, or essay to load a clean
          reader view you can highlight and cite.
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const next = value.trim();
            if (next) onSubmit(next);
          }}
          className="flex items-center gap-2"
        >
          <input
            className="flex-1 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] px-2.5 py-1.5 text-[13px] text-[var(--pg-fg)] outline-none focus:border-[var(--pg-accent)]"
            placeholder="https://example.com/article"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-md bg-[var(--pg-accent)] px-3 py-1.5 text-[12px] text-white transition-opacity hover:opacity-90"
          >
            Load
          </button>
        </form>
      </div>
    </div>
  );
}

function ExtractErrorState({
  error,
  url,
  onRetry,
}: {
  error: string;
  url: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-8">
      <div className="max-w-md text-center">
        <div className="mb-1 text-sm font-semibold text-[var(--pg-fg)]">
          Couldn&rsquo;t load the article
        </div>
        <p className="mb-3 text-[12px] text-[var(--pg-fg-soft)]">{error}</p>
        <p className="mb-4 break-all text-[11px] text-[var(--pg-muted)]">{url}</p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--pg-accent)] px-3 py-1.5 text-[12px] text-white hover:opacity-90"
          >
            <RefreshCw size={11} />
            Try again
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pg-border-strong)] px-3 py-1.5 text-[12px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
          >
            <ExternalLink size={11} />
            Open original
          </a>
        </div>
      </div>
    </div>
  );
}

function LinkMetaEditor({
  data,
  onSave,
  onCancel,
}: {
  data: LinkNodeData;
  onSave: (patch: Partial<LinkNodeData>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(data.title ?? "");
  const [url, setUrl] = useState(data.url ?? "");
  return (
    <div className="grid gap-2 border-b border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2 md:grid-cols-[1fr_2fr_auto]">
      <input
        className="rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] px-2 py-1.5 text-[12px] text-[var(--pg-fg)] outline-none focus:border-[var(--pg-accent)]"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title"
      />
      <input
        className="rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] px-2 py-1.5 font-mono text-[12px] text-[var(--pg-fg)] outline-none focus:border-[var(--pg-accent)]"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://…"
      />
      <div className="flex justify-end gap-1">
        <button
          type="button"
          className="rounded-md px-2 py-1 text-[12px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="rounded-md bg-[var(--pg-accent)] px-2.5 py-1 text-[12px] text-white hover:opacity-90"
          onClick={() => onSave({ title, url })}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function WebHighlightsList({
  highlights,
  hostname,
  onOpen,
  onDelete,
}: {
  highlights: WebHighlight[];
  hostname: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const sorted = highlights.slice().sort((a, b) => a.createdAt - b.createdAt);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--pg-border)] px-4">
        <div className="inline-flex items-center gap-2 text-[12px] text-[var(--pg-fg-soft)]">
          <Highlighter size={13} className="text-[var(--pg-muted)]" />
          <span className="font-medium">Highlights</span>
          {highlights.length ? (
            <span className="text-[var(--pg-muted)]">{highlights.length}</span>
          ) : null}
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {sorted.length === 0 ? (
          <div className="mt-8 px-4 text-center">
            <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] text-[var(--pg-muted)]">
              <Highlighter size={16} />
            </div>
            <p className="text-[13px] text-[var(--pg-fg-soft)]">
              No highlights yet
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--pg-muted)]">
              Select text in the article to create your first highlight.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {sorted.map((highlight) => {
              const preview =
                highlight.text.length > 180
                  ? highlight.text.slice(0, 180).trimEnd() + "…"
                  : highlight.text;
              return (
                <div
                  key={highlight.id}
                  onClick={() => onOpen(highlight.id)}
                  className="group relative block w-full cursor-pointer overflow-hidden rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-3 pl-4 text-left transition-colors hover:border-[var(--pg-border-strong)] hover:bg-[var(--pg-bg-elevated)]"
                >
                  <span
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ backgroundColor: highlight.color }}
                    aria-hidden
                  />
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--pg-muted)]">
                    <span className="truncate">{hostname || "Article"}</span>
                    <div className="flex items-center gap-2">
                      {highlight.comments.length ? (
                        <span className="inline-flex items-center gap-0.5">
                          <MessageSquare size={10} />{" "}
                          {highlight.comments.length}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(highlight.id);
                        }}
                        className="inline-flex items-center rounded p-0.5 text-[var(--pg-muted)] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                        title="Remove highlight"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  <p className="line-clamp-3 text-[13px] leading-relaxed text-[var(--pg-fg)]">
                    {preview}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function WebHighlightDetail({
  highlight,
  hostname,
  onBack,
  onJump,
  onRemove,
  commentDraft,
  setCommentDraft,
  onAddComment,
  onDeleteComment,
}: {
  highlight: WebHighlight;
  hostname: string;
  onBack: () => void;
  onJump: () => void;
  onRemove: () => void;
  commentDraft: string;
  setCommentDraft: (value: string) => void;
  onAddComment: (text: string) => void;
  onDeleteComment: (commentId: string) => void;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const excerpt =
    highlight.text.length > 320
      ? highlight.text.slice(0, 320).trimEnd() + "…"
      : highlight.text;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--pg-border)] px-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
        >
          <ArrowLeft size={14} />
          All highlights
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onJump}
            className="rounded-md px-2 py-1 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            title="Scroll to highlight"
          >
            Scroll to
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center rounded-md p-1.5 text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-red-400"
            title="Delete highlight"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6 pt-4">
        <div className="relative mb-5 overflow-hidden rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] pl-3 pr-3 py-2.5">
          <span
            className="absolute inset-y-0 left-0 w-1"
            style={{ backgroundColor: highlight.color }}
            aria-hidden
          />
          <div className="pl-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--pg-muted)]">
              From {hostname || "this article"}
            </div>
            <p className="text-[13px] leading-relaxed text-[var(--pg-fg-soft)]">
              {excerpt}
            </p>
          </div>
        </div>
        <div className="mt-8 border-t border-[var(--pg-border)] pt-3">
          <button
            type="button"
            onClick={() => setCommentsOpen((v) => !v)}
            className="flex w-full items-center justify-between text-[11px] uppercase tracking-wider text-[var(--pg-muted)] hover:text-[var(--pg-fg-soft)]"
          >
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare size={12} />
              Notes
              {highlight.comments.length ? (
                <span className="text-[var(--pg-fg-soft)]">
                  ({highlight.comments.length})
                </span>
              ) : null}
            </span>
            <span>{commentsOpen ? "−" : "+"}</span>
          </button>
          {commentsOpen ? (
            <div className="mt-2 space-y-2">
              {highlight.comments.map((comment) => (
                <div
                  key={comment.id}
                  className="group rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2.5 py-2"
                >
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--pg-fg)]">
                    {comment.text}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--pg-muted)]">
                    <span>
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteComment(comment.id)}
                      className="opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              <textarea
                className="w-full resize-none rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2.5 py-2 text-[13px] text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)] focus:border-[var(--pg-border-strong)]"
                rows={2}
                placeholder="Add a note… (⌘↵ to save)"
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    (event.metaKey || event.ctrlKey) &&
                    event.key === "Enter"
                  ) {
                    event.preventDefault();
                    const t = commentDraft.trim();
                    if (!t) return;
                    onAddComment(t);
                    setCommentDraft("");
                  }
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
