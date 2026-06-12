// Quick-start canvas templates. Each template is a pure description — a
// set of nodes with positions relative to a drop origin, plus edges by
// node index — applied through the store's addNode/addEdge so persistence,
// undo, and the canvas sync all behave exactly as for hand-placed nodes.
//
// Templates exist to defeat the blank-canvas freeze: a new workspace is
// the single most common place a learning tool loses someone. They seed a
// real, connected starting point a student can edit rather than an
// intimidating void.

import type { AnyNodeData, NoteNodeData } from "./types";
import { NOTE_COLORS, SHAPE_FILLS, SHAPE_STROKES } from "./defaults";

export type TemplateNode = {
  data: AnyNodeData;
  // Position relative to the drop origin (canvas coords).
  dx: number;
  dy: number;
};

export type TemplateDef = {
  id: string;
  name: string;
  description: string;
  // Lucide icon name resolved by the empty-state component.
  icon: "notebook" | "layers" | "folder" | "sparkles";
  nodes: TemplateNode[];
  // Edges as [sourceIndex, targetIndex] into `nodes`.
  edges: Array<[number, number]>;
};

function note(text: string, color: string): NoteNodeData {
  return { kind: "note", text, color };
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: "lecture",
    name: "Lecture notes",
    description: "A notes page wired to a flashcard deck, plus a key-terms note.",
    icon: "notebook",
    nodes: [
      {
        data: {
          kind: "page",
          title: "Lecture notes",
          content:
            "<h1>Lecture notes</h1><p>Date · Course · Topic</p>" +
            "<h2>Key ideas</h2><ul><li><p></p></li></ul>" +
            "<h2>Questions to revisit</h2><ul><li><p></p></li></ul>",
        },
        dx: 0,
        dy: 0,
      },
      {
        data: { kind: "flashcards", title: "Lecture review", cards: [] },
        dx: 540,
        dy: 0,
      },
      {
        data: note("Key terms\n\n• \n• ", NOTE_COLORS[2] ?? NOTE_COLORS[0]),
        dx: 540,
        dy: 260,
      },
    ],
    edges: [[0, 1]],
  },
  {
    id: "reading",
    name: "Reading & flashcards",
    description: "A summary page, a deck for retention, and an AI tutor — all connected.",
    icon: "layers",
    nodes: [
      {
        data: {
          kind: "page",
          title: "Reading summary",
          content:
            "<h1>Reading summary</h1><p>Source · Author</p>" +
            "<h2>Main argument</h2><p></p>" +
            "<h2>Evidence</h2><ul><li><p></p></li></ul>" +
            "<h2>My takeaways</h2><p></p>",
        },
        dx: 0,
        dy: 0,
      },
      {
        data: { kind: "flashcards", title: "Reading cards", cards: [] },
        dx: 540,
        dy: -40,
      },
      {
        data: { kind: "ai", title: "Ask about this reading", sources: [], turns: [] },
        dx: 540,
        dy: 240,
      },
    ],
    edges: [
      [0, 1],
      [0, 2],
    ],
  },
  {
    id: "project",
    name: "Project workspace",
    description: "An outline page and idea notes grouped inside a labeled frame.",
    icon: "folder",
    nodes: [
      {
        data: {
          kind: "shape",
          variant: "rounded",
          fill: SHAPE_FILLS[0] ?? "transparent",
          stroke: SHAPE_STROKES[0],
          label: "Project",
          labelPosition: "top",
        },
        dx: -40,
        dy: -60,
      },
      {
        data: {
          kind: "page",
          title: "Outline",
          content:
            "<h1>Outline</h1><ol><li><p>Introduction</p></li>" +
            "<li><p>Background</p></li><li><p>Argument</p></li>" +
            "<li><p>Conclusion</p></li></ol>",
        },
        dx: 0,
        dy: 0,
      },
      { data: note("Thesis\n\n", NOTE_COLORS[0]), dx: 500, dy: 0 },
      { data: note("Open questions\n\n", NOTE_COLORS[4] ?? NOTE_COLORS[0]), dx: 500, dy: 220 },
    ],
    edges: [],
  },
];
