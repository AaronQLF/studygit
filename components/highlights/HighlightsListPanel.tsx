"use client";

// Generic sidebar list of highlights. Previously three near-identical
// implementations: PdfHighlightsList (PDF panel), WebHighlightsList
// (Link panel), and HighlightSidebar's list (BrowserWindow). Same shape:
// list of cards with a colored rail, locator chip, comment count, and a
// hover-revealed delete button.

import { Highlighter, MessageSquare, Trash2 } from "lucide-react";
import { EmptyStateCard } from "@/components/ui/EmptyStateCard";

export type HighlightListItem = {
  id: string;
  /** Color of the left rail. */
  color: string;
  /** Truncated preview text shown in the card body. */
  text: string;
  /** Stable sort key (createdAt or computed). */
  sortKey: number;
  /** Small uppercase label rendered top-left (e.g. "Page 5", hostname). */
  locator?: string;
  /** Comment count badge — omit or pass 0 to hide. */
  commentCount?: number;
};

export type HighlightsListPanelProps = {
  highlights: HighlightListItem[];
  /**
   * Opens the detail view for a highlight. Omit when the surface is
   * read-only (e.g. the in-app browser's session sidebar) — cards then
   * lose their hover / cursor affordance.
   */
  onOpen?: (id: string) => void;
  onDelete: (id: string) => void;
  /** Header title. Defaults to "Highlights". */
  title?: string;
  /** Override the empty-state subtitle to match the surface (PDF/article/page). */
  emptyHint?: string;
  /** Optional right-aligned header action (e.g. "Replace PDF" or "Clear all"). */
  headerAction?: { label: string; onClick: () => void; title?: string };
  /** Compact 180-char preview by default; raise/lower as needed. */
  previewLength?: number;
  /** Override the card body's truncation class (max lines via line-clamp utility). */
  bodyClampClass?: string;
  /** Optional footer rendered below the scroll area. */
  footer?: React.ReactNode;
};

export function HighlightsListPanel({
  highlights,
  onOpen,
  onDelete,
  title = "Highlights",
  emptyHint = "Select text to create your first highlight.",
  headerAction,
  previewLength = 180,
  bodyClampClass = "line-clamp-3",
  footer,
}: HighlightsListPanelProps) {
  const sorted = [...highlights].sort((a, b) => a.sortKey - b.sortKey);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--pg-border)] px-4">
        <div className="inline-flex items-center gap-2 text-[12px] text-[var(--pg-fg-soft)]">
          <Highlighter size={13} className="text-[var(--pg-muted)]" />
          <span className="font-medium">{title}</span>
          {highlights.length ? (
            <span className="text-[var(--pg-muted)]">{highlights.length}</span>
          ) : null}
        </div>
        {headerAction ? (
          <button
            type="button"
            onClick={headerAction.onClick}
            title={headerAction.title}
            className="rounded-md px-2 py-1 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          >
            {headerAction.label}
          </button>
        ) : null}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {sorted.length === 0 ? (
          <EmptyStateCard
            icon={Highlighter}
            title="No highlights yet"
            hint={emptyHint}
            size="compact"
          />
        ) : (
          <div className="space-y-1.5">
            {sorted.map((h) => {
              const preview =
                h.text.length > previewLength
                  ? h.text.slice(0, previewLength).trimEnd() + "…"
                  : h.text;
              const clickable = !!onOpen;
              return (
                <div
                  key={h.id}
                  onClick={clickable ? () => onOpen!(h.id) : undefined}
                  className={
                    clickable
                      ? "group relative block w-full cursor-pointer overflow-hidden rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-3 pl-4 text-left transition-colors hover:border-[var(--pg-border-strong)] hover:bg-[var(--pg-bg-elevated)]"
                      : "group relative block w-full overflow-hidden rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-3 pl-4 text-left"
                  }
                >
                  <span
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ backgroundColor: h.color }}
                    aria-hidden
                  />
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--pg-muted)]">
                    <span className="truncate">{h.locator ?? ""}</span>
                    <div className="flex items-center gap-2">
                      {h.commentCount ? (
                        <span className="inline-flex items-center gap-0.5">
                          <MessageSquare size={10} /> {h.commentCount}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(h.id);
                        }}
                        className="inline-flex items-center rounded p-0.5 text-[var(--pg-muted)] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                        title="Remove highlight"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  <p
                    className={`${bodyClampClass} text-[13px] leading-relaxed text-[var(--pg-fg)]`}
                  >
                    {preview}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {footer ?? null}
    </div>
  );
}
