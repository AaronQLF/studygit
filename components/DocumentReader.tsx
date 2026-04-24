"use client";

import { create } from "zustand";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Highlighter,
  MessageSquare,
  Pencil,
  Trash2,
  X,
  Check,
} from "lucide-react";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import { HIGHLIGHT_COLORS } from "@/lib/defaults";
import type { DocumentNodeData, Highlight } from "@/lib/types";

type ReaderStore = {
  nodeId: string | null;
  open: (nodeId: string) => void;
  close: () => void;
};

export const useDocumentReader = create<ReaderStore>((set) => ({
  nodeId: null,
  open: (nodeId) => set({ nodeId }),
  close: () => set({ nodeId: null }),
}));

type Segment = {
  text: string;
  start: number;
  end: number;
  highlightIds: string[];
  color: string | null;
};

function buildSegments(content: string, highlights: Highlight[]): Segment[] {
  const boundaries = new Set<number>([0, content.length]);
  highlights.forEach((h) => {
    boundaries.add(Math.max(0, Math.min(content.length, h.start)));
    boundaries.add(Math.max(0, Math.min(content.length, h.end)));
  });
  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start === end) continue;
    const overlapping = highlights.filter((h) => h.start <= start && h.end >= end);
    segments.push({
      text: content.slice(start, end),
      start,
      end,
      highlightIds: overlapping.map((h) => h.id),
      color: overlapping.length ? overlapping[overlapping.length - 1].color : null,
    });
  }
  return segments;
}

