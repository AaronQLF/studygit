export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
};

export type NodeKind =
  | "link"
  | "image"
  | "note"
  | "blog"
  | "document"
  | "pdf";

export type Highlight = {
  id: string;
  start: number;
  end: number;
  color: string;
  comments: Comment[];
  createdAt: number;
};

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

export type DocumentNodeData = {
  kind: "document";
  title: string;
  content: string;
  highlights: Highlight[];
};

export type PdfNodeData = {
  kind: "pdf";
  title: string;
  src: string;
  fileName?: string;
  pageCount?: number;
  highlights: PdfHighlight[];
};

export type AnyNodeData =
  | LinkNodeData
  | ImageNodeData
  | NoteNodeData
  | BlogNodeData
  | DocumentNodeData
  | PdfNodeData;

export type CanvasNode = {
  id: string;
  folderId: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: AnyNodeData;
};

export type CanvasEdge = {
  id: string;
  folderId: string;
  source: string;
  target: string;
};

export type AppState = {
  folders: Folder[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedFolderId: string | null;
  version: number;
};
