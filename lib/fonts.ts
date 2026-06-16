// Typeface presets. The picker swaps the reading/heading serif —
// `--font-serif`, which drives `.pg-serif` (page + node titles, study
// card faces, dialog headings) and prose headings. Like theme presets,
// the actual swap is done by CSS rules keyed on `[data-font-preset="…"]`
// in globals.css (zero JS, no paint flash); this module only reads,
// writes, and stamps the data-attribute those rules respond to.
//
// A few options deliberately point `--font-serif` at a sans or monospace
// stack — that's the whole personality change (a "typewriter" or "clean"
// mode), not a bug.

export type FontId =
  | "fraunces"
  | "literata"
  | "newsreader"
  | "lora"
  | "inter"
  | "mono";

export type FontDef = {
  id: FontId;
  name: string;
  description: string;
  // CSS font-family stack. Mirrors the matching `[data-font-preset]`
  // rule in globals.css; also used directly for the preview card so the
  // gallery renders each name in its own face.
  stack: string;
};

export const FONTS: Record<FontId, FontDef> = {
  fraunces: {
    id: "fraunces",
    name: "Fraunces",
    description: "Modern old-style serif. The default.",
    stack: '"Fraunces", "Iowan Old Style", "Times New Roman", serif',
  },
  literata: {
    id: "literata",
    name: "Literata",
    description: "Warm, bookish serif tuned for long reading.",
    stack: '"Literata", Georgia, "Times New Roman", serif',
  },
  newsreader: {
    id: "newsreader",
    name: "Newsreader",
    description: "Editorial serif with crisp contrast.",
    stack: '"Newsreader", "Times New Roman", Georgia, serif',
  },
  lora: {
    id: "lora",
    name: "Lora",
    description: "Contemporary serif with brushed curves.",
    stack: '"Lora", Georgia, "Times New Roman", serif',
  },
  inter: {
    id: "inter",
    name: "Inter",
    description: "Clean humanist sans for titles.",
    stack: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  },
  mono: {
    id: "mono",
    name: "Typewriter",
    description: "Monospace for a plain-draft feel.",
    stack: 'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace',
  },
};

export const FONT_ORDER: FontId[] = [
  "fraunces",
  "literata",
  "newsreader",
  "lora",
  "inter",
  "mono",
];

export const DEFAULT_FONT_ID: FontId = "fraunces";

export const FONT_STORAGE_KEY = "studygit-font-preset";

export function isFontId(value: unknown): value is FontId {
  return (
    value === "fraunces" ||
    value === "literata" ||
    value === "newsreader" ||
    value === "lora" ||
    value === "inter" ||
    value === "mono"
  );
}

export function readFontPresetId(): FontId {
  if (typeof document !== "undefined") {
    const fromAttr = document.documentElement.dataset.fontPreset;
    if (isFontId(fromAttr)) return fromAttr;
  }
  if (typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem(FONT_STORAGE_KEY);
      if (isFontId(stored)) return stored;
    } catch {}
  }
  return DEFAULT_FONT_ID;
}

/**
 * The palette swap is handled by `[data-font-preset="…"]` rules in
 * globals.css; this only writes the data-attribute (matching the theme
 * preset approach so first paint is flash-free via the init script).
 */
export function applyFontPreset(id: FontId): void {
  if (typeof document === "undefined") return;
  const safeId = FONTS[id] ? id : DEFAULT_FONT_ID;
  document.documentElement.dataset.fontPreset = safeId;
}

export function writeFontPreset(id: FontId): void {
  try {
    localStorage.setItem(FONT_STORAGE_KEY, id);
  } catch {}
}

// Reuses the theme change event channel so the toggle/dialog can refresh
// together; the dialog already listens for theme changes.
export const FONT_CHANGE_EVENT = "studygit:fontchange";
