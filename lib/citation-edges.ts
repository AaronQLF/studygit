// Derive dashed "citer → cited" edges from the citation pills embedded in
// every citable node's HTML body. Used by the Canvas to overlay
// provenance edges on top of the user-drawn graph. Pure & React-free so
// it can be unit-tested or reused server-side later.

import { extractCitedNodeIds } from "./citations";
import type { CanvasNode } from "./types";

export const CITATION_EDGE_PREFIX = "cite:";

export type CitationEdge = {
  id: string;
  source: string;
  target: string;
};

/**
 * Every node kind that can be the *target* of a citation pill — i.e. that
 * can be referenced from another node's body. Pages and notes are
 * included so whole-node citations draw provenance edges identically to
 * highlight-anchored ones.
 */
export function isCitableTarget(node: CanvasNode): boolean {
  return (
    node.data.kind === "pdf" ||
    node.data.kind === "link" ||
    node.data.kind === "page" ||
    node.data.kind === "blog" ||
    node.data.kind === "note" ||
    node.data.kind === "ai"
  );
}

/**
 * Every place inside a node where citation pills can be authored. Pages
 * keep their body in `content`; PDFs and links keep notes in `notes`; AI
 * conversations have pills baked into every assistant turn's rendered
 * HTML — concatenating them surfaces every citation made across the
 * whole conversation.
 */
export function citationSourceHtmls(node: CanvasNode): string[] {
  const data = node.data;
  if (data.kind === "page") return data.content ? [data.content] : [];
  if (data.kind === "pdf") return data.notes ? [data.notes] : [];
  if (data.kind === "link") return data.notes ? [data.notes] : [];
  if (data.kind === "ai") {
    return data.turns
      .filter((t) => t.role === "assistant" && t.text)
      .map((t) => t.text);
  }
  return [];
}

/**
 * Build the full set of derived citation edges across a workspace's
 * nodes. Self-references and pills pointing at non-citable kinds are
 * dropped; the returned ids are stable so the Canvas can diff them
 * against the previous render.
 */
export function buildCitationEdges(wsNodes: CanvasNode[]): CitationEdge[] {
  const citableIds = new Set<string>();
  for (const n of wsNodes) {
    if (isCitableTarget(n)) citableIds.add(n.id);
  }
  if (citableIds.size === 0) return [];
  const edges: CitationEdge[] = [];
  const seen = new Set<string>();
  for (const n of wsNodes) {
    const sources = citationSourceHtmls(n);
    if (sources.length === 0) continue;
    for (const html of sources) {
      const targets = extractCitedNodeIds(html);
      for (const target of targets) {
        if (target === n.id) continue;
        if (!citableIds.has(target)) continue;
        const id = `${CITATION_EDGE_PREFIX}${n.id}->${target}`;
        if (seen.has(id)) continue;
        seen.add(id);
        edges.push({ id, source: n.id, target });
      }
    }
  }
  return edges;
}

/**
 * Compact signature that changes when (and only when) the set of
 * citation edges for a workspace changes. Used by the Canvas to take the
 * cheap "data refs only" sync path when nothing structural has changed.
 */
export function citationSignature(wsNodes: CanvasNode[]): string {
  const parts: string[] = [];
  for (const n of wsNodes) {
    const sources = citationSourceHtmls(n);
    if (sources.length === 0) continue;
    const all = new Set<string>();
    for (const html of sources) {
      for (const id of extractCitedNodeIds(html)) all.add(id);
    }
    if (all.size === 0) continue;
    parts.push(`${n.id}:${Array.from(all).sort().join(",")}`);
  }
  return parts.sort().join("|");
}
