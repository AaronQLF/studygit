// Theme presets. Each preset declares the full palette of `--pg-*` CSS
// variables for light and dark mode; the active set is written as inline
// styles on `<html>` so it overrides the defaults in globals.css.
//
// Layout-y variables (`--pg-radius*`, `--pg-shadow*`) stay constant
// across presets — themes only swap *color*. The aesthetic batch handles
// geometry separately.

export type ThemeId = "paper" | "slate" | "mocha" | "forest" | "ink" | "plum";

export type ThemeMode = "light" | "dark";

export type ColorVarName =
  | "--pg-bg"
  | "--pg-bg-subtle"
  | "--pg-bg-elevated"
  | "--pg-bg-canvas"
  | "--pg-fg"
  | "--pg-fg-soft"
  | "--pg-muted"
  | "--pg-muted-soft"
  | "--pg-border"
  | "--pg-border-strong"
  | "--pg-accent"
  | "--pg-accent-soft"
  | "--pg-marker";

export type ThemePalette = Record<ColorVarName, string>;

export type ThemeDef = {
  id: ThemeId;
  name: string;
  description: string;
  light: ThemePalette;
  dark: ThemePalette;
};

// Helper: build the rgba(...) accent-soft value from a hex string at 10%
// alpha. Used inline below so each preset reads as a single source of
// truth.
function soft(hex: string, alpha = 0.1): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `color-mix(in srgb, ${hex} 10%, transparent)`;
  const h = m[1];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  // Current default — warm cream + oxblood. Matches the academic feel
  // pass.
  paper: {
    id: "paper",
    name: "Paper",
    description: "Warm cream with oxblood accents.",
    light: {
      "--pg-bg": "#fbf8f3",
      "--pg-bg-subtle": "#f5f0e7",
      "--pg-bg-elevated": "#ede5d3",
      "--pg-bg-canvas": "#f3ede0",
      "--pg-fg": "#1c1a17",
      "--pg-fg-soft": "#423d36",
      "--pg-muted": "#8b8275",
      "--pg-muted-soft": "#c9bfa9",
      "--pg-border": "#d8cdb4",
      "--pg-border-strong": "#b9a988",
      "--pg-accent": "#8a2a17",
      "--pg-accent-soft": soft("#8a2a17"),
      "--pg-marker": "#ffe98a",
    },
    dark: {
      "--pg-bg": "#1a1715",
      "--pg-bg-subtle": "#211d19",
      "--pg-bg-elevated": "#2a241f",
      "--pg-bg-canvas": "#181411",
      "--pg-fg": "#ede4d3",
      "--pg-fg-soft": "#d4c8b2",
      "--pg-muted": "#a9997f",
      "--pg-muted-soft": "#5f5343",
      "--pg-border": "#463a2e",
      "--pg-border-strong": "#5c4d3d",
      "--pg-accent": "#c44a2b",
      "--pg-accent-soft": soft("#c44a2b", 0.2),
      "--pg-marker": "#8a6a2f",
    },
  },

  // Cool, analytical. Neutral grey paper, steel-blue accent. Reads like
  // a working draft on lined notepad.
  slate: {
    id: "slate",
    name: "Slate",
    description: "Cool greys with steel-blue accents.",
    light: {
      "--pg-bg": "#f6f7f9",
      "--pg-bg-subtle": "#eceef2",
      "--pg-bg-elevated": "#e1e4ea",
      "--pg-bg-canvas": "#eef1f5",
      "--pg-fg": "#15181d",
      "--pg-fg-soft": "#39414e",
      "--pg-muted": "#6b7280",
      "--pg-muted-soft": "#c1c6cf",
      "--pg-border": "#d2d6dd",
      "--pg-border-strong": "#a8aeba",
      "--pg-accent": "#1f4e79",
      "--pg-accent-soft": soft("#1f4e79"),
      "--pg-marker": "#bee2ff",
    },
    dark: {
      "--pg-bg": "#14171c",
      "--pg-bg-subtle": "#1a1e24",
      "--pg-bg-elevated": "#222730",
      "--pg-bg-canvas": "#10131a",
      "--pg-fg": "#e3e7ee",
      "--pg-fg-soft": "#c0c7d3",
      "--pg-muted": "#8b94a3",
      "--pg-muted-soft": "#4a525f",
      "--pg-border": "#2d333d",
      "--pg-border-strong": "#3d4452",
      "--pg-accent": "#5fa1d6",
      "--pg-accent-soft": soft("#5fa1d6", 0.2),
      "--pg-marker": "#345880",
    },
  },

  // Warm brown café palette — old paper, caramel ink.
  mocha: {
    id: "mocha",
    name: "Mocha",
    description: "Coffee-stained paper with caramel ink.",
    light: {
      "--pg-bg": "#f6efe3",
      "--pg-bg-subtle": "#ede4d2",
      "--pg-bg-elevated": "#e0d3b9",
      "--pg-bg-canvas": "#ebe1cd",
      "--pg-fg": "#2b1d12",
      "--pg-fg-soft": "#4e3c2a",
      "--pg-muted": "#8a7560",
      "--pg-muted-soft": "#c6b59a",
      "--pg-border": "#d6c5a8",
      "--pg-border-strong": "#b59d7a",
      "--pg-accent": "#8b4513",
      "--pg-accent-soft": soft("#8b4513"),
      "--pg-marker": "#ffd58a",
    },
    dark: {
      "--pg-bg": "#1d150e",
      "--pg-bg-subtle": "#251c12",
      "--pg-bg-elevated": "#322517",
      "--pg-bg-canvas": "#17110a",
      "--pg-fg": "#efe2cf",
      "--pg-fg-soft": "#d3c2a8",
      "--pg-muted": "#a48d72",
      "--pg-muted-soft": "#5a4733",
      "--pg-border": "#3e2f20",
      "--pg-border-strong": "#54402c",
      "--pg-accent": "#d18b5a",
      "--pg-accent-soft": soft("#d18b5a", 0.2),
      "--pg-marker": "#8a6320",
    },
  },

  // Sage / moss — botanical academic, herbarium-feeling.
  forest: {
    id: "forest",
    name: "Forest",
    description: "Sage paper with moss-green accents.",
    light: {
      "--pg-bg": "#f1f4ea",
      "--pg-bg-subtle": "#e6ebd9",
      "--pg-bg-elevated": "#d8e0c1",
      "--pg-bg-canvas": "#eaefdd",
      "--pg-fg": "#1c2310",
      "--pg-fg-soft": "#3a4524",
      "--pg-muted": "#73815c",
      "--pg-muted-soft": "#bfc8a2",
      "--pg-border": "#cad4ad",
      "--pg-border-strong": "#a8b482",
      "--pg-accent": "#2f5d2a",
      "--pg-accent-soft": soft("#2f5d2a"),
      "--pg-marker": "#e1f0a0",
    },
    dark: {
      "--pg-bg": "#131811",
      "--pg-bg-subtle": "#191f15",
      "--pg-bg-elevated": "#22291c",
      "--pg-bg-canvas": "#0f140d",
      "--pg-fg": "#d4dec3",
      "--pg-fg-soft": "#b6c19f",
      "--pg-muted": "#8a9772",
      "--pg-muted-soft": "#4a533c",
      "--pg-border": "#2c3424",
      "--pg-border-strong": "#3d4831",
      "--pg-accent": "#6f9d65",
      "--pg-accent-soft": soft("#6f9d65", 0.2),
      "--pg-marker": "#445d27",
    },
  },

  // High-contrast monochrome — pure ink on pure paper.
  ink: {
    id: "ink",
    name: "Ink",
    description: "High-contrast monochrome.",
    light: {
      "--pg-bg": "#ffffff",
      "--pg-bg-subtle": "#f3f3f3",
      "--pg-bg-elevated": "#e6e6e6",
      "--pg-bg-canvas": "#fafafa",
      "--pg-fg": "#0a0a0a",
      "--pg-fg-soft": "#2b2b2b",
      "--pg-muted": "#666666",
      "--pg-muted-soft": "#bdbdbd",
      "--pg-border": "#d4d4d4",
      "--pg-border-strong": "#9a9a9a",
      "--pg-accent": "#0a0a0a",
      "--pg-accent-soft": soft("#0a0a0a", 0.08),
      "--pg-marker": "#fff175",
    },
    dark: {
      "--pg-bg": "#0a0a0a",
      "--pg-bg-subtle": "#141414",
      "--pg-bg-elevated": "#1f1f1f",
      "--pg-bg-canvas": "#050505",
      "--pg-fg": "#f5f5f5",
      "--pg-fg-soft": "#cfcfcf",
      "--pg-muted": "#8c8c8c",
      "--pg-muted-soft": "#3a3a3a",
      "--pg-border": "#262626",
      "--pg-border-strong": "#3f3f3f",
      "--pg-accent": "#f5f5f5",
      "--pg-accent-soft": soft("#f5f5f5", 0.16),
      "--pg-marker": "#5a5024",
    },
  },

  // Moody deep purple over warm paper.
  plum: {
    id: "plum",
    name: "Plum",
    description: "Mauve paper with deep-purple ink.",
    light: {
      "--pg-bg": "#f8f3f6",
      "--pg-bg-subtle": "#efe5ec",
      "--pg-bg-elevated": "#e3d3df",
      "--pg-bg-canvas": "#f2e8ee",
      "--pg-fg": "#1f1422",
      "--pg-fg-soft": "#3f2c44",
      "--pg-muted": "#8a7a8c",
      "--pg-muted-soft": "#c8b5c5",
      "--pg-border": "#d7c5d2",
      "--pg-border-strong": "#b59cb0",
      "--pg-accent": "#5a2a6b",
      "--pg-accent-soft": soft("#5a2a6b"),
      "--pg-marker": "#f0d5ff",
    },
    dark: {
      "--pg-bg": "#161018",
      "--pg-bg-subtle": "#1d161f",
      "--pg-bg-elevated": "#281f2c",
      "--pg-bg-canvas": "#100c12",
      "--pg-fg": "#e6dbeb",
      "--pg-fg-soft": "#c8b8d0",
      "--pg-muted": "#9b899e",
      "--pg-muted-soft": "#54465a",
      "--pg-border": "#322631",
      "--pg-border-strong": "#453349",
      "--pg-accent": "#b07cc4",
      "--pg-accent-soft": soft("#b07cc4", 0.2),
      "--pg-marker": "#5a3e6a",
    },
  },
};

