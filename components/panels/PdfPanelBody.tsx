"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  FileText,
  Highlighter,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  StickyNote,
  Trash2,
  Upload,
} from "lucide-react";
import { HIGHLIGHT_COLORS } from "@/lib/defaults";
import { useStore } from "@/lib/store";
import type { CanvasNode, PdfNodeData } from "@/lib/types";
import {
  PdfViewer,
  type PdfSelectionEvent,
  type PdfViewerHandle,
} from "../PdfViewer";
import { RichTextEditor } from "../RichTextEditor";

type PdfHighlightItem = PdfNodeData["highlights"][number];

export function PdfPanelBody({ node }: { node: CanvasNode }) {
  const pdfData = node.data as PdfNodeData;
  const nodeId = node.id;

  const updateNodeData = useStore((s) => s.updateNodeData);
  const addPdfHighlight = useStore((s) => s.addPdfHighlight);
  const deletePdfHighlight = useStore((s) => s.deletePdfHighlight);
  const addPdfComment = useStore((s) => s.addPdfComment);
  const deletePdfComment = useStore((s) => s.deletePdfComment);
  const consumePendingHighlightJump = useStore(
    (s) => s.consumePendingHighlightJump
  );

  const [pdfActiveHighlightId, setPdfActiveHighlightId] = useState<string | null>(null);
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null);
  const [pdfCommentDraft, setPdfCommentDraft] = useState("");
  const [pdfReplacing, setPdfReplacing] = useState(false);
  const [pdfNotesOpen, setPdfNotesOpen] = useState(false);
  const [pdfHighlightsOpen, setPdfHighlightsOpen] = useState(true);
  // Track which `src` has actually finished loading. Derived state — never
  // need to reset it from an effect when `src` changes (avoids cascading
  // setState in effects).
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const pdfDocReady = !!pdfData.src && loadedSrc === pdfData.src;
  const pdfFileInputRef = useRef<HTMLInputElement>(null);
  const pdfViewerRef = useRef<PdfViewerHandle>(null);

  // Mirror the values that the store-subscription callback below needs to
  // read at fire-time, so it can act on the freshest data without re-binding
  // the subscription on every render.
  const jumpDataRef = useRef({ pdfDocReady, highlights: pdfData.highlights });
  useEffect(() => {
    jumpDataRef.current = {
      pdfDocReady,
      highlights: pdfData.highlights,
    };
  }, [pdfDocReady, pdfData.highlights]);

  const tryJumpToHighlight = useCallback(
    (highlightId: string) => {
      const { pdfDocReady: ready, highlights } = jumpDataRef.current;
      const target = highlights.find((h) => h.id === highlightId);
      if (!target) {
        // Highlight no longer exists — drop the request.
        consumePendingHighlightJump(nodeId);
        return;
      }
      if (!ready) return; // wait for onDocumentLoaded to retry
      setPdfActiveHighlightId(highlightId);
      setPdfHighlightsOpen(true);
      requestAnimationFrame(() => {
        pdfViewerRef.current?.jumpToHighlight(highlightId);
        consumePendingHighlightJump(nodeId);
      });
    },
    [nodeId, consumePendingHighlightJump]
  );

  // React to citation clicks anywhere in the app: either an existing pending
  // jump on mount, or a future change written by requestPdfHighlightJump.
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

  const activePdfHighlight =
    pdfData.highlights.find((h) => h.id === pdfActiveHighlightId) ?? null;

  const uploadPdfFile = async (file: File) => {
    setPdfReplacing(true);
    setPdfUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `upload failed (${res.status})`);
      }
      const json = (await res.json()) as { url: string; name: string };
      updateNodeData(nodeId, {
        src: json.url,
        fileName: json.name,
        title:
          pdfData.title && pdfData.title !== "New PDF"
            ? pdfData.title
            : json.name.replace(/\.pdf$/i, ""),
      } as Partial<PdfNodeData>);
    } catch (err) {
      setPdfUploadError((err as Error).message);
    } finally {
      setPdfReplacing(false);
    }
  };

  const createPdfHighlight = (selection: PdfSelectionEvent, color: string) => {
    const id = addPdfHighlight(
      nodeId,
      selection.page,
      selection.rects,
      selection.text,
      color
    );
    return id;
  };

  return (
    <section className="flex min-h-0 flex-1 overflow-hidden">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center justify-end gap-1 border-b border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2">
          <button
            title={pdfNotesOpen ? "Hide notes" : "Open notes side-by-side"}
            onClick={() => setPdfNotesOpen((v) => !v)}
            className={clsx(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors",
              pdfNotesOpen
                ? "bg-[color-mix(in_srgb,var(--pg-accent)_18%,transparent)] text-[var(--pg-accent)]"
                : "text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            )}
          >
            {pdfNotesOpen ? (
              <PanelRightClose size={12} />
            ) : (
              <PanelRightOpen size={12} />
            )}
            Notes
          </button>
          <button
            title={
              pdfHighlightsOpen ? "Hide highlights panel" : "Show highlights panel"
            }
            onClick={() => {
              setPdfHighlightsOpen((v) => {
                const next = !v;
                if (!next) setPdfActiveHighlightId(null);
                return next;
              });
            }}
            className={clsx(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors",
              pdfHighlightsOpen
                ? "bg-[color-mix(in_srgb,var(--pg-accent)_18%,transparent)] text-[var(--pg-accent)]"
                : "text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            )}
          >
            {pdfHighlightsOpen ? (
              <PanelRightClose size={12} />
            ) : (
              <PanelRightOpen size={12} />
            )}
            Highlights
            {pdfData.highlights.length ? (
              <span
                className={clsx(
                  "ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px]",
                  pdfHighlightsOpen
                    ? "bg-[color-mix(in_srgb,var(--pg-accent)_25%,transparent)] text-[var(--pg-accent)]"
                    : "bg-[var(--pg-bg-elevated)] text-[var(--pg-muted)]"
                )}
              >
                {pdfData.highlights.length}
              </span>
            ) : null}
          </button>
        </div>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {pdfData.src ? (
            <PdfViewer
              ref={pdfViewerRef}
              src={pdfData.src}
              highlights={pdfData.highlights}
              activeHighlightId={pdfActiveHighlightId}
              onSelectionHighlight={(selection, color) => {
                const id = createPdfHighlight(selection, color);
                if (id) {
                  setPdfActiveHighlightId(id);
                  setPdfHighlightsOpen(true);
                }
              }}
              onHighlightClick={(id) => {
                setPdfActiveHighlightId(id);
                setPdfHighlightsOpen(true);
              }}
              onDocumentLoaded={({ pageCount }) => {
                setLoadedSrc(pdfData.src);
                if (pdfData.pageCount !== pageCount) {
                  updateNodeData(nodeId, {
                    pageCount,
                  } as Partial<PdfNodeData>);
                }
                // Late-arriving citation jump: pending was set before the
                // PDF finished loading. Update the ref synchronously so
                // tryJumpToHighlight sees ready=true, then dispatch.
                const pending =
                  useStore.getState().pendingHighlightJumps[nodeId] ?? null;
                if (pending) {
                  jumpDataRef.current = {
                    ...jumpDataRef.current,
                    pdfDocReady: true,
                  };
                  tryJumpToHighlight(pending);
                }
              }}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="max-w-sm rounded-lg border border-dashed border-[var(--pg-border-strong)] bg-[var(--pg-bg-subtle)] p-8 text-center">
                <FileText size={28} className="mx-auto mb-2 text-[var(--pg-muted)]" />
                <div className="mb-1 text-sm font-semibold text-[var(--pg-fg)]">
                  No PDF yet
                </div>
                <div className="mb-4 text-[12px] text-[var(--pg-fg-soft)]">
                  Upload a PDF to start reading, highlighting, and annotating.
                </div>
                <button
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--pg-accent)] px-3 py-1.5 text-[12px] text-white transition-opacity hover:opacity-90"
                  onClick={() => pdfFileInputRef.current?.click()}
                >
                  <Upload size={12} />{" "}
                  {pdfReplacing ? "Uploading…" : "Upload PDF"}
                </button>
                {pdfUploadError ? (
                  <div className="mt-3 text-[11px] text-red-400">
                    {pdfUploadError}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
        <input
          ref={pdfFileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadPdfFile(file);
            event.target.value = "";
          }}
        />
      </div>

      {pdfNotesOpen ? (
        <aside className="flex w-[44%] min-w-[340px] max-w-[640px] shrink-0 flex-col border-l border-[var(--pg-border)] bg-[var(--pg-bg)]">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3">
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--pg-muted)]">
              <StickyNote size={12} />
              Notes
            </div>
            <button
              title="Close notes"
              onClick={() => setPdfNotesOpen(false)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            >
              <PanelRightClose size={12} />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <RichTextEditor
              value={pdfData.notes ?? ""}
              onChange={(html) =>
                updateNodeData(nodeId, {
                  notes: html,
                } as Partial<PdfNodeData>)
              }
              placeholder="Take notes on this PDF… press /cite to reference a highlight"
              citationContext={{
                sourceNodeId: nodeId,
                workspaceId: node.workspaceId,
              }}
            />
          </div>
        </aside>
      ) : null}

      {pdfHighlightsOpen ? (
        <aside className="flex w-[340px] shrink-0 flex-col border-l border-[var(--pg-border)] bg-[var(--pg-bg)]">
          {activePdfHighlight ? (
            <PdfHighlightPanel
              highlight={activePdfHighlight}
              onBack={() => setPdfActiveHighlightId(null)}
              onJump={() =>
                pdfViewerRef.current?.jumpToHighlight(activePdfHighlight.id)
              }
              onRemove={() => {
                deletePdfHighlight(nodeId, activePdfHighlight.id);
                setPdfActiveHighlightId(null);
              }}
              commentDraft={pdfCommentDraft}
              setCommentDraft={setPdfCommentDraft}
              onAddComment={(text) => {
                addPdfComment(nodeId, activePdfHighlight.id, text);
              }}
              onDeleteComment={(commentId) => {
                deletePdfComment(nodeId, activePdfHighlight.id, commentId);
              }}
            />
          ) : (
            <PdfHighlightsList
              highlights={pdfData.highlights}
              onOpen={(id) => {
                setPdfActiveHighlightId(id);
                pdfViewerRef.current?.jumpToHighlight(id);
              }}
              onDelete={(id) => {
                deletePdfHighlight(nodeId, id);
                if (pdfActiveHighlightId === id) setPdfActiveHighlightId(null);
              }}
              onReplace={
                pdfData.src ? () => pdfFileInputRef.current?.click() : undefined
              }
            />
          )}
        </aside>
      ) : null}
    </section>
  );
}

function PdfHighlightPanel({
  highlight,
  onBack,
  onJump,
  onRemove,
  commentDraft,
  setCommentDraft,
  onAddComment,
  onDeleteComment,
}: {
  highlight: PdfHighlightItem;
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
            title="Jump to page in PDF"
          >
            Jump to page
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

      <div
        className="flex-1 min-h-0 overflow-y-auto px-5 pb-6 pt-4"
      >
        <div className="relative mb-5 overflow-hidden rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] pl-3 pr-3 py-2.5">
          <span
            className="absolute inset-y-0 left-0 w-1"
            style={{ backgroundColor: highlight.color }}
            aria-hidden
          />
          <div className="pl-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--pg-muted)]">
              Source · page {highlight.page}
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
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
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

function PdfHighlightsList({
  highlights,
  onOpen,
  onDelete,
  onReplace,
}: {
  highlights: PdfHighlightItem[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onReplace?: () => void;
}) {
  const sorted = highlights
    .slice()
    .sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);

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
        {onReplace ? (
          <button
            type="button"
            onClick={onReplace}
            className="rounded-md px-2 py-1 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          >
            Replace PDF
          </button>
        ) : null}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {sorted.length === 0 ? (
          <div className="mt-8 px-4 text-center">
            <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] text-[var(--pg-muted)]">
              <Highlighter size={16} />
            </div>
            <p className="text-[13px] text-[var(--pg-fg-soft)]">No highlights yet</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--pg-muted)]">
              Select text in the PDF to create your first highlight.
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
                    <span>Page {highlight.page}</span>
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
