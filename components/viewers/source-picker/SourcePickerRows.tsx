"use client";

// Row + icon renderers for SourcePicker. The icon switches are kept as
// switch-in-JSX (rather than `const Icon = iconFor(kind)`) to satisfy
// React 19's `react-hooks/static-components` lint, which can't prove a
// dynamic component reference is stable.

import clsx from "clsx";
import {
  ChevronRight,
  FileText,
  Link2,
  NotebookPen,
  Sparkles,
  StickyNote,
} from "lucide-react";
import {
  isWholeNodeRow,
  type SourceGroup,
  type SourceGroupKind,
  type SourceRow,
} from "@/lib/source-rows";

export function RowIcon({
  kind,
  size,
  className,
}: {
  kind: SourceRow["kind"];
  size: number;
  className?: string;
}) {
  if (kind === "pdf" || kind === "pdf-whole") {
    return <FileText size={size} className={className} aria-hidden />;
  }
  if (kind === "page") {
    return <NotebookPen size={size} className={className} aria-hidden />;
  }
  if (kind === "note") {
    return <StickyNote size={size} className={className} aria-hidden />;
  }
  if (kind === "ai") {
    return <Sparkles size={size} className={className} aria-hidden />;
  }
  return <Link2 size={size} className={className} aria-hidden />;
}

export function GroupIcon({
  kind,
  size,
  className,
}: {
  kind: SourceGroupKind;
  size: number;
  className?: string;
}) {
  if (kind === "pdf") {
    return <FileText size={size} className={className} aria-hidden />;
  }
  if (kind === "page") {
    return <NotebookPen size={size} className={className} aria-hidden />;
  }
  if (kind === "note") {
    return <StickyNote size={size} className={className} aria-hidden />;
  }
  if (kind === "ai") {
    return <Sparkles size={size} className={className} aria-hidden />;
  }
  return <Link2 size={size} className={className} aria-hidden />;
}

/**
 * Friendly count label for a node-list row, e.g. "3 highlights",
 * "2 replies", "page", "1 highlight + whole".
 */
export function countLabel(group: SourceGroup): string {
  if (group.kind === "ai") {
    return group.count === 1 ? "1 reply" : `${group.count} replies`;
  }
  if (group.kind === "page") return "page";
  if (group.kind === "note") return "note";
  // PDF / link: count whole rows and highlight rows separately so the
  // user can tell at a glance whether they've highlighted anything yet.
  let whole = 0;
  let highlights = 0;
  for (const row of group.rows) {
    if (isWholeNodeRow(row)) whole += 1;
    else highlights += 1;
  }
  const parts: string[] = [];
  if (highlights > 0) {
    parts.push(
      `${highlights} ${highlights === 1 ? "highlight" : "highlights"}`
    );
  }
  if (whole > 0) parts.push("whole");
  return parts.join(" + ") || `${group.count} items`;
}

export function NodeRow({
  group,
  active,
  onHover,
  onPick,
}: {
  group: SourceGroup;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  // For groups that drill in (>1 citation), show a small chevron on
  // the right so the affordance is obvious. Single-citation groups
  // attach directly — no chevron, just the row itself.
  const drillable = group.rows.length > 1;
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onPick}
      className={clsx(
        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left",
        active
          ? "bg-[var(--pg-bg-elevated)]"
          : "hover:bg-[var(--pg-bg-subtle)]"
      )}
    >
      <GroupIcon
        kind={group.kind}
        size={12}
        className="shrink-0 text-[var(--pg-muted)]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-[var(--pg-fg)]">
          {group.title}
        </span>
        <span className="block truncate text-[11px] text-[var(--pg-muted)]">
          {countLabel(group)}
        </span>
      </span>
      {drillable ? (
        <ChevronRight
          size={12}
          className="shrink-0 text-[var(--pg-muted)]"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

export function CitationRow({
  row,
  active,
  onHover,
  onPick,
}: {
  row: SourceRow;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const whole = isWholeNodeRow(row);
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onPick}
      className={clsx(
        "flex w-full items-start gap-2 px-2.5 py-1.5 text-left",
        active
          ? "bg-[var(--pg-bg-elevated)]"
          : "hover:bg-[var(--pg-bg-subtle)]"
      )}
    >
      <span
        className="mt-1 h-3 w-0.5 shrink-0 rounded-full"
        style={{ backgroundColor: row.highlight.color }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.1em] text-[var(--pg-muted)]">
          <RowIcon kind={row.kind} size={10} />
          {whole ? (
            <span className="shrink-0 rounded-[3px] border border-[var(--pg-border)] px-1 py-px font-mono text-[9px] tracking-normal text-[var(--pg-muted)]">
              whole
            </span>
          ) : null}
          <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--pg-muted)]">
            {row.locator}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-[var(--pg-fg-soft)]">
          {row.highlight.text || <em>(no text)</em>}
        </span>
      </span>
    </button>
  );
}
