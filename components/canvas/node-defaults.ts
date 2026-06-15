// Default data shapes + label/icon maps for every NodeKind we render on
// the canvas. Lives next to Canvas.tsx so the add-node code paths, the
// context menu, and the keyboard shortcuts all agree on the same
// starting state and presentation.

import type { ComponentType } from "react";
import {
  FileSearch,
  Image as ImageIcon,
  Layers,
  Link2,
  NotebookPen,
  Shapes,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { NOTE_COLORS, SHAPE_FILLS, SHAPE_STROKES } from "@/lib/defaults";
import type { AnyNodeData, NodeKind } from "@/lib/types";

export const KIND_LABELS: Record<NodeKind, string> = {
  link: "Link",
  image: "Image",
  note: "Note",
  page: "Page",
  blog: "Page",
  pdf: "PDF",
  shape: "Shape",
  ai: "Ask AI",
  flashcards: "Flashcards",
};

export const KIND_ICONS: Record<NodeKind, ComponentType<{ size?: number }>> = {
  link: Link2,
  image: ImageIcon,
  note: StickyNote,
  page: NotebookPen,
  blog: NotebookPen,
  pdf: FileSearch,
  shape: Shapes,
  ai: Sparkles,
  flashcards: Layers,
};

/** Add-from-canvas palette order; excludes legacy `blog` (same UX as `page`). */
export const CONTEXT_MENU_KINDS: NodeKind[] = [
  "link",
  "image",
  "note",
  "page",
  "pdf",
  "shape",
  "ai",
  "flashcards",
];

/**
 * Initial `data` payload for a freshly-added node of the given kind.
 * Centralized so any code path that creates a node (toolbar add, context
 * menu, keyboard shortcut) produces an identically-shaped node.
 */
export function defaultDataFor(kind: NodeKind): AnyNodeData {
  switch (kind) {
    case "link":
      return { kind, url: "", title: "New link", highlights: [] };
    case "image":
      return { kind, url: "" };
    case "note":
      return { kind, text: "", color: NOTE_COLORS[0] };
    case "page":
      return {
        kind,
        // Empty so the "Untitled page" placeholder shows and instant-capture
        // drops the cursor in the body — nothing to select-and-delete first.
        title: "",
        content: "",
      };
    case "blog":
      return {
        kind: "page",
        title: "New page",
        content: "",
      };
    case "pdf":
      return {
        kind,
        title: "New PDF",
        src: "",
        highlights: [],
      };
    case "shape":
      return {
        kind,
        variant: "rounded",
        // Default to a soft amber fill with a matching warm border.
        fill: SHAPE_FILLS[1],
        stroke: SHAPE_STROKES[0],
        label: "",
      };
    case "ai":
      return {
        kind,
        title: "Ask AI",
        sources: [],
        turns: [],
      };
    case "flashcards":
      return {
        kind,
        title: "New deck",
        cards: [],
      };
  }
}