export function DocumentReader() {
  const nodeId = useDocumentReader((s) => s.nodeId);
  const close = useDocumentReader((s) => s.close);
  const node = useStore((s) =>
    s.nodes.find((n) => n.id === nodeId && n.data.kind === "document")
  );
  const updateNodeData = useStore((s) => s.updateNodeData);
  const addHighlight = useStore((s) => s.addHighlight);
  const deleteHighlight = useStore((s) => s.deleteHighlight);
  const addComment = useStore((s) => s.addComment);
  const deleteComment = useStore((s) => s.deleteComment);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
    rect: { x: number; y: number };
  } | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(
    null
  );
  const [commentDraft, setCommentDraft] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

  const data = node?.data as DocumentNodeData | undefined;

  useEffect(() => {
    if (!nodeId) {
      setEditing(false);
      setSelection(null);
      setActiveHighlightId(null);
    }
  }, [nodeId]);

  useEffect(() => {
    if (!data) return;
    setEditTitle(data.title);
    setEditContent(data.content);
    if (!data.content && !editing) {
      setEditing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const segments = useMemo(() => {
    if (!data) return [];
    return buildSegments(data.content, data.highlights);
  }, [data]);

  const activeHighlight = useMemo(() => {
    if (!data || !activeHighlightId) return null;
    return data.highlights.find((h) => h.id === activeHighlightId) ?? null;
  }, [data, activeHighlightId]);

  if (!nodeId || !node || !data) return null;

  const handleTextSelect = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentRef.current) {
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
    let found = false;
    let n: globalThis.Node | null;
    while ((n = walker.nextNode())) {
      const len = n.nodeValue?.length ?? 0;
      if (!found && n === range.startContainer) {
        start = offset + range.startOffset;
        found = true;
      }
      if (n === range.endContainer) {
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

  const saveEdits = () => {
    updateNodeData(nodeId, {
      title: editTitle,
      content: editContent,
    } as Partial<DocumentNodeData>);
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-5xl h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="uppercase tracking-wide text-[11px] font-semibold text-orange-600 dark:text-orange-400">
              Document
            </span>
            <span>·</span>
            <span>{data.highlights.length} highlights</span>
          </div>
          <div className="flex items-center gap-1">
            {!editing ? (
              <button
                className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                onClick={() => setEditing(true)}
              >
                <Pencil size={14} /> Edit
              </button>
            ) : (
              <>
                <button
                  className="text-sm px-3 py-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  onClick={() => {
                    setEditTitle(data.title);
                    setEditContent(data.content);
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white"
                  onClick={saveEdits}
                >
                  <Check size={14} /> Save
                </button>
              </>
            )}
            <button
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ml-2"
              onClick={close}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6 relative">
            {editing ? (
              <div className="max-w-2xl mx-auto flex flex-col gap-3 h-full">
                <input
                  className="w-full text-2xl font-semibold px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md outline-none focus:border-zinc-400 dark:focus:border-zinc-500 bg-transparent text-zinc-900 dark:text-zinc-100"
                  placeholder="Document title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
                <textarea
                  className="w-full flex-1 text-base leading-relaxed px-3 py-3 border border-zinc-200 dark:border-zinc-700 rounded-md outline-none focus:border-zinc-400 dark:focus:border-zinc-500 resize-none font-serif bg-transparent text-zinc-900 dark:text-zinc-100"
                  placeholder="Paste or write your document content here..."
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                />
              </div>
            ) : (
              <div className="max-w-2xl mx-auto">
                <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6 leading-tight">
                  {data.title || "Untitled document"}
                </h1>
                <div
                  ref={contentRef}
                  className="text-base text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap font-serif"
                  onMouseUp={handleTextSelect}
                >
                  {data.content ? (
                    segments.map((seg, i) => {
                      if (seg.highlightIds.length === 0) {
                        return <span key={i}>{seg.text}</span>;
                      }
                      const hasComments = seg.highlightIds.some((hid) => {
                        const h = data.highlights.find((x) => x.id === hid);
                        return (h?.comments.length ?? 0) > 0;
                      });
                      return (
                        <span
                          key={i}
                          className="cursor-pointer rounded-sm"
                          style={{
                            backgroundColor: seg.color ?? undefined,
                            color: "#18181b",
                            boxShadow:
                              activeHighlightId &&
                              seg.highlightIds.includes(activeHighlightId)
                                ? "0 0 0 2px rgba(250,250,250,0.6)"
                                : undefined,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveHighlightId(
                              seg.highlightIds[seg.highlightIds.length - 1]
                            );
                          }}
                        >
                          {seg.text}
                          {hasComments && (
                            <sup className="text-[10px] text-zinc-600 ml-0.5">
                              <MessageSquare size={9} className="inline" />
                            </sup>
                          )}
                        </span>
                      );
                    })
                  ) : (
                    <span className="italic text-zinc-500 dark:text-zinc-400">
                      No content yet. Click Edit to add content.
                    </span>
                  )}
                </div>
              </div>
            )}

            {selection && !editing && (
              <div
                className="fixed z-50 -translate-x-1/2 -translate-y-full mt-[-8px] bg-zinc-900 dark:bg-zinc-800 text-white rounded-lg shadow-lg px-1.5 py-1 flex items-center gap-1 border border-zinc-700"
                style={{ top: selection.rect.y, left: selection.rect.x }}
              >
                <Highlighter size={12} className="ml-1 opacity-70" />
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c}
                    className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                    onClick={() => {
                      const hid = addHighlight(
                        nodeId,
                        selection.start,
                        selection.end,
                        c
                      );
                      setActiveHighlightId(hid);
                      setSelection(null);
                      window.getSelection()?.removeAllRanges();
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="w-80 shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex flex-col">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              {activeHighlight ? "Comments" : "Highlights"}
            </div>
            {activeHighlight ? (
              <ActiveHighlightPanel
                nodeId={nodeId}
                highlight={activeHighlight}
                documentContent={data.content}
                onClose={() => setActiveHighlightId(null)}
                onDelete={() => {
                  deleteHighlight(nodeId, activeHighlight.id);
                  setActiveHighlightId(null);
                }}
                onAddComment={(text) => {
                  if (!text.trim()) return;
                  addComment(nodeId, activeHighlight.id, text.trim());
                  setCommentDraft("");
                }}
                onDeleteComment={(cid) =>
                  deleteComment(nodeId, activeHighlight.id, cid)
                }
                commentDraft={commentDraft}
                setCommentDraft={setCommentDraft}
              />
            ) : (
              <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2">
                {data.highlights.length === 0 ? (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 px-2 py-3">
                    Select text in the document to highlight it and add
                    comments.
                  </div>
                ) : (
                  data.highlights
                    .slice()
                    .sort((a, b) => a.start - b.start)
                    .map((h) => (
                      <button
                        key={h.id}
                        className="text-left p-2.5 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                        onClick={() => setActiveHighlightId(h.id)}
                      >
                        <div
                          className="text-xs line-clamp-3 rounded-sm px-1"
                          style={{ backgroundColor: h.color, color: "#18181b" }}
                        >
                          {data.content.slice(h.start, h.end)}
                        </div>
                        {h.comments.length > 0 && (
                          <div className="flex items-center gap-1 mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                            <MessageSquare size={10} />
                            {h.comments.length} comment
                            {h.comments.length !== 1 && "s"}
                          </div>
                        )}
                      </button>
                    ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActiveHighlightPanel({
  highlight,
  documentContent,
  onClose,
  onDelete,
  onAddComment,
  onDeleteComment,
  commentDraft,
  setCommentDraft,
}: {
  nodeId: string;
  highlight: Highlight;
  documentContent: string;
  onClose: () => void;
  onDelete: () => void;
  onAddComment: (text: string) => void;
  onDeleteComment: (id: string) => void;
  commentDraft: string;
  setCommentDraft: (v: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <button
          className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          onClick={onClose}
        >
          ← Back
        </button>
        <button
          className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-1"
          onClick={onDelete}
        >
          <Trash2 size={11} /> Remove highlight
        </button>
      </div>
      <div className="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div
          className="text-xs rounded-sm px-1.5 py-0.5 inline"
          style={{ backgroundColor: highlight.color, color: "#18181b" }}
        >
          {documentContent.slice(highlight.start, highlight.end)}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2">
        {highlight.comments.length === 0 ? (
          <div className="text-xs text-zinc-500 dark:text-zinc-400 px-1 py-2">
            No comments yet. Add the first one below.
          </div>
        ) : (
          highlight.comments.map((c) => (
            <div
              key={c.id}
              className="p-2.5 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 group"
            >
              <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                {c.text}
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  {new Date(c.createdAt).toLocaleString()}
                </div>
                <button
                  className="text-[10px] text-zinc-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100"
                  onClick={() => onDeleteComment(c.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-2 bg-white dark:bg-zinc-900">
        <textarea
          className="w-full text-sm px-2 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-md outline-none focus:border-zinc-400 dark:focus:border-zinc-500 resize-none bg-transparent text-zinc-900 dark:text-zinc-100"
          rows={2}
          placeholder="Add a comment..."
          value={commentDraft}
          onChange={(e) => setCommentDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onAddComment(commentDraft);
            }
          }}
        />
        <div className="flex justify-between items-center mt-1">
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
            ⌘+↵ to post
          </span>
          <button
            className={clsx(
              "text-xs px-3 py-1 rounded-md",
              commentDraft.trim()
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
            )}
            disabled={!commentDraft.trim()}
            onClick={() => onAddComment(commentDraft)}
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