export const THEME_ORDER: ThemeId[] = [
  "paper",
  "slate",
  "mocha",
  "forest",
  "ink",
  "plum",
];

export const DEFAULT_THEME_ID: ThemeId = "paper";

export const THEME_STORAGE_KEY = "personalgit-theme-preset";
export const ACCENT_STORAGE_KEY = "personalgit-accent-override";

export function isThemeId(value: unknown): value is ThemeId {
  return (
    value === "paper" ||
    value === "slate" ||
    value === "mocha" ||
    value === "forest" ||
    value === "ink" ||
    value === "plum"
  );
}

/**
 * The accent override, when present, replaces just the `--pg-accent` and
 * derives a matching `--pg-accent-soft` via `color-mix`. Keeping the
 * override surface small means the user can re-tint any preset without
 * needing to re-pick a palette.
 */
export function readAccentOverride(): string | null {
  if (typeof document !== "undefined") {
    const fromAttr = document.documentElement.dataset.accentOverride;
    if (fromAttr && /^#[0-9a-f]{6}$/i.test(fromAttr)) return fromAttr;
  }
  if (typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
      if (stored && /^#[0-9a-f]{6}$/i.test(stored)) return stored;
    } catch {}
  }
  return null;
}

export function readThemePresetId(): ThemeId {
  if (typeof document !== "undefined") {
    const fromAttr = document.documentElement.dataset.themePreset;
    if (isThemeId(fromAttr)) return fromAttr;
  }
  if (typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemeId(stored)) return stored;
    } catch {}
  }
  return DEFAULT_THEME_ID;
}

