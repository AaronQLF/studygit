"use client";

// Sticky strip above the AI conversation thread showing every attached
// source chip + an "Add" button. Each chip can be swapped between
// whole/highlight modes (via SourcePicker pinned to the chip's node) or
// removed entirely.
//
// `chipState` decodes the two sentinel excerpts the optimistic
// whole-PDF attach path writes into `AiSourceRef.excerpt` so we can
// show the right state (spinner / error pill) without plumbing a
// separate `status` field through the data model.

import clsx from "clsx";
import {
  FileText,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { EditableTitle } from "@/components/ui/EditableTitle";
import type { AiSourceRef } from "@/lib/types";

export function AiHeader({
  title,
  onTitleChange,
}: {
  title: string;
  onTitleChange: (next: string) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-5 pb-2 shrink-0">
      <EditableTitle
        value={title}
        onChange={onTitleChange}
        placeholder="Untitled conversation"
        className="pg-page-title font-semibold text-[var(--pg-fg)]"
      />
    </div>
  );
}

export type AiSourcesStripProps = {
  sources: AiSourceRef[];
  onRemove: (sid: string) => void;
  onSwap: (sid: string, anchor: HTMLElement) => void;
  onAddClick: () => void;
  addBtnRef: React.RefObject<HTMLButtonElement | null>;
};

export function AiSourcesStrip({
  sources,
  onRemove,
  onSwap,
  onAddClick,
  addBtnRef,
}: AiSourcesStripProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-4 shrink-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.14em] text-[var(--pg-muted)]">
          <Sparkles size={11} />
          Sources
        </span>
        {sources.map((source) => (
          <AiSourceChip
            key={source.sid}
            source={source}
            onRemove={() => onRemove(source.sid)}
            onSwap={(anchor) => onSwap(source.sid, anchor)}
          />
        ))}
        <button
          ref={addBtnRef}
          type="button"
          onClick={onAddClick}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--pg-border)] px-2 py-0.5 text-[11px] text-[var(--pg-muted)] hover:border-[var(--pg-border-strong)] hover:text-[var(--pg-fg)]"
        >
          <Plus size={10} /> Add
        </button>
        {sources.length === 0 ? (
          <span className="text-[11px] text-[var(--pg-muted)]">
            ungrounded without sources
          </span>
        ) : null}
      </div>
    </div>
  );
}

// Sentinel excerpts used by the optimistic whole-PDF attach path. The
// chip reads them to render the right state without us having to plumb
// a separate "status" field through AiSourceRef.
export const EXTRACTING_SENTINEL = "__extracting__";
export const ERROR_SENTINEL_PREFIX = "__error__:";

export function chipState(
  source: AiSourceRef
): "extracting" | "error" | "ready" {
  if (source.excerpt === EXTRACTING_SENTINEL) return "extracting";
  if (source.excerpt.startsWith(ERROR_SENTINEL_PREFIX)) return "error";
  return "ready";
}

function AiSourceChip({
  source,
  onRemove,
  onSwap,
}: {
  source: AiSourceRef;
  onRemove: () => void;
  // Click anywhere on the chip body (not the remove button) opens a
  // popover that lets the user switch this source between whole /
  // highlight modes for the same underlying node.
  onSwap: (anchor: HTMLElement) => void;
}) {
  const Icon =
    source.page != null
      ? FileText
      : source.highlightId == null
        ? Sparkles
        : Link2;
  const state = chipState(source);
  const title =
    state === "ready"
      ? `${source.excerpt}\n\nClick to switch between whole / highlight modes`
      : state === "extracting"
        ? "Extracting PDF text…"
        : source.excerpt.slice(ERROR_SENTINEL_PREFIX.length) ||
          "Failed to extract PDF";

  return (
    <span
      className={clsx(
        "group inline-flex max-w-[240px] items-center gap-1 rounded-full border pl-2 pr-1 py-0 text-[11px]",
        state === "ready"
          ? "border-[var(--pg-border)] text-[var(--pg-fg-soft)]"
          : state === "extracting"
            ? "border-[var(--pg-border)] text-[var(--pg-muted)]"
            : "border-red-500/40 text-red-500"
      )}
      title={title}
    >
      <button
        type="button"
        onClick={(e) => {
          if (state !== "ready") return;
          onSwap(e.currentTarget.parentElement as HTMLElement);
        }}
        disabled={state !== "ready"}
        className={clsx(
          "inline-flex max-w-[200px] items-center gap-1 py-0.5 text-left",
          state === "ready" && "cursor-pointer hover:text-[var(--pg-fg)]"
        )}
      >
        {state === "extracting" ? (
          <Loader2
            size={10}
            className="shrink-0 animate-spin text-[var(--pg-muted)]"
            aria-hidden
          />
        ) : state === "error" ? (
          <TriangleAlert size={10} className="shrink-0" aria-hidden />
        ) : (
          <Icon
            size={10}
            className="shrink-0 text-[var(--pg-muted)]"
            aria-hidden
          />
        )}
        <span className="truncate">{source.label}</span>
        {source.locator && state === "ready" ? (
          <span className="shrink-0 font-mono text-[9.5px] text-[var(--pg-muted)]">
            {source.locator}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] text-[var(--pg-muted)] opacity-0 transition-opacity hover:text-[var(--pg-fg)] group-hover:opacity-100"
        title="Remove source"
      >
        <X size={9} />
      </button>
    </span>
  );
}
