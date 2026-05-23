// Canonical "what can be cited in this workspace?" derivation. Read by:
//   - components/SourcePicker.tsx — the popover used by the AI Answer panel
//   - components/extensions/CitationMention.tsx — Tiptap /cite picker
//
// Keeping this single source of truth means both pickers always show the
// exact same rows in the exact same order, even as new citable kinds
// (AI answers, pages, …) come online.

import type {
  AiAnswerNodeData,
  CanvasNode,
  LinkNodeData,
  NoteNodeData,
  PageNodeData,
  PdfHighlight,
  PdfNodeData,
  WebHighlight,
} from "./types";

// Synthetic "highlight" shape used by every non-highlight-anchored row
// (whole pages, notes, AI conversations, full web articles). Lets the
// picker row renderer treat all kinds uniformly while we keep real
// PdfHighlight/WebHighlight objects on the rows that actually have them.
type SyntheticHighlight = {
  id: string;
  text: string;
  color: string;
  createdAt: number;
};

export type SourceRow =
  // --- highlight-anchored ------------------------------------------------
  | {
      kind: "pdf";
      sourceNodeId: string;
      sourceTitle: string;
      locator: string;
      highlight: PdfHighlight;
    }
  | {
      kind: "web";
      sourceNodeId: string;
      sourceTitle: string;
      locator: string;
      highlight: WebHighlight;
    }
  // --- whole-node --------------------------------------------------------
  // Every existing node kind can be attached as a "whole" source. For
  // PDFs and Links these coexist with the per-highlight rows above so
  // the picker shows both options side by side. For pages/notes/ai
  // there's no highlight concept — whole is the only mode.
  | {
      kind: "pdf-whole";
      sourceNodeId: string;
      sourceTitle: string;
      locator: string;
      // We don't pre-extract the PDF text inside buildSourceRows (would
      // freeze the picker on workspaces with lots of PDFs). The synthetic
      // text is a short label; the AI panel calls extractPdfText() on
      // selection.
      highlight: SyntheticHighlight;
    }
  | {
      kind: "page";
      sourceNodeId: string;
      sourceTitle: string;
      locator: string;
      highlight: SyntheticHighlight;
    }
  | {
      kind: "note";
      sourceNodeId: string;
      sourceTitle: string;
      locator: string;
      highlight: SyntheticHighlight;
    }
  | {
      kind: "link";
      sourceNodeId: string;
      sourceTitle: string;
      locator: string;
      highlight: SyntheticHighlight;
    }
  | {
      kind: "ai";
      sourceNodeId: string;
      sourceTitle: string;
      locator: string;
      highlight: SyntheticHighlight;
    };

// Helper used by pickers to tell whole-node rows from highlight-anchored
// ones at a glance — drives the "whole" badge in the row UI.
//
// Note: AI conversation rows are NOT whole-node — each row points at one
// specific assistant turn (carrying the turn id as `highlight.id`), so
// citing one AI reply doesn't drag the entire conversation along.
export function isWholeNodeRow(row: SourceRow): boolean {
  return (
    row.kind === "pdf-whole" ||
    row.kind === "link" ||
    row.kind === "page" ||
    row.kind === "note"
  );
}

