export type Workspace = {
  id: string;
  name: string;
  createdAt: number;
};

export type NodeKind =
  | "link"
  | "image"
  | "note"
  | "blog"
  | "pdf"
  | "page"
  | "shape";

export type ShapeVariant = "rectangle" | "rounded" | "ellipse" | "diamond";

export type Comment = {
  id: string;
  text: string;
  createdAt: number;
};

export type AiMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: number;
};

export type PdfHighlightRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfHighlight = {
  id: string;
  page: number;
  rects: PdfHighlightRect[];
  text: string;
  color: string;
  comments: Comment[];
  aiThread: AiMessage[];
  createdAt: number;
};

// Text-anchored highlight for the article reader view. We re-find the anchor
// inside the cached `extractedHtml` snapshot on every render, so the snapshot
// is the source of truth for highlight positioning.
export type WebHighlight = {
  id: string;
  // The highlighted text exactly as it appears in the snapshot, whitespace
  // collapsed to single spaces.
  text: string;
  // Up to ~32 chars of context on each side, used to disambiguate when the
  // same phrase appears multiple times in the article.
  prefix: string;
  suffix: string;
  color: string;
  comments: Comment[];
  aiThread: AiMessage[];
  createdAt: number;
};

export type LinkNodeData = {
  kind: "link";
  url: string;
  title: string;
  description?: string;
  // Legacy iframe-embed toggle. No longer read by the panel/card; kept so
  // older saved nodes deserialize cleanly.
  embed?: boolean;
  // Snapshot of the extracted article. Stable across reopens so highlight
  // anchors don't drift. Populated by /api/web/extract.
  extractedHtml?: string;
  extractedTitle?: string;
  extractedByline?: string;
  extractedSiteName?: string;
  extractedExcerpt?: string;
  extractedAt?: number;
  // URL after redirects, if different from the user-entered url.
  extractedFinalUrl?: string;
  highlights: WebHighlight[];
  // Free-form rich-text notes alongside the article (HTML, edited via the
  // same RichTextEditor as page nodes and PDF notes).
  notes?: string;
};

export type ImageNodeData = {
  kind: "image";
  url: string;
  caption?: string;
};

export type NoteNodeData = {
  kind: "note";
  text: string;
  color: string;
};

export type BlogNodeData = {
  kind: "blog";
  title: string;
  markdown: string;
};

export type PdfNodeData = {
  kind: "pdf";
  title: string;
  src: string;
  fileName?: string;
  pageCount?: number;
  highlights: PdfHighlight[];
  notes?: string;
};

export type PageNodeData = {
  kind: "page";
  title: string;
  content: string;
};

export type ShapeTextSize = "sm" | "md" | "lg" | "xl";

export type ShapeBorderStyle = "solid" | "dashed" | "dotted";

export type ShapeNodeData = {
  kind: "shape";
  variant: ShapeVariant;
  // CSS color string. Use "transparent" for an outline-only frame.
  fill: string;
  stroke: string;
  borderStyle?: ShapeBorderStyle;
  label?: string;
  // Text styling for the label. All optional — sensible defaults applied
  // at render time when undefined.
  textColor?: string;
  textSize?: ShapeTextSize;
  textBold?: boolean;
  textItalic?: boolean;
};

export type AnyNodeData =
  | LinkNodeData
  | ImageNodeData
  | NoteNodeData
  | BlogNodeData
  | PdfNodeData
  | PageNodeData
  | ShapeNodeData;

export type CanvasNode = {
  id: string;
  workspaceId: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: AnyNodeData;
};

export type CanvasEdge = {
  id: string;
  workspaceId: string;
  source: string;
  target: string;
};

// Windows-11-style snap layouts. When set, the panel ignores its x/y/w/h
// (which are kept as the "restore" values) and renders into a slot inside
// the named grid. Two panels can share the same layout to tile beside each
// other; snapping a panel into an already-occupied slot evicts the prior
// occupant back to its restore geometry.
export type PanelSnap = {
  layout:
    | "full"
    | "halves-h"
    | "halves-v"
    | "thirds-h"
    | "quads";
  slot: number;
};

export type FloatingPanel = {
  id: string;
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  maximized?: boolean;
  snap?: PanelSnap;
};

export type AppState = {
  workspaces: Workspace[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedWorkspaceId: string | null;
  version: number;
};
