"use client";

// Dashed-border / soft-card empty state used across panels: empty link
// URL, empty highlights list, missing PDF upload, browser unavailable.
// All of them were doing the same `border-dashed` + icon-in-a-circle +
// title + subtitle + optional CTA dance independently.

import clsx from "clsx";
import type { ReactNode } from "react";

export type EmptyStateCardProps = {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: ReactNode;
  /** Soft secondary line under the title. */
  hint?: ReactNode;
  /** Optional call-to-action — rendered as a primary-styled button. */
  action?: { label: string; onClick: () => void };
  /** Tighten the visual size when shown inside a sidebar instead of full-panel. */
  size?: "default" | "compact";
  className?: string;
};

export function EmptyStateCard({
  icon: Icon,
  title,
  hint,
  action,
  size = "default",
  className,
}: EmptyStateCardProps) {
  const compact = size === "compact";
  return (
    <div
      className={clsx(
        "mx-auto px-4 text-center",
        compact ? "mt-8 max-w-xs" : "mt-10 max-w-md",
        className
      )}
    >
      <div
        className={clsx(
          "mx-auto mb-3 inline-flex items-center justify-center rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] text-[var(--pg-muted)]",
          compact ? "h-9 w-9" : "h-10 w-10"
        )}
      >
        <Icon size={compact ? 14 : 16} />
      </div>
      <p
        className={clsx(
          "text-[var(--pg-fg-soft)] font-medium",
          compact ? "text-[12px]" : "text-[13px]"
        )}
      >
        {title}
      </p>
      {hint ? (
        <p
          className={clsx(
            "mt-1 leading-relaxed text-[var(--pg-muted)]",
            compact ? "text-[11px]" : "text-[12px]"
          )}
        >
          {hint}
        </p>
      ) : null}
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-3 inline-flex items-center rounded-md bg-[var(--pg-accent)] px-2.5 py-1 text-[12px] text-white hover:opacity-90"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
