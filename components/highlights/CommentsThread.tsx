"use client";

// Collapsible thread of comments on a highlight, with a Cmd+Enter
// textarea to add a new one. Lives next to the highlight detail card
// in both the PDF and Link panels — duplicated 1:1 in both before this
// got pulled out.

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import type { Comment } from "@/lib/types";

export type CommentsThreadProps = {
  comments: Comment[];
  draft: string;
  setDraft: (value: string) => void;
  onAdd: (text: string) => void;
  onDelete: (commentId: string) => void;
  /** Title shown next to the count. Defaults to "Notes". */
  title?: string;
  /** Placeholder for the textarea. Defaults to "Add a note… (⌘↵ to save)". */
  placeholder?: string;
};

export function CommentsThread({
  comments,
  draft,
  setDraft,
  onAdd,
  onDelete,
  title = "Notes",
  placeholder = "Add a note… (⌘↵ to save)",
}: CommentsThreadProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-8 border-t border-[var(--pg-border)] pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-[11px] uppercase tracking-wider text-[var(--pg-muted)] hover:text-[var(--pg-fg-soft)]"
      >
        <span className="inline-flex items-center gap-1.5">
          <MessageSquare size={12} />
          {title}
          {comments.length ? (
            <span className="text-[var(--pg-fg-soft)]">
              ({comments.length})
            </span>
          ) : null}
        </span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          {comments.map((comment) => (
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
                  onClick={() => onDelete(comment.id)}
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
            placeholder={placeholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                (event.metaKey || event.ctrlKey) &&
                event.key === "Enter"
              ) {
                event.preventDefault();
                const t = draft.trim();
                if (!t) return;
                onAdd(t);
                setDraft("");
              }
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
