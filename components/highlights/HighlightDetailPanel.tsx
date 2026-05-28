"use client";

// Detail card for a single highlight with a back-to-list header, jump
// and delete actions, and a CommentsThread below the excerpt. Used by
// the PDF panel and the Link panel — both were maintaining their own
// near-identical copy.

import { ArrowLeft, Trash2 } from "lucide-react";
import type { Comment } from "@/lib/types";
import { CommentsThread } from "./CommentsThread";

export type HighlightDetailPanelProps = {
  highlight: {
    id: string;
    text: string;
    color: string;
    comments: Comment[];
  };
  /** Small uppercase chip above the excerpt (e.g. "Source · page 5"). */
  locatorLabel: string;
  onBack: () => void;
  onJump: () => void;
  onRemove: () => void;
  /** Tooltip + label for the jump button ("Jump to page", "Scroll to", ...). */
  jumpLabel?: string;
  commentDraft: string;
  setCommentDraft: (value: string) => void;
  onAddComment: (text: string) => void;
  onDeleteComment: (commentId: string) => void;
  /** Cap on the rendered excerpt before ellipsis. */
  excerptLength?: number;
};

export function HighlightDetailPanel({
  highlight,
  locatorLabel,
  onBack,
  onJump,
  onRemove,
  jumpLabel = "Jump to",
  commentDraft,
  setCommentDraft,
  onAddComment,
  onDeleteComment,
  excerptLength = 320,
}: HighlightDetailPanelProps) {
  const excerpt =
    highlight.text.length > excerptLength
      ? highlight.text.slice(0, excerptLength).trimEnd() + "…"
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
            title={jumpLabel}
          >
            {jumpLabel}
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
              {locatorLabel}
            </div>
            <p className="text-[13px] leading-relaxed text-[var(--pg-fg-soft)]">
              {excerpt}
            </p>
          </div>
        </div>

        <CommentsThread
          comments={highlight.comments}
          draft={commentDraft}
          setDraft={setCommentDraft}
          onAdd={onAddComment}
          onDelete={onDeleteComment}
        />
      </div>
    </div>
  );
}
