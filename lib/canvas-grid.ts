"use client";

// Canvas grid preferences. These live in localStorage (same pattern as
// the theme presets) and broadcast a custom event when they change so
// the Canvas component can re-render without a page reload.
//
// Why not just a Zustand slice? The grid is a pure presentation
// preference with no document semantics — it doesn't belong in the
// workspace store, and keeping it as a tiny `window`-event-driven
// module mirrors the way themes are already plumbed.

import { useEffect, useState } from "react";

export type GridStyle = "dots" | "lines" | "cross" | "none";
export type GridDensity = "tight" | "normal" | "loose";

export type GridPrefs = {
  style: GridStyle;
  density: GridDensity;
};

export const DEFAULT_GRID: GridPrefs = {
  style: "dots",
  density: "normal",
};

export const GRID_STORAGE_KEY = "studygit-canvas-grid";
export const GRID_CHANGE_EVENT = "studygit:canvas-grid-change";

// Density → React Flow `gap` (pixels at zoom = 1). Numbers picked to
// look balanced against the existing canvas spacing.
export const DENSITY_GAP: Record<GridDensity, number> = {
  tight: 12,
  normal: 18,
  loose: 32,
};

// Per-variant `size` for the React Flow Background pattern. Dots wants a
// small radius; cross needs a longer arm to be visible; lines are
// stroke-width so we keep them hairline.
export const STYLE_SIZE: Record<Exclude<GridStyle, "none">, number> = {
  dots: 0.8,
  lines: 1,
  cross: 4,
};

export const GRID_STYLE_LABELS: Record<GridStyle, string> = {
  dots: "Dots",
  lines: "Lines",
  cross: "Cross",
  none: "None",
};

export const GRID_DENSITY_LABELS: Record<GridDensity, string> = {
  tight: "Tight",
  normal: "Normal",
  loose: "Loose",
};

export function isGridStyle(value: unknown): value is GridStyle {
  return (
    value === "dots" ||
    value === "lines" ||
    value === "cross" ||
    value === "none"
  );
}

export function isGridDensity(value: unknown): value is GridDensity {
  return value === "tight" || value === "normal" || value === "loose";
}

export function readGridPrefs(): GridPrefs {
  if (typeof localStorage === "undefined") return DEFAULT_GRID;
  try {
    const raw = localStorage.getItem(GRID_STORAGE_KEY);
    if (!raw) return DEFAULT_GRID;
    const parsed = JSON.parse(raw) as Partial<GridPrefs>;
    return {
      style: isGridStyle(parsed.style) ? parsed.style : DEFAULT_GRID.style,
      density: isGridDensity(parsed.density)
        ? parsed.density
        : DEFAULT_GRID.density,
    };
  } catch {
    return DEFAULT_GRID;
  }
}

export function writeGridPrefs(prefs: GridPrefs): void {
  try {
    localStorage.setItem(GRID_STORAGE_KEY, JSON.stringify(prefs));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(GRID_CHANGE_EVENT));
    }
  } catch {
    // localStorage might be unavailable (private mode, quota); the
    // preference simply doesn't persist in that case.
  }
}

/**
 * Subscribe to the persisted grid preferences. Returns the current
 * value and re-renders the host component whenever the user changes
 * the grid in the theme dialog (or in another tab, via the native
 * storage event).
 */
export function useGridPrefs(): GridPrefs {
  // useState initializer runs on the client only for "use client"
  // components, so we can safely touch localStorage here without
  // hydration mismatches.
  const [prefs, setPrefs] = useState<GridPrefs>(() =>
    typeof window === "undefined" ? DEFAULT_GRID : readGridPrefs()
  );

  useEffect(() => {
    const onChange = () => setPrefs(readGridPrefs());
    window.addEventListener(GRID_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(GRID_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return prefs;
}
