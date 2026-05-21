"use client";

import { create } from "zustand";

// Per-device page-editor zoom (Notion-style). Lives in localStorage so
// it follows the user across sessions on the same machine but doesn't
// pollute the synced workspace state — zoom is an ergonomic preference,
// not a property of any document.

const STORAGE_KEY = "studygit-page-zoom-v1";

export const PAGE_ZOOM_MIN = 0.7;
export const PAGE_ZOOM_MAX = 1.6;
export const PAGE_ZOOM_STEP = 0.1;
export const PAGE_ZOOM_DEFAULT = 1.0;

// Round to one decimal place so the stored / displayed values are
// always 0.7, 0.8, … 1.6 (no `0.7999999` from float arithmetic).
function clamp(z: number): number {
  if (!Number.isFinite(z)) return PAGE_ZOOM_DEFAULT;
  const bounded = Math.max(PAGE_ZOOM_MIN, Math.min(PAGE_ZOOM_MAX, z));
  return Math.round(bounded * 10) / 10;
}

function load(): number {
  if (typeof window === "undefined") return PAGE_ZOOM_DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return PAGE_ZOOM_DEFAULT;
    return clamp(Number(raw));
  } catch {
    return PAGE_ZOOM_DEFAULT;
  }
}

function save(z: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(z));
  } catch {
    // Quota / private-browsing — silently drop, the in-memory value
    // still applies for the rest of the session.
  }
}

type Store = {
  zoom: number;
  hydrated: boolean;
  hydrate: () => void;
  setZoom: (z: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
};

export const usePageZoom = create<Store>((set, get) => ({
  zoom: PAGE_ZOOM_DEFAULT,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ zoom: load(), hydrated: true });
  },
  setZoom: (z) => {
    const next = clamp(z);
    if (next === get().zoom) return;
    set({ zoom: next });
    save(next);
  },
  zoomIn: () => get().setZoom(get().zoom + PAGE_ZOOM_STEP),
  zoomOut: () => get().setZoom(get().zoom - PAGE_ZOOM_STEP),
  reset: () => get().setZoom(PAGE_ZOOM_DEFAULT),
}));