/**
 * The actual palette swap is handled by CSS rules keyed on
 * `[data-theme-preset="…"]` in globals.css — that's the cheapest way to
 * avoid a paint flash on first load (the rules are present in the
 * stylesheet before the JS bundle hydrates). This function only writes
 * the data-attribute the rules respond to, plus the small accent
 * override (which IS applied as inline style because we don't want
 * separate CSS rules per custom color).
 */
export function applyThemePreset(
  id: ThemeId,
  accentOverride: string | null
): void {
  if (typeof document === "undefined") return;
  const safeId = THEMES[id] ? id : DEFAULT_THEME_ID;
  const root = document.documentElement;
  root.dataset.themePreset = safeId;

  // Clear any previously-applied accent inline style so removing the
  // override falls back to the preset's accent (defined in CSS).
  root.style.removeProperty("--pg-accent");
  root.style.removeProperty("--pg-accent-soft");

  if (accentOverride && /^#[0-9a-f]{6}$/i.test(accentOverride)) {
    root.style.setProperty("--pg-accent", accentOverride);
    root.style.setProperty(
      "--pg-accent-soft",
      `color-mix(in srgb, ${accentOverride} 12%, transparent)`
    );
    root.dataset.accentOverride = accentOverride;
  } else {
    delete root.dataset.accentOverride;
  }
}

export function writeThemePreset(id: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {}
}

export function writeAccentOverride(hex: string | null): void {
  try {
    if (hex && /^#[0-9a-f]{6}$/i.test(hex)) {
      localStorage.setItem(ACCENT_STORAGE_KEY, hex);
    } else {
      localStorage.removeItem(ACCENT_STORAGE_KEY);
    }
  } catch {}
}

// Compact event name used by the dialog + ThemeToggle to invalidate
// their local state when the theme changes from elsewhere in the app.
export const THEME_CHANGE_EVENT = "personalgit:themechange";
