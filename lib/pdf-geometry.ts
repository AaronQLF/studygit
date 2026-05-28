// Pure geometry helpers used by the PDF viewer to translate a live DOM
// selection into normalized highlight rects, plus a small color utility
// for rendering them with an alpha overlay.

import type { PdfHighlightRect } from "./types";

/**
 * Apply an alpha channel to a `#rgb` / `#rrggbb` color. Non-hex input is
 * returned unchanged so callers can pass through CSS variables / named
 * colors without a special case.
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return color;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Project a live `Range` onto a page element, returning rects normalized
 * to `[0,1]` so they remain stable across zoom changes and re-renders.
 * Adjacent line-fragments on the same baseline are merged so we don't
 * stamp dozens of nearly-touching boxes for a multi-word selection.
 */
export function pageRectsFromSelection(
  pageEl: HTMLElement,
  range: Range
): PdfHighlightRect[] {
  const pageRect = pageEl.getBoundingClientRect();
  if (pageRect.width === 0 || pageRect.height === 0) return [];
  const rects = Array.from(range.getClientRects()).filter(
    (r) => r.width > 1 && r.height > 1
  );
  const normalized: PdfHighlightRect[] = rects.map((r) => ({
    x: (r.left - pageRect.left) / pageRect.width,
    y: (r.top - pageRect.top) / pageRect.height,
    width: r.width / pageRect.width,
    height: r.height / pageRect.height,
  }));
  return mergeAdjacentRects(normalized);
}

/**
 * Merge horizontally-adjacent rects that share a baseline + height. Inputs
 * are expected to be normalized (0..1) — the thresholds are tuned for that
 * scale.
 */
export function mergeAdjacentRects(
  rects: PdfHighlightRect[]
): PdfHighlightRect[] {
  if (rects.length <= 1) return rects;
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: PdfHighlightRect[] = [];
  for (const r of sorted) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      Math.abs(prev.y - r.y) < 0.004 &&
      Math.abs(prev.height - r.height) < 0.004 &&
      r.x <= prev.x + prev.width + 0.01
    ) {
      const right = Math.max(prev.x + prev.width, r.x + r.width);
      prev.x = Math.min(prev.x, r.x);
      prev.width = right - prev.x;
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}
