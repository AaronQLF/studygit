"use client";

// Card + SVG preview for one canvas grid style. The SVG is drawn at
// the card's natural size so the strokes/dots match what React Flow
// will paint at zoom = 1 (modulo a slight scale to fit the thumbnail).

import clsx from "clsx";
import { Check, Grid3x3 } from "lucide-react";
import { GRID_STYLE_LABELS, type GridStyle } from "@/lib/canvas-grid";

export function GridStyleCard({
  style,
  active,
  onPick,
}: {
  style: GridStyle;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={clsx(
        "group flex flex-col items-center gap-1.5 rounded-[var(--pg-radius)] border p-2 text-center transition-colors",
        active
          ? "border-[var(--pg-accent)] bg-[var(--pg-accent-soft)]"
          : "border-[var(--pg-border)] bg-[var(--pg-bg)] hover:border-[var(--pg-border-strong)] hover:bg-[var(--pg-bg-elevated)]"
      )}
    >
      <div className="relative h-12 w-full overflow-hidden rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg-canvas)]">
        <GridStylePreview style={style} />
        {active ? (
          <div className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--pg-accent)] text-white">
            <Check size={10} />
          </div>
        ) : null}
      </div>
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--pg-fg)]">
        <Grid3x3 size={10} className="opacity-60" />
        {GRID_STYLE_LABELS[style]}
      </span>
    </button>
  );
}

function GridStylePreview({ style }: { style: GridStyle }) {
  const stroke = "color-mix(in srgb, var(--pg-muted-soft) 70%, transparent)";
  const fill = stroke;
  if (style === "none") {
    return (
      <svg
        viewBox="0 0 60 36"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <line
          x1="6"
          y1="30"
          x2="54"
          y2="6"
          stroke={stroke}
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      </svg>
    );
  }
  if (style === "lines") {
    return (
      <svg
        viewBox="0 0 60 36"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {[10, 22, 34, 46].map((x) => (
          <line
            key={`v${x}`}
            x1={x}
            y1="0"
            x2={x}
            y2="36"
            stroke={stroke}
            strokeWidth="0.6"
          />
        ))}
        {[10, 22].map((y) => (
          <line
            key={`h${y}`}
            x1="0"
            y1={y}
            x2="60"
            y2={y}
            stroke={stroke}
            strokeWidth="0.6"
          />
        ))}
      </svg>
    );
  }
  if (style === "cross") {
    const xs = [10, 22, 34, 46];
    const ys = [10, 22];
    return (
      <svg
        viewBox="0 0 60 36"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {xs.flatMap((x) =>
          ys.map((y) => (
            <g key={`${x}-${y}`} stroke={stroke} strokeWidth="0.8">
              <line x1={x - 2} y1={y} x2={x + 2} y2={y} />
              <line x1={x} y1={y - 2} x2={x} y2={y + 2} />
            </g>
          ))
        )}
      </svg>
    );
  }
  const xs = [8, 18, 28, 38, 48];
  const ys = [8, 18, 28];
  return (
    <svg
      viewBox="0 0 56 36"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      {xs.flatMap((x) =>
        ys.map((y) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill={fill} />
        ))
      )}
    </svg>
  );
}
