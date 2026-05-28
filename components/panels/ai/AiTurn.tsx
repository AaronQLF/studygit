"use client";

// One turn in the AI conversation thread — either the user's question
// (with optional image attachments and a thin accent rail) or the
// assistant's reply (running spinner / error / rendered HTML body, plus
// a small provenance footer with model + citation counters).
//
// Citation pills inside the assistant body are click-delegated here: we
// don't mount TipTap on the read-side, we just translate the pill click
// into the same store action the editor node view uses.

import clsx from "clsx";
import { Loader2, RefreshCw, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import type { AiProvenance, AiTurn as AiTurnModel } from "@/lib/types";

export type AiTurnProps = {
  turn: AiTurnModel;
  showRetry: boolean;
  /**
   * When true, render a brief selection ring so the user can see which
   * turn was just jumped to from a citation pill click.
   */
  flash: boolean;
  onRetry: () => void;
  onDelete: () => void;
};

export function AiTurn({
  turn,
  showRetry,
  flash,
  onRetry,
  onDelete,
}: AiTurnProps) {
  if (turn.role === "user") {
    // Document-style user turn: a small "You" caption, then any image
    // attachments tiled above the question text, indented with a thin
    // accent rail on the left. Mirrors the Notion quote/callout look —
    // no bubble, no background change.
    const attachments = turn.attachments ?? [];
    return (
      <div
        data-ai-turn-id={turn.id}
        className={clsx(
          "group relative mb-5 pl-3 transition-colors duration-300",
          flash &&
            "rounded-md ring-2 ring-[var(--pg-accent)] ring-offset-2 ring-offset-[var(--pg-bg)]"
        )}
      >
        <span className="absolute inset-y-0.5 left-0 w-[2px] rounded-full bg-[var(--pg-accent)] opacity-60" />
        <div className="mb-0.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-[var(--pg-muted)]">
          <span>You</span>
          {attachments.length > 0 ? (
            <span className="normal-case tracking-normal text-[var(--pg-muted-soft)]">
              · {attachments.length} image
              {attachments.length === 1 ? "" : "s"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto inline-flex h-4 w-4 items-center justify-center rounded text-[var(--pg-muted)] opacity-0 transition-opacity hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)] group-hover:opacity-100"
            title="Delete message"
          >
            <Trash2 size={10} />
          </button>
        </div>
        {attachments.length > 0 ? (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {attachments.map((att, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${turn.id}-att-${i}`}
                src={att.dataUrl}
                alt={att.name ?? "attached image"}
                className="max-h-[220px] max-w-full rounded-md border border-[var(--pg-border)] object-contain"
              />
            ))}
          </div>
        ) : null}
        {turn.text ? (
          <div className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[var(--pg-fg)]">
            {turn.text}
          </div>
        ) : null}
      </div>
    );
  }

  // Assistant turn — also document-style. Small caption with the model
  // name, then prose flowing directly on the panel surface. No card,
  // no shadow, no bubble; the citation pills supply their own visual
  // accent so the prose itself can stay minimal.
  return (
    <div
      data-ai-turn-id={turn.id}
      className={clsx(
        "group mb-6 rounded-md transition-shadow duration-300",
        flash &&
          "ring-2 ring-[var(--pg-accent)] ring-offset-2 ring-offset-[var(--pg-bg)]"
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[10.5px] uppercase tracking-[0.12em] text-[var(--pg-muted)]">
        <Sparkles size={10} />
        <span>AI</span>
        {turn.provenance ? (
          <span className="font-mono text-[10px] normal-case tracking-normal text-[var(--pg-muted)]">
            {turn.provenance.model}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {showRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10.5px] normal-case tracking-normal text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]"
              title="Re-run this answer"
            >
              <RefreshCw size={10} />
              Re-run
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-4 w-4 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]"
            title="Delete reply"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      <AssistantBody turn={turn} />

      {turn.provenance ? (
        <ProvenanceLine provenance={turn.provenance} />
      ) : null}
    </div>
  );
}

function AssistantBody({ turn }: { turn: AiTurnModel }) {
  if (turn.status === "running") {
    return (
      <div className="inline-flex items-center gap-2 text-[13px] text-[var(--pg-muted)]">
        <Loader2 size={12} className="animate-spin" />
        Thinking…
      </div>
    );
  }
  if (turn.status === "error") {
    return (
      <div className="flex items-start gap-2 rounded border-l-2 border-red-500/60 bg-transparent px-3 py-1 text-[12.5px] text-red-600 dark:text-red-400">
        <TriangleAlert size={12} className="mt-0.5 shrink-0" />
        <span className="break-words">
          {turn.error ?? "The model didn't return an answer."}
        </span>
      </div>
    );
  }
  return (
    <div
      className="pg-prose text-[14px] leading-relaxed text-[var(--pg-fg)]"
      onClick={onAssistantClick}
      dangerouslySetInnerHTML={{ __html: turn.text }}
    />
  );
}

// Delegated click handler for any citation pill inside an assistant
// turn. We don't mount TipTap here (~150KB of editor stack would be
// overkill for a read-only surface), so we replicate the pill's click
// behavior with the same store actions the TipTap node view uses.
function onAssistantClick(event: React.MouseEvent<HTMLDivElement>) {
  const target = (event.target as HTMLElement | null)?.closest(
    ".pg-citation"
  ) as HTMLElement | null;
  if (!target) return;
  const nodeId = target.getAttribute("data-node-id");
  if (!nodeId) return;
  event.preventDefault();
  event.stopPropagation();
  const highlightId = target.getAttribute("data-highlight-id");
  if (!highlightId) {
    useStore.getState().openPanel(nodeId);
    return;
  }
  useStore.getState().requestHighlightJump(nodeId, highlightId);
}

function ProvenanceLine({ provenance }: { provenance: AiProvenance }) {
  const total = provenance.usage?.total_tokens;
  return (
    <div className="mt-1.5 pl-1 text-[11px] text-[var(--pg-muted)]">
      {provenance.citationsResolved > 0 ? (
        <span title="Citations the model emitted that resolved to a real source">
          {provenance.citationsResolved} cited
        </span>
      ) : null}
      {provenance.citationsDemoted > 0 ? (
        <span
          className="ml-1 text-amber-600 dark:text-amber-400"
          title="Citations kept but marked as possibly misplaced"
        >
          ({provenance.citationsDemoted} weak)
        </span>
      ) : null}
      {provenance.citationsDropped > 0 ? (
        <span
          className="ml-1"
          title="Phantom or unverified citations dropped before render"
        >
          · {provenance.citationsDropped} dropped
        </span>
      ) : null}
      {total != null ? (
        <span
          className="ml-1"
          title="Approximate tokens reported by the provider"
        >
          · ~{total.toLocaleString()} tok
        </span>
      ) : null}
    </div>
  );
}

export function AiEmptyState() {
  // Intentionally minimal — matches the rest of the app, where empty
  // panels show a one-liner rather than a full-screen splash. Keeps the
  // visual weight balanced with the composer below it.
  return (
    <div className="mx-auto max-w-3xl px-6 pt-3 pb-6">
      <div className="text-[12.5px] leading-relaxed text-[var(--pg-muted)]">
        Attach sources above and ask anything. Every citation will jump
        back to the highlight it came from.
      </div>
    </div>
  );
}
