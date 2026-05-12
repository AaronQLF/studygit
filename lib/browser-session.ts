"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";

// Highlight collected during an in-app browser session, before it gets
// committed onto a real link node. Mirrors the shape of WebHighlight
// (text + prefix + suffix anchor) so the conversion at "Save as link"
// time is a 1:1 mapping.
export type BrowserSessionHighlight = {
  id: string;
  text: string;
  prefix: string;
  suffix: string;
  color: string;
  // URL the highlight was captured on. Saved with the highlight so that
  // multi-page sessions (browse around, then save) cite from the right
  // page rather than wherever the user happened to land last.
  url: string;
  pageTitle: string;
  createdAt: number;
};

type BrowserSessionState = {
  open: boolean;
  // Address-bar input — separate from `currentUrl` so typing a new URL
  // doesn't immediately navigate the live page on every keystroke.
  inputUrl: string;
  // Last URL we *committed* to the webview (echoed back from did-navigate
  // so it tracks redirects).
  currentUrl: string;
  pageTitle: string;
  highlights: BrowserSessionHighlight[];
  // Session-scoped notification — set on save/error and cleared on close.
  // Avoids a parallel toast plumbing for this single-feature surface.
  flash: { kind: "success" | "error"; message: string } | null;

  openBrowser: (initialUrl?: string) => void;
  closeBrowser: () => void;
  setInputUrl: (url: string) => void;
  commitNavigation: (url: string, title?: string) => void;
  setPageTitle: (title: string) => void;
  addHighlight: (
    h: Omit<BrowserSessionHighlight, "id" | "createdAt">
  ) => string;
  removeHighlight: (id: string) => void;
  clearHighlights: () => void;
  setFlash: (
    flash: { kind: "success" | "error"; message: string } | null
  ) => void;
  reset: () => void;
};

export const useBrowserSession = create<BrowserSessionState>((set) => ({
  open: false,
  inputUrl: "",
  currentUrl: "",
  pageTitle: "",
  highlights: [],
  flash: null,

  openBrowser: (initialUrl) =>
    set((s) => ({
      open: true,
      inputUrl: initialUrl ?? s.inputUrl,
      currentUrl: initialUrl ?? s.currentUrl,
    })),

  closeBrowser: () => set({ open: false, flash: null }),

  setInputUrl: (url) => set({ inputUrl: url }),

  commitNavigation: (url, title) =>
    set((s) => ({
      currentUrl: url,
      inputUrl: url,
      pageTitle: title ?? s.pageTitle,
    })),

  setPageTitle: (title) => set({ pageTitle: title }),

  addHighlight: (input) => {
    const id = nanoid(8);
    set((s) => ({
      highlights: [
        ...s.highlights,
        { ...input, id, createdAt: Date.now() },
      ],
    }));
    return id;
  },

  removeHighlight: (id) =>
    set((s) => ({
      highlights: s.highlights.filter((h) => h.id !== id),
    })),

  clearHighlights: () => set({ highlights: [] }),

  setFlash: (flash) => set({ flash }),

  reset: () =>
    set({
      open: false,
      inputUrl: "",
      currentUrl: "",
      pageTitle: "",
      highlights: [],
      flash: null,
    }),
}));
