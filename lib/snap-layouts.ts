// Snap layout definitions for floating panels. Modeled on Windows 11 Snap
// Layouts: pick a grid (full, halves, thirds, quadrants) and a slot inside
// it; the panel resizes to fill that fraction of the viewport. Layouts are
// independent — two panels can snap to slots in different layouts at the
// same time.

export type SnapLayoutId =
  | "full"
  | "halves-h"
  | "halves-v"
  | "thirds-h"
  | "quads";

// Each slot is described in normalized [0, 1] viewport coordinates. We
// compute pixel geometry from these + the viewport size in `snapGeom`
// below, so the layouts stay resolution-independent.
export type SnapSlot = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SnapLayout = {
  id: SnapLayoutId;
  label: string;
  // Grid description used by the picker UI to draw a thumbnail.
  cols: number;
  rows: number;
  slots: SnapSlot[];
};

export const SNAP_LAYOUTS: Record<SnapLayoutId, SnapLayout> = {
  full: {
    id: "full",
    label: "Fullscreen",
    cols: 1,
    rows: 1,
    slots: [{ x: 0, y: 0, w: 1, h: 1 }],
  },
  "halves-h": {
    id: "halves-h",
    label: "Halves · left / right",
    cols: 2,
    rows: 1,
    slots: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
  "halves-v": {
    id: "halves-v",
    label: "Halves · top / bottom",
    cols: 1,
    rows: 2,
    slots: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  "thirds-h": {
    id: "thirds-h",
    label: "Thirds · 1×3 columns",
    cols: 3,
    rows: 1,
    slots: [
      { x: 0, y: 0, w: 1 / 3, h: 1 },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 1 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 1 },
    ],
  },
  quads: {
    id: "quads",
    label: "Quadrants · 2×2",
    cols: 2,
    rows: 2,
    slots: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
};

export const SNAP_LAYOUT_ORDER: SnapLayoutId[] = [
  "full",
  "halves-h",
  "halves-v",
  "thirds-h",
  "quads",
];

// Pixels reserved around the viewport edge so snapped panels don't sit
// flush against the screen, and between adjacent panels so they have a
// visible gap (matches the floating-panel aesthetic elsewhere in the app).
export const SNAP_VIEWPORT_MARGIN = 12;
export const SNAP_GAP = 6;

export function snapGeom(
  layout: SnapLayoutId,
  slotIndex: number,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number; width: number; height: number } | null {
  const def = SNAP_LAYOUTS[layout];
  if (!def) return null;
  const slot = def.slots[slotIndex];
  if (!slot) return null;

  const innerW = viewportWidth - 2 * SNAP_VIEWPORT_MARGIN;
  const innerH = viewportHeight - 2 * SNAP_VIEWPORT_MARGIN;
  // For multi-cell layouts, leave a SNAP_GAP between adjacent cells. We
  // approximate by subtracting (cols-1)*GAP from the total width and
  // distributing evenly; the slot's normalized w/h tells us how many cells
  // it spans.
  const cellW = (innerW - (def.cols - 1) * SNAP_GAP) / def.cols;
  const cellH = (innerH - (def.rows - 1) * SNAP_GAP) / def.rows;
  // Convert normalized x to column index, then back into a pixel offset
  // that accounts for the gaps.
  const colIndex = Math.round(slot.x * def.cols);
  const rowIndex = Math.round(slot.y * def.rows);
  const colSpan = Math.max(1, Math.round(slot.w * def.cols));
  const rowSpan = Math.max(1, Math.round(slot.h * def.rows));

  const x = SNAP_VIEWPORT_MARGIN + colIndex * (cellW + SNAP_GAP);
  const y = SNAP_VIEWPORT_MARGIN + rowIndex * (cellH + SNAP_GAP);
  const width = cellW * colSpan + (colSpan - 1) * SNAP_GAP;
  const height = cellH * rowSpan + (rowSpan - 1) * SNAP_GAP;
  return { x, y, width, height };
}
