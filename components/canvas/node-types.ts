// React Flow `nodeTypes` + `edgeTypes` registries. Kept in their own
// file so adding a new node kind doesn't require touching Canvas.tsx.

import { BezierEdge } from "@xyflow/react";
import { AiAnswerNode } from "./nodes/AiAnswerNode";
import { FlashcardsNode } from "./nodes/FlashcardsNode";
import { ImageNode } from "./nodes/ImageNode";
import { LinkNode } from "./nodes/LinkNode";
import { NoteNode } from "./nodes/NoteNode";
import { PageNode } from "./nodes/PageNode";
import { PdfNode } from "./nodes/PdfNode";
import { ShapeNode } from "./nodes/ShapeNode";

export const nodeTypes = {
  link: LinkNode,
  image: ImageNode,
  note: NoteNode,
  page: PageNode,
  // Legacy alias — older saved canvases used `blog` for what's now `page`.
  blog: PageNode,
  pdf: PdfNode,
  shape: ShapeNode,
  ai: AiAnswerNode,
  flashcards: FlashcardsNode,
};

// React Flow's built-in edge types are `default` (bezier-shaped),
// `straight`, `step`, `smoothstep`, `simplebezier`. We use `type: "bezier"`
// in our edge data for readability, so register it explicitly to avoid
// the "Edge type 'bezier' not found" warning + fallback to `default`.
export const edgeTypes = {
  bezier: BezierEdge,
};
