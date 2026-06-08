"use client";

// Turn renderer for the Study Buddy dock. Same skeleton as the canvas's
// AiTurn (user / assistant captions, citation pill click delegation,
// running/error states), but with an extra step on assistant turns:
// any fenced `pgedit` code blocks the model emitted are pulled out of
// the rendered HTML and rendered as interactive Accept/Reject cards
// below the prose. See lib/buddy-edits.ts for the parsing details.

import { useMemo } from "react";
import clsx from "clsx";
import { Loader2, RefreshCw, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { extractEditSuggestions } from "@/lib/buddy-edits";
import type { AiProvenance, AiTurn as AiTurnModel } from "@/lib/types";
import { EditSuggestionCard } from "./EditSuggestionCard";

export type StudyBuddyTurnProps = {
  turn: AiTurnModel;
  showRetry: boolean;
  onRetry: () => void;
  onDelete: () => void;
};

export function StudyBuddyTurn({
  turn,
  showRetry,
  onRetry,
  onDelete,
}: StudyBuddyTurnProps) {
  if (turn.role === "user") {
    const attachments = turn.attachments ?? [];
    return (
      <div
        data-buddy-turn-id={turn.id}
        className="group relative mb-4 pl-2.5"
      >
        <span className="absolute inset-y-0.5 left-0 w-[2px] rounded-full bg-[var(--pg-accent)] opacity-60" />
        <div className="mb-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--pg-muted)]">
          <span>You</span>
          {attachments.length > 0 ? (
            <span className="normal-case tracking-normal text-[var(--pg-muted-soft)]">
              · {attachments.length} image{attachments.length === 1 ? "" : "s"}
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
                className="max-h-[160px] max-w-full rounded-md border border-[var(--pg-border)] object-contain"
              />
            ))}
          </div>
        ) : null}
        {turn.text ? (
          <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-[var(--pg-fg)]">
            {turn.text}
          </div>
        ) : null}
      </div>
    );
  }

  // Assistant — same caption + body + provenance, plus the pgedit
  // post-processing step that yields zero or more EditSuggestionCards.
  return (
    <div
      data-buddy-turn-id={turn.id}
      className="group mb-5 rounded-md"
    >
      <div className="mb-1 flex items-center gap-1.5 px-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--pg-muted)]">
        <Sparkles size={10} />
        <span>Buddy</span>
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
              className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10px] normal-case tracking-normal text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]"
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

      {turn.provenance ? <ProvenanceLine provenance={turn.provenance} /> : null}
    </div>
  );
}

function AssistantBody({ turn }: { turn: AiTurnModel }) {
  // Pull edit suggestions out of the rendered HTML. Memoized on the
  // turn text so we don't reparse on every store update happening
  // elsewhere in the app — assistant turns only ever transition from
  // empty to a final answer string, so identity-keyed memo here is
  // both correct and sufficient.
  const { cleanHtml, suggestions } = useMemo(
    () => extractEditSuggestions(turn.text || ""),
    [turn.text]
  );

  if (turn.status === "running") {
    return (
      <div className="inline-flex items-center gap-2 text-[12.5px] text-[var(--pg-muted)]">
        <Loader2 size={12} className="animate-spin" />
        Thinking…
      </div>
    );
  }
  if (turn.status === "error") {
    return (
      <div className="flex items-start gap-2 rounded border-l-2 border-red-500/60 bg-transparent px-2 py-1 text-[12px] text-red-600 dark:text-red-400">
        <TriangleAlert size={12} className="mt-0.5 shrink-0" />
        <span className="break-words">
          {turn.error ?? "The model didn't return an answer."}
        </span>
      </div>
    );
  }
  return (
    <>
      {cleanHtml.trim() ? (
        <div
          className="pg-prose text-[13.5px] leading-relaxed text-[var(--pg-fg)]"
          onClick={onAssistantClick}
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
        />
      ) : null}
      {suggestions.length > 0 ? (
        <div className={clsx("mt-2 flex flex-col gap-2", !cleanHtml.trim() && "mt-0")}>
          {suggestions.map((s) => (
            <EditSuggestionCard key={s.id} suggestion={s} />
          ))}
        </div>
      ) : null}
    </>
  );
}

// Same delegated pill click as the canvas AI panel — the dock doesn't
// mount TipTap on read, so we replicate the node-view behavior with
// store actions.
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
    <div className="mt-1 px-0.5 text-[10.5px] text-[var(--pg-muted)]">
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
      {total != null ? (
        <span className="ml-1" title="Approximate tokens reported by the provider">
          · ~{total.toLocaleString()} tok
        </span>
      ) : null}
    </div>
  );
}

export function StudyBuddyEmptyState({ hasCurrent }: { hasCurrent: boolean }) {
  return (
    <div className="px-3 pt-4 pb-6">
      <div className="text-[12px] leading-relaxed text-[var(--pg-muted)]">
        {hasCurrent ? (
          <>
            Ask anything about the page you&apos;re on, or pin extra
            sources to the conversation. The buddy can also propose
            edits — try “tighten the introduction” or “summarize this
            into bullet points.”
          </>
        ) : (
          <>
            Open a page or note to give the Study Buddy something to
            follow along with. You can also pin sources from the
            workspace as additional context.
          </>
        )}
      </div>
    </div>
  );
}