function hostnameOf(url: string | undefined | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export type BuildSourceRowsOptions = {
  // Only nodes in this workspace are considered. Pass null to allow all.
  workspaceId: string | null;
  // The node *doing* the citing — excluded from the result so a Page
  // doesn't try to cite itself, and an AI node doesn't list itself as a
  // potential source for its own answer.
  excludeNodeId?: string | null;
};

export function buildSourceRows(
  nodes: CanvasNode[],
  options: BuildSourceRowsOptions
): SourceRow[] {
  const { workspaceId, excludeNodeId = null } = options;
  const rows: SourceRow[] = [];
  for (const node of nodes) {
    if (workspaceId && node.workspaceId !== workspaceId) continue;
    if (excludeNodeId && node.id === excludeNodeId) continue;

    if (node.data.kind === "pdf") {
      const data = node.data as PdfNodeData;
      const title = data.title || "Untitled PDF";
      // Whole-PDF row first — lets the user attach the full document for
      // open-ended questions. Text extraction is deferred to attach time
      // (see lib/pdf-extract.ts) so opening the picker stays instant.
      if (data.src) {
        const pageHint = data.pageCount ? `${data.pageCount} pages` : "PDF";
        rows.push({
          kind: "pdf-whole",
          sourceNodeId: node.id,
          sourceTitle: title,
          locator: pageHint,
          highlight: {
            id: node.id,
            text:
              data.fileName ?? "Whole PDF — extracted at attach time.",
            color: "var(--pg-border-strong)",
            createdAt: 0,
          },
        });
      }
      // Then each highlight as its own row, sorted by recency by the
      // sort step at the end of this function.
      for (const highlight of data.highlights) {
        rows.push({
          kind: "pdf",
          sourceNodeId: node.id,
          sourceTitle: title,
          locator: `p${highlight.page}`,
          highlight,
        });
      }
      continue;
    }

    if (node.data.kind === "link") {
      const data = node.data as LinkNodeData;
      const highlights: WebHighlight[] = data.highlights ?? [];
      const host = hostnameOf(data.extractedFinalUrl ?? data.url) || "link";
      const title =
        data.extractedTitle || data.title || host || "Untitled link";
      // Whole-article row — only meaningful when the reader-view has
      // already run and we have extractedHtml on hand.
      const plain = stripHtml(data.extractedHtml ?? "");
      if (plain) {
        rows.push({
          kind: "link",
          sourceNodeId: node.id,
          sourceTitle: title,
          locator: host,
          highlight: {
            id: node.id,
            text: data.extractedExcerpt?.trim() || plain.slice(0, 500),
            color: "var(--pg-border-strong)",
            createdAt: data.extractedAt ?? 0,
          },
        });
      }
      // Highlight rows alongside the whole-article row.
      for (const highlight of highlights) {
        rows.push({
          kind: "web",
          sourceNodeId: node.id,
          sourceTitle: title,
          locator: host,
          highlight,
        });
      }
      continue;
    }

    if (node.data.kind === "page" || node.data.kind === "blog") {
      const data = node.data as PageNodeData;
      const plain = stripHtml(data.content ?? "");
      if (!plain) continue;
      rows.push({
        kind: "page",
        sourceNodeId: node.id,
        sourceTitle: data.title || "Untitled page",
        locator: "page",
        highlight: {
          id: node.id,
          text: plain,
          color: "var(--pg-border-strong)",
          createdAt: 0,
        },
      });
      continue;
    }

    if (node.data.kind === "note") {
      const data = node.data as NoteNodeData;
      const text = (data.text ?? "").trim();
      if (!text) continue;
      rows.push({
        kind: "note",
        sourceNodeId: node.id,
        sourceTitle:
          text.length > 60 ? `${text.slice(0, 60)}…` : text || "Note",
        locator: "note",
        highlight: {
          id: node.id,
          text,
          // Reuse the note's own color as the row's accent bar — visually
          // ties the row back to the note card on the canvas.
          color: data.color || "var(--pg-border-strong)",
          createdAt: 0,
        },
      });
      continue;
    }

    if (node.data.kind === "ai") {
      const data = node.data as AiAnswerNodeData;
      // Emit one row per assistant turn (one row per AI reply) so each
      // reply is independently citable. The turn id is carried on
      // `highlight.id`, which the citation pill resolver uses to look up
      // the specific turn later; if the turn is ever deleted the pill
      // gets marked orphan but the rest of the workspace's citations
      // keep resolving cleanly.
      const title = data.title || "Conversation";
      for (const turn of data.turns) {
        if (turn.role !== "assistant") continue;
        if (turn.status === "running") continue;
        const plain = stripHtml(turn.text);
        if (!plain) continue;
        rows.push({
          kind: "ai",
          sourceNodeId: node.id,
          sourceTitle: title,
          locator: turn.provenance?.model || "ai",
          highlight: {
            id: turn.id,
            text: plain,
            color: "var(--pg-accent)",
            createdAt: turn.provenance?.finishedAt ?? turn.createdAt,
          },
        });
      }
      continue;
    }
  }

  // Sort in two passes so PDFs/Links keep their Whole row + highlights
  // clustered together instead of scattered across the picker by
  // highlight age:
  //
  //   1. Compute each source node's most-recent timestamp from its rows.
  //   2. Sort across nodes by that timestamp (descending).
  //   3. Within a node, put the Whole row first, then highlights by
  //      their own createdAt (descending).
  const nodeRecency = new Map<string, number>();
  for (const row of rows) {
    const prev = nodeRecency.get(row.sourceNodeId) ?? 0;
    if (row.highlight.createdAt > prev) {
      nodeRecency.set(row.sourceNodeId, row.highlight.createdAt);
    }
  }
  rows.sort((a, b) => {
    const recencyDiff =
      (nodeRecency.get(b.sourceNodeId) ?? 0) -
      (nodeRecency.get(a.sourceNodeId) ?? 0);
    if (recencyDiff !== 0) return recencyDiff;
    if (a.sourceNodeId !== b.sourceNodeId) {
      // Different nodes with the same recency — keep adjacency stable.
      return a.sourceNodeId.localeCompare(b.sourceNodeId);
    }
    // Same node: whole row first, then highlights by recency.
    const aWhole = isWholeNodeRow(a);
    const bWhole = isWholeNodeRow(b);
    if (aWhole !== bWhole) return aWhole ? -1 : 1;
    return b.highlight.createdAt - a.highlight.createdAt;
  });
  return rows;
}

// Soft cap on per-source text fed to the model. Picked to roughly match
// 6–8k tokens of context budget per source, well below a 128k window
// even with many sources attached. Whole pages / whole articles get
// trimmed; highlights are already short by construction.
const MAX_EXCERPT_CHARS = 24_000;

function clampExcerpt(text: string): string {
  if (text.length <= MAX_EXCERPT_CHARS) return text;
  return `${text.slice(0, MAX_EXCERPT_CHARS)}\n\n…[truncated]`;
}

type SourceRefDraft = {
  nodeId: string;
  highlightId: string | null;
  label: string;
  locator: string | null;
  page: number | null;
  excerpt: string;
};

// Synchronous adapter — covers everything except whole-PDF, which needs
// an async pdf.js extraction step. For whole-PDF rows the excerpt comes
// back as an empty string and the caller is expected to use
// `rowToSourceRefAsync` instead.
export function rowToSourceRef(
  row: SourceRow,
  sourceNode: CanvasNode | null = null
): SourceRefDraft {
  if (row.kind === "pdf") {
    return {
      nodeId: row.sourceNodeId,
      highlightId: row.highlight.id,
      label: row.sourceTitle,
      locator: row.locator,
      page: row.highlight.page,
      excerpt: row.highlight.text,
    };
  }
  if (row.kind === "web") {
    return {
      nodeId: row.sourceNodeId,
      highlightId: row.highlight.id,
      label: row.sourceTitle,
      locator: row.locator,
      page: null,
      excerpt: row.highlight.text,
    };
  }

  // Whole-node rows — the picker preview text is short (excerpt or first
  // 500 chars); for the model we want the full content. Re-derive it
  // from the canonical node if the caller passed one in, falling back to
  // whatever lived in the row.
  let excerpt = row.highlight.text;
  if (sourceNode) {
    if (row.kind === "page" && sourceNode.data.kind === "page") {
      excerpt = clampExcerpt(stripHtml(sourceNode.data.content ?? ""));
    } else if (row.kind === "link" && sourceNode.data.kind === "link") {
      const data = sourceNode.data as LinkNodeData;
      excerpt = clampExcerpt(stripHtml(data.extractedHtml ?? ""));
    } else if (row.kind === "note" && sourceNode.data.kind === "note") {
      excerpt = clampExcerpt((sourceNode.data.text ?? "").trim());
    } else if (row.kind === "ai" && sourceNode.data.kind === "ai") {
      // The row already carries the *specific* assistant turn's plain
      // text (per-turn rows are emitted by buildSourceRows). We use that
      // directly so swapping/citing this row attaches just this reply,
      // not the latest one or the whole conversation.
      excerpt = clampExcerpt(row.highlight.text);
    } else if (row.kind === "pdf-whole") {
      // The text isn't fetched yet — the async path supplies it. Return
      // an empty excerpt so callers can detect this and either dispatch
      // the async extractor or show a placeholder chip.
      excerpt = "";
    }
  } else if (row.kind === "pdf-whole") {
    excerpt = "";
  } else {
    excerpt = clampExcerpt(excerpt);
  }

  // AI rows are turn-anchored — carry the turn id through so the
  // citation pill resolver (and the panel's jump-to-turn effect) can
  // find the exact reply later. Other whole-node kinds (page, note,
  // link, pdf-whole) point at the whole node and carry no highlight id.
  const highlightId = row.kind === "ai" ? row.highlight.id : null;

  return {
    nodeId: row.sourceNodeId,
    highlightId,
    label: row.sourceTitle,
    locator: row.locator,
    page: null,
    excerpt,
  };
}

// Async variant — only meaningfully different for `pdf-whole`, which has
// to run pdf.js to extract every page's text. All other kinds short-
// circuit through the sync path.
export async function rowToSourceRefAsync(
  row: SourceRow,
  sourceNode: CanvasNode | null
): Promise<SourceRefDraft> {
  if (row.kind !== "pdf-whole") {
    return rowToSourceRef(row, sourceNode);
  }

  // Resolve the PDF's text. The src always sits on the node, so we need
  // the live canvas node passed in — if it's missing we can't extract.
  if (!sourceNode || sourceNode.data.kind !== "pdf") {
    return {
      nodeId: row.sourceNodeId,
      highlightId: null,
      label: row.sourceTitle,
      locator: row.locator,
      page: null,
      excerpt: "",
    };
  }
  const src = sourceNode.data.src;
  if (!src) {
    return {
      nodeId: row.sourceNodeId,
      highlightId: null,
      label: row.sourceTitle,
      locator: row.locator,
      page: null,
      excerpt: "",
    };
  }
  // Dynamic import keeps the pdf.js chunk out of any bundle that doesn't
  // actually need it (the AI panel only pulls it in when the user picks
  // a whole-PDF source).
  const { extractPdfText } = await import("./pdf-extract");
  const text = await extractPdfText(src);
  return {
    nodeId: row.sourceNodeId,
    highlightId: null,
    label: row.sourceTitle,
    locator: row.locator,
    page: null,
    excerpt: clampExcerpt(text),
  };
}

// Stable key for de-duplicating rows in the picker / source list. Pairs
// the backing node id with the highlight id (or the node id again for
// whole-node citables like AI answers).
export function sourceRowKey(row: SourceRow): string {
  return `${row.sourceNodeId}:${row.highlight.id}`;
}

// What kind a group is, derived from the underlying node. Drives the
// icon in the "pick a source" step of the picker — a Page group always
// shows the page icon even if it contains multiple kinds of rows (it
// won't in v1, but the type leaves room).
export type SourceGroupKind = "pdf" | "link" | "page" | "note" | "ai";

export type SourceGroup = {
  nodeId: string;
  title: string;
  kind: SourceGroupKind;
  rows: SourceRow[];
  // Total count shown next to the title in the node-list view. For
  // PDFs/Links this includes the Whole row plus each highlight; for AI
  // it's the number of citable replies; for pages/notes it's 1.
  count: number;
  // Most recent timestamp across all rows in the group — used for
  // recency sort across groups.
  mostRecent: number;
};

// Re-bucket the flat row list into per-node groups. Sorts groups by
// most recent activity (newest first) and rows within each group using
// the same intra-node ordering as buildSourceRows: whole row first,
// then highlights / replies by recency descending.
export function groupSourceRows(rows: SourceRow[]): SourceGroup[] {
  const byNode = new Map<string, SourceGroup>();
  for (const row of rows) {
    let group = byNode.get(row.sourceNodeId);
    if (!group) {
      group = {
        nodeId: row.sourceNodeId,
        title: row.sourceTitle,
        kind: groupKindForRow(row),
        rows: [],
        count: 0,
        mostRecent: 0,
      };
      byNode.set(row.sourceNodeId, group);
    }
    group.rows.push(row);
    group.count += 1;
    if (row.highlight.createdAt > group.mostRecent) {
      group.mostRecent = row.highlight.createdAt;
    }
  }
  // Sort rows within each group: whole row first, then highlights /
  // replies by recency. Mirrors the sort buildSourceRows already does
  // across the flat list, but applied locally.
  for (const group of byNode.values()) {
    group.rows.sort((a, b) => {
      const aWhole = isWholeNodeRow(a);
      const bWhole = isWholeNodeRow(b);
      if (aWhole !== bWhole) return aWhole ? -1 : 1;
      return b.highlight.createdAt - a.highlight.createdAt;
    });
  }
  // Sort groups by most-recent activity, descending; stable on nodeId
  // when timestamps tie so the order doesn't jitter between renders.
  return Array.from(byNode.values()).sort((a, b) => {
    const recencyDiff = b.mostRecent - a.mostRecent;
    if (recencyDiff !== 0) return recencyDiff;
    return a.nodeId.localeCompare(b.nodeId);
  });
}

function groupKindForRow(row: SourceRow): SourceGroupKind {
  if (row.kind === "pdf" || row.kind === "pdf-whole") return "pdf";
  if (row.kind === "web" || row.kind === "link") return "link";
  if (row.kind === "page") return "page";
  if (row.kind === "note") return "note";
  return "ai";
}
