"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  FileText,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { usePendingHighlightJump } from "@/lib/hooks/use-pending-highlight-jump";
import type { CanvasNode, PdfNodeData } from "@/lib/types";
import {
  PdfViewer,
  type PdfSelectionEvent,
  type PdfViewerHandle,
} from "@/components/viewers/PdfViewer";
import { NotesSidebar } from "@/components/ui/NotesSidebar";
import { EmptyStateCard } from "@/components/ui/EmptyStateCard";
import { HighlightsListPanel } from "@/components/highlights/HighlightsListPanel";
import { HighlightDetailPanel } from "@/components/highlights/HighlightDetailPanel";

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

  usePendingHighlightJump(nodeId, tryJumpToHighlight);

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
              <EmptyStateCard
                icon={FileText}
                title="No PDF yet"
                hint={
                  pdfUploadError ? (
                    <>
                      Upload a PDF to start reading, highlighting, and
                      annotating.
                      <br />
                      <span className="text-red-400">{pdfUploadError}</span>
                    </>
                  ) : (
                    "Upload a PDF to start reading, highlighting, and annotating."
                  )
                }
                action={{
                  label: pdfReplacing ? "Uploading…" : "Upload PDF",
                  onClick: () => pdfFileInputRef.current?.click(),
                }}
              />
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
        <NotesSidebar
          value={pdfData.notes ?? ""}
          onChange={(html) =>
            updateNodeData(nodeId, { notes: html } as Partial<PdfNodeData>)
          }
          onClose={() => setPdfNotesOpen(false)}
          placeholder="Take notes on this PDF… press /cite to reference a highlight"
          citationContext={{
            sourceNodeId: nodeId,
            workspaceId: node.workspaceId,
          }}
          widthClass="w-[44%] min-w-[340px] max-w-[640px]"
        />
      ) : null}

      {pdfHighlightsOpen ? (
        <aside className="flex w-[340px] shrink-0 flex-col border-l border-[var(--pg-border)] bg-[var(--pg-bg)]">
          {activePdfHighlight ? (
            <HighlightDetailPanel
              highlight={activePdfHighlight}
              locatorLabel={`Source · page ${activePdfHighlight.page}`}
              jumpLabel="Jump to page"
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
            <HighlightsListPanel
              highlights={[...pdfData.highlights]
                .sort(
                  (a, b) => a.page - b.page || a.createdAt - b.createdAt
                )
                .map((h) => ({
                  id: h.id,
                  color: h.color,
                  text: h.text,
                  sortKey: h.page * 1e12 + h.createdAt,
                  locator: `Page ${h.page}`,
                  commentCount: h.comments.length,
                }))}
              emptyHint="Select text in the PDF to create your first highlight."
              headerAction={
                pdfData.src
                  ? {
                      label: "Replace PDF",
                      onClick: () => pdfFileInputRef.current?.click(),
                    }
                  : undefined
              }
              onOpen={(id) => {
                setPdfActiveHighlightId(id);
                pdfViewerRef.current?.jumpToHighlight(id);
              }}
              onDelete={(id) => {
                deletePdfHighlight(nodeId, id);
                if (pdfActiveHighlightId === id) setPdfActiveHighlightId(null);
              }}
            />
          )}
        </aside>
      ) : null}
    </section>
  );
}

