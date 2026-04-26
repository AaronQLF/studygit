"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Highlighter, MessageSquare, Trash2 } from "lucide-react";
import { HIGHLIGHT_COLORS } from "@/lib/defaults";
import { useStore } from "@/lib/store";
import type { CanvasNode, DocumentNodeData, Highlight } from "@/lib/types";

type Segment = {
  text: string;
  start: number;
  end: number;
  highlightIds: string[];
  color: string | null;
};

function buildSegments(content: string, highlights: Highlight[]): Segment[] {
  const boundaries = new Set<number>([0, content.length]);
  for (const highlight of highlights) {
    boundaries.add(Math.max(0, Math.min(content.length, highlight.start)));
    boundaries.add(Math.max(0, Math.min(content.length, highlight.end)));
  }
  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start === end) continue;
    const overlaps = highlights.filter(
      (highlight) => highlight.start <= start && highlight.end >= end
    );
    segments.push({
      text: content.slice(start, end),
      start,
      end,
      highlightIds: overlaps.map((highlight) => highlight.id),
      color: overlaps.length ? overlaps[overlaps.length - 1].color : null,
    });
  }
  return segments;
}

export function DocumentPanelBody({ node }: { node: CanvasNode }) {
  const documentData = node.data as DocumentNodeData;
  const updateNodeData = useStore((s) => s.updateNodeData);
  const addHighlight = useStore((s) => s.addHighlight);
  const deleteHighlight = useStore((s) => s.deleteHighlight);
  const addComment = useStore((s) => s.addComment);
  const deleteComment = useStore((s) => s.deleteComment);

  const [docTitle, setDocTitle] = useState(documentData.title);
  const [docContent, setDocContent] = useState(documentData.content);
  const [docMode, setDocMode] = useState<"write" | "annotate">("write");
  const [docRailCollapsed, setDocRailCollapsed] = useState(false);
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
    rect: { x: number; y: number };
  } | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (docMode !== "write") return;
    const timer = setTimeout(() => {
      updateNodeData(node.id, {
        title: docTitle,
        content: docContent,
      } as Partial<DocumentNodeData>);
    }, 220);
    return () => clearTimeout(timer);
  }, [docContent, docMode, docTitle, node.id, updateNodeData]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;
      if (event.key === "`") {
        event.preventDefault();
        setDocRailCollapsed((v) => !v);
      } else if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        setDocMode("write");
      } else if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        setDocMode("annotate");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sourceDocumentContent = documentData.content;
  const segments = useMemo(
    () => buildSegments(sourceDocumentContent, documentData.highlights),
    [sourceDocumentContent, documentData.highlights]
  );
  const activeHighlight =
    documentData.highlights.find((h) => h.id === activeHighlightId) ?? null;

  const onSelectText = () => {
    if (docMode !== "annotate" || !contentRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!contentRef.current.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }
    let start = 0;
    let end = 0;
    const walker = document.createTreeWalker(
      contentRef.current,
      NodeFilter.SHOW_TEXT
    );
    let offset = 0;
    let hitStart = false;
    let textNode: globalThis.Node | null;
    while ((textNode = walker.nextNode())) {
      const len = textNode.nodeValue?.length ?? 0;
      if (!hitStart && textNode === range.startContainer) {
        start = offset + range.startOffset;
        hitStart = true;
      }
      if (textNode === range.endContainer) {
        end = offset + range.endOffset;
        break;
      }
      offset += len;
    }
    if (start === end) {
      setSelection(null);
      return;
    }
    if (start > end) [start, end] = [end, start];
    const rect = range.getBoundingClientRect();
    setSelection({
      start,
      end,
      rect: { x: rect.left + rect.width / 2, y: rect.top },
    });
  };

  const switchToAnnotate = () => {
    updateNodeData(node.id, {
      title: docTitle,
      content: docContent,
    } as Partial<DocumentNodeData>);
    setDocMode("annotate");
  };

  return (
    <section className="flex-1 flex min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-7 relative">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 flex items-center justify-between">
            <div className="inline-flex rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-0.5">
              <button
                className={clsx(
                  "rounded px-2 py-1 text-[11px] font-mono",
                  docMode === "write"
                    ? "bg-[var(--pg-bg-elevated)] text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-200"
                )}
                onClick={() => setDocMode("write")}
              >
                write
              </button>
              <button
                className={clsx(
                  "rounded px-2 py-1 text-[11px] font-mono",
                  docMode === "annotate"
                    ? "bg-[var(--pg-bg-elevated)] text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-200"
                )}
                onClick={switchToAnnotate}
              >
                annotate
              </button>
            </div>
            {docMode === "annotate" ? (
              <button
                className="text-[11px] font-mono text-zinc-500 hover:text-zinc-200"
                onClick={() => setDocRailCollapsed((prev) => !prev)}
              >
                {docRailCollapsed ? "show comments (`)" : "hide comments (`)"}
              </button>
            ) : null}
          </div>

          {docMode === "write" ? (
            <>
              <input
                className="mb-3 w-full bg-transparent text-3xl font-semibold text-zinc-100 outline-none"
                placeholder="Document title"
                value={docTitle}
                onChange={(event) => setDocTitle(event.target.value)}
              />
              <textarea
                className="w-full min-h-[65vh] resize-y rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-3 text-base text-zinc-200 outline-none font-serif leading-relaxed"
                placeholder="Write like Notion..."
                value={docContent}
                onChange={(event) => setDocContent(event.target.value)}
              />
            </>
          ) : (
            <>
              <h1 className="text-3xl font-semibold text-zinc-100 mb-6 leading-tight">
                {documentData.title || "Untitled document"}
              </h1>
              <div
                ref={contentRef}
                className="text-base text-zinc-200 leading-relaxed whitespace-pre-wrap font-serif"
                onMouseUp={onSelectText}
              >
                {sourceDocumentContent ? (
                  segments.map((segment, idx) => {
                    if (!segment.highlightIds.length) {
                      return <span key={idx}>{segment.text}</span>;
                    }
                    const hasComments = segment.highlightIds.some((id) => {
                      const h = documentData.highlights.find((x) => x.id === id);
                      return (h?.comments.length ?? 0) > 0;
                    });
                    return (
                      <span
                        key={idx}
                        className="cursor-pointer rounded-sm"
                        style={{
                          backgroundColor: segment.color ?? undefined,
                          color: "#18181b",
                          boxShadow:
                            activeHighlightId &&
                            segment.highlightIds.includes(activeHighlightId)
                              ? "0 0 0 2px rgba(250,250,250,0.6)"
                              : undefined,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveHighlightId(
                            segment.highlightIds[segment.highlightIds.length - 1]
                          );
                        }}
                      >
                        {segment.text}
                        {hasComments ? (
                          <sup className="ml-0.5 text-zinc-600">
                            <MessageSquare size={9} className="inline" />
                          </sup>
                        ) : null}
                      </span>
                    );
                  })
                ) : (
                  <span className="italic text-zinc-500">
                    Switch to write mode and add content first.
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {selection && docMode === "annotate" ? (
          <div
            className="fixed z-[120] -translate-x-1/2 -translate-y-full mt-[-8px] bg-zinc-900 border border-zinc-700 rounded-lg px-1.5 py-1 flex items-center gap-1 shadow-lg"
            style={{ top: selection.rect.y, left: selection.rect.x }}
          >
            <Highlighter size={12} className="text-zinc-400 ml-0.5" />
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                className="h-5 w-5 rounded-full border border-white/20"
                style={{ backgroundColor: color }}
                onClick={() => {
                  const id = addHighlight(
                    node.id,
                    selection.start,
                    selection.end,
                    color
                  );
                  setActiveHighlightId(id);
                  setSelection(null);
                  window.getSelection()?.removeAllRanges();
                }}
              />
            ))}
          </div>
        ) : null}
      </div>

      <aside
        className={clsx(
          "shrink-0 border-l border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] transition-all duration-150",
          docMode !== "annotate" || docRailCollapsed
            ? "w-0 overflow-hidden"
            : "w-[320px]"
        )}
      >
        {docMode === "annotate" && !docRailCollapsed ? (
          <div className="h-full flex flex-col">
            <div className="h-10 border-b border-[var(--pg-border)] px-3 flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-500">
                {activeHighlight ? "comments" : "highlights"}
              </span>
              <button
                className="text-[11px] font-mono text-zinc-500 hover:text-zinc-200"
                onClick={() => setDocRailCollapsed(true)}
              >
                `
              </button>
            </div>

            {activeHighlight ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-3 py-2 border-b border-[var(--pg-border)] flex items-center justify-between">
                  <button
                    className="text-[11px] font-mono text-zinc-500 hover:text-zinc-200"
                    onClick={() => setActiveHighlightId(null)}
                  >
                    ← back
                  </button>
                  <button
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-red-400 hover:text-red-300"
                    onClick={() => {
                      deleteHighlight(node.id, activeHighlight.id);
                      setActiveHighlightId(null);
                    }}
                  >
                    <Trash2 size={11} /> remove
                  </button>
                </div>
                <div className="px-3 py-2 border-b border-[var(--pg-border)]">
                  <span
                    className="text-xs rounded-sm px-1 py-0.5"
                    style={{
                      backgroundColor: activeHighlight.color,
                      color: "#18181b",
                    }}
                  >
                    {sourceDocumentContent.slice(
                      activeHighlight.start,
                      activeHighlight.end
                    )}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {activeHighlight.comments.length === 0 ? (
                    <div className="px-1 py-2 text-[11px] text-zinc-500">
                      No comments yet.
                    </div>
                  ) : (
                    activeHighlight.comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-elevated)] p-2"
                      >
                        <p className="text-sm text-zinc-200 whitespace-pre-wrap">
                          {comment.text}
                        </p>
                        <div className="mt-1 flex justify-between text-[10px] font-mono text-zinc-500">
                          <span>
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </span>
                          <button
                            onClick={() =>
                              deleteComment(
                                node.id,
                                activeHighlight.id,
                                comment.id
                              )
                            }
                          >
                            delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-[var(--pg-border)] p-2">
                  <textarea
                    className="w-full rounded-md border border-[var(--pg-border-strong)] bg-transparent px-2 py-1.5 text-sm text-zinc-200 outline-none resize-none"
                    rows={2}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Add comment..."
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault();
                        if (!commentDraft.trim()) return;
                        addComment(
                          node.id,
                          activeHighlight.id,
                          commentDraft.trim()
                        );
                        setCommentDraft("");
                      }
                    }}
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-zinc-500">cmd+↵</span>
                    <button
                      className={clsx(
                        "rounded px-2 py-1 text-[11px] font-mono",
                        commentDraft.trim()
                          ? "border border-[var(--pg-border-strong)] text-zinc-200 hover:bg-zinc-800"
                          : "text-zinc-600"
                      )}
                      disabled={!commentDraft.trim()}
                      onClick={() => {
                        if (!commentDraft.trim()) return;
                        addComment(
                          node.id,
                          activeHighlight.id,
                          commentDraft.trim()
                        );
                        setCommentDraft("");
                      }}
                    >
                      post
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {documentData.highlights.length === 0 ? (
                  <div className="px-2 py-3 text-[11px] text-zinc-500">
                    select text to create a highlight
                  </div>
                ) : (
                  documentData.highlights
                    .slice()
                    .sort((a, b) => a.start - b.start)
                    .map((highlight) => (
                      <button
                        key={highlight.id}
                        className="w-full rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-elevated)] p-2 text-left"
                        onClick={() => setActiveHighlightId(highlight.id)}
                      >
                        <span
                          className="line-clamp-3 text-xs rounded-sm px-1"
                          style={{
                            backgroundColor: highlight.color,
                            color: "#18181b",
                          }}
                        >
                          {sourceDocumentContent.slice(
                            highlight.start,
                            highlight.end
                          )}
                        </span>
                        {highlight.comments.length ? (
                          <div className="mt-1 text-[10px] font-mono text-zinc-500">
                            {highlight.comments.length} comments
                          </div>
                        ) : null}
                      </button>
                    ))
                )}
              </div>
            )}
          </div>
        ) : (
          <div />
        )}
      </aside>
    </section>
  );
}
