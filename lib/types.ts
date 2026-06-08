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
  | "shape"
  | "ai";

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

// A single source the user attached to an AI answer. Generic enough to
// point at a PDF highlight, a web highlight, a Page, or even another AI
// answer — anything cite-able elsewhere in the app.
//
// `sid` is the short id the model uses inside its prose ([s1], [s2], …);
// it's stable for the lifetime of one answer so the post-processed pills
// in `AiAnswerNodeData.answer` keep pointing at the right source even if
// the user reorders the chips afterwards.
export type AiSourceRef = {
  sid: string;
  // Backing pointer.
  nodeId: string;
  highlightId?: string | null;
  // Display.
  label: string;
  locator: string | null;
  page?: number | null;
  // The exact text snapshot the model saw. Stored so we can re-run the
  // citation verifier or show "source has changed since this answer was
  // generated" later.
  excerpt: string;
};

export type AiProvenance = {
  model: string;
  baseUrlHost: string;
  promptHash: string;
  createdAt: number;
  finishedAt: number;
  // Counters emitted by lib/ai-citations.ts. Surfaced in the panel so the
  // user knows how many [sN] markers the model wanted to emit vs. how many
  // survived verification.
  citationsResolved: number;
  citationsDropped: number;
  citationsDemoted: number;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export type AiTurnStatus = "idle" | "running" | "error";

// Inline attachment (currently always an image) the user paste/drop/picked
// into the composer. Stored as a data URL so the conversation is fully
// self-contained — no orphaned object-storage references — and re-fed to
// the model verbatim on every turn that includes it. Sized down on the
// client before being stamped onto the turn.
export type AiAttachment = {
  kind: "image";
  // `data:image/<png|jpeg|webp|gif>;base64,...`
  dataUrl: string;
  mimeType: string;
  name?: string;
  // Final pixel dimensions after client-side resize. Optional; used for
  // layout hints in the user-turn renderer.
  width?: number;
  height?: number;
};

export type AiTurn = {
  id: string;
  role: "user" | "assistant";
  // User turns store plain text; assistant turns store HTML (Markdown
  // rendered server-side + <span data-type="citation"…> pills). Click-jump
  // on those pills is wired up by the panel's delegated click handler.
  text: string;
  createdAt: number;
  // Optional image attachments captured at compose time on user turns.
  // Assistant turns never carry attachments.
  attachments?: AiAttachment[];
  // Set on assistant turns. `status` flows running → idle/error during a
  // model call; `provenance` records the model/usage/citation counters
  // for the completed answer.
  status?: AiTurnStatus;
  provenance?: AiProvenance | null;
  error?: string;
};

// A conversation node. Sources are sticky to the whole conversation —
// they're sent with every assistant turn so the model has the same
// grounding context each time. `turns` is the chronological exchange:
// alternating user/assistant entries that get appended via the composer
// at the bottom of the panel.
export type AiAnswerNodeData = {
  kind: "ai";
  title: string;
  sources: AiSourceRef[];
  turns: AiTurn[];
};

export type AnyNodeData =
  | LinkNodeData
  | ImageNodeData
  | NoteNodeData
  | BlogNodeData
  | PdfNodeData
  | PageNodeData
  | ShapeNodeData
  | AiAnswerNodeData;

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

// Persistent app-wide Study Buddy state. Lives next to the canvas (not
// inside any one node) so it follows the user across workspaces and
// reloads. The buddy auto-attaches the currently focused node as its
// primary source at send time; `extraSources` are any additional sources
// the user has manually pinned to the conversation via the dock's
// SourcePicker (same flow as AI conversation nodes).
export type StudyBuddyState = {
  open: boolean;
  // Pixel width of the right-side dock. Persisted so resizing sticks.
  width: number;
  turns: AiTurn[];
  extraSources: AiSourceRef[];
  // Hands-free conversation mode. When true, the buddy auto-listens,
  // auto-sends each utterance once the user finishes speaking, and
  // reads each reply back via the browser's speech-synthesis engine —
  // approximating the OpenAI Realtime API loop using only the existing
  // /api/ai endpoint and the user's configured AI provider. Persisted
  // so the user doesn't have to re-engage it every session.
  handsFree: boolean;
};

export type AppState = {
  workspaces: Workspace[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedWorkspaceId: string | null;
  version: number;
  // Optional for back-compat with snapshots saved before the Study
  // Buddy feature shipped — a missing buddy slot hydrates to defaults.
  studyBuddy?: StudyBuddyState;
};
