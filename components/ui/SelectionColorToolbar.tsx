"use client";

// Floating highlight-color picker shown above the user's selection in
// the PDF viewer and the in-app browser. Both surfaces were rendering
// their own copy of the same `HIGHLIGHT_COLORS.map(...)` markup before
// this got pulled out.

import clsx from "clsx";
import { Highlighter } from "lucide-react";
import { HIGHLIGHT_COLORS } from "@/lib/defaults";

export type SelectionColorToolbarProps = {
  /** Page-relative top in pixels (positioned absolutely against the surface). */
  top: number;
  /** Page-relative left in pixels. */
  left: number;
  onPickColor: (color: string) => void;
  /**
   * Color of the last-applied highlight, drawn as a thin accent ring on
   * the matching swatch. Used by the in-app browser to telegraph which
   * color the next click will reuse.
   */
  activeColor?: string;
  /** Override the color palette if a surface needs a different set. */
  colors?: ReadonlyArray<string>;
  /** Adds inline-style `position: fixed` instead of the default `absolute`. */
  fixed?: boolean;
  className?: string;
};

export function SelectionColorToolbar({
  top,
  left,
  onPickColor,
  activeColor,
  colors = HIGHLIGHT_COLORS,
  fixed,
  className,
}: SelectionColorToolbarProps) {
  return (
    <div
      className={clsx(
        "pointer-events-auto z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-[var(--pg-border-strong)] bg-[var(--pg-bg-elevated)] px-1.5 py-1 shadow-[var(--pg-shadow)]",
        fixed ? "fixed" : "absolute",
        className
      )}
      style={{ top, left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="flex items-center gap-1">
        <Highlighter size={12} className="ml-1 text-[var(--pg-muted)]" />
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            className={clsx(
              "h-5 w-5 rounded-full border border-white/20 transition-transform hover:scale-110",
              activeColor === color && "ring-1 ring-[var(--pg-accent)]"
            )}
            style={{ backgroundColor: color }}
            onClick={() => onPickColor(color)}
            aria-label={`Highlight ${color}`}
          />
        ))}
      </div>
    </div>
  );
}
