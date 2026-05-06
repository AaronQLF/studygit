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

export type LinkNodeData = {
  kind: "link";
  url: string;
  title: string;
  description?: string;
  embed?: boolean;
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

export type FloatingPanel = {
  id: string;
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  maximized?: boolean;
};

export type AppState = {
  workspaces: Workspace[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedWorkspaceId: string | null;
  version: number;
};
