"use client";

// Global content search across every workspace: pages, notes, links and
// their highlights, PDFs and their highlights, flashcards, and AI
// replies. Powers the ⌘K palette's "Content" section.
//
// Design: a flat list of weighted text entries derived from the node
// list, matched by case-insensitive all-terms substring. Heavy
// derivations (stripping page/article HTML) are cached in a WeakMap
// keyed by the node's `data` object, so re-querying while typing only
// pays for nodes that actually changed.

import type {
  AiAnswerNodeData,
  CanvasNode,
  FlashcardsNodeData,
  LinkNodeData,
  NoteNodeData,
  PageNodeData,
  PdfNodeData,
  Workspace,
} from "./types";

export type SearchHitKind =
  | "page"
  | "note"
  | "link"
  | "pdf"
  | "ai"
  | "flashcards"
  | "image"
  | "shape";

export type SearchHit = {
  kind: SearchHitKind;
  nodeId: string;
  workspaceId: string;
  workspaceName: string;
  title: string;
  // Short context around the first match, for the result row.
  snippet: string;
  score: number;
  // Set when the match lives inside a specific PDF/web highlight —
  // selecting the hit deep-links to it via requestHighlightJump.
  highlightId?: string;
};

type Entry = {
  kind: SearchHitKind;
  nodeId: string;
  workspaceId: string;
  title: string;
  text: string;
  // Field weight: 3 = title, 2 = focused content (note text, highlight,
  // card), 1 = long body text.
  weight: number;
  highlightId?: string;
};

// Cap per-field text so one giant extracted article doesn't dominate
// matching time. Matches beyond this depth are rare enough to skip.
const MAX_FIELD_CHARS = 30_000;

const strippedHtmlCache = new WeakMap<object, string>();

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

function strippedCached(dataRef: object, html: string | undefined): string {
  if (!html) return "";
  const cached = strippedHtmlCache.get(dataRef);
  if (cached !== undefined) return cached;
  const plain = stripHtml(html).slice(0, MAX_FIELD_CHARS);
  strippedHtmlCache.set(dataRef, plain);
  return plain;
}

function entriesForNode(node: CanvasNode): Entry[] {
  const base = { nodeId: node.id, workspaceId: node.workspaceId };
  const data = node.data;
  const out: Entry[] = [];

  switch (data.kind) {
    case "page":
    case "blog": {
      const d = data as PageNodeData;
      const title = d.title || "Untitled page";
      out.push({ ...base, kind: "page", title, text: title, weight: 3 });
      const body = strippedCached(d, d.content);
      if (body) out.push({ ...base, kind: "page", title, text: body, weight: 1 });
      break;
    }
    case "note": {
      const d = data as NoteNodeData;
      const text = (d.text ?? "").trim();
      if (!text) break;
      const title = text.length > 60 ? `${text.slice(0, 60)}…` : text;
      out.push({ ...base, kind: "note", title, text, weight: 2 });
      break;
    }
    case "link": {
      const d = data as LinkNodeData;
      const title = d.extractedTitle || d.title || d.url || "Untitled link";
      out.push({
        ...base,
        kind: "link",
        title,
        text: `${title} ${d.url ?? ""}`,
        weight: 3,
      });
      const body = strippedCached(d, d.extractedHtml);
      if (body) out.push({ ...base, kind: "link", title, text: body, weight: 1 });
      for (const h of d.highlights ?? []) {
        if (!h.text?.trim()) continue;
        out.push({
          ...base,
          kind: "link",
          title,
          text: h.text,
          weight: 2,
          highlightId: h.id,
        });
      }
      break;
    }
    case "pdf": {
      const d = data as PdfNodeData;
      const title = d.title || d.fileName || "Untitled PDF";
      out.push({
        ...base,
        kind: "pdf",
        title,
        text: `${title} ${d.fileName ?? ""}`,
        weight: 3,
      });
      const notes = strippedCached(d, d.notes);
      if (notes) out.push({ ...base, kind: "pdf", title, text: notes, weight: 1 });
      for (const h of d.highlights ?? []) {
        if (!h.text?.trim()) continue;
        out.push({
          ...base,
          kind: "pdf",
          title: `${title} · p${h.page}`,
          text: h.text,
          weight: 2,
          highlightId: h.id,
        });
      }
      break;
    }
    case "ai": {
      const d = data as AiAnswerNodeData;
      const title = d.title || "Conversation";
      out.push({ ...base, kind: "ai", title, text: title, weight: 2 });
      for (const turn of d.turns ?? []) {
        const plain =
          turn.role === "assistant"
            ? stripHtml(turn.text).slice(0, MAX_FIELD_CHARS)
            : turn.text;
        if (!plain?.trim()) continue;
        out.push({ ...base, kind: "ai", title, text: plain, weight: 1 });
      }
      break;
    }
    case "flashcards": {
      const d = data as FlashcardsNodeData;
      const title = d.title || "Untitled deck";
      out.push({ ...base, kind: "flashcards", title, text: title, weight: 3 });
      for (const card of d.cards ?? []) {
        const text = `${card.front} ${card.back}`.trim();
        if (!text) continue;
        out.push({ ...base, kind: "flashcards", title, text, weight: 2 });
      }
      break;
    }
    case "image": {
      const caption = (data.caption ?? "").trim();
      if (!caption) break;
      out.push({
        ...base,
        kind: "image",
        title: caption,
        text: caption,
        weight: 2,
      });
      break;
    }
    case "shape": {
      const label = (data.label ?? "").trim();
      if (!label) break;
      out.push({ ...base, kind: "shape", title: label, text: label, weight: 2 });
      break;
    }
    default:
      break;
  }
  return out;
}

function snippetAround(text: string, index: number, termLength: number): string {
  const radius = 44;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + termLength + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

/**
 * All-terms substring search over every workspace's content. Returns the
 * best hit per (node, highlight) pair, ranked by field weight with small
 * bonuses for prefix/whole-word title matches.
 */
export function searchContent(
  nodes: CanvasNode[],
  workspaces: Workspace[],
  rawQuery: string,
  limit = 10
): SearchHit[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < 2) return [];
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const wsNames = new Map(workspaces.map((w) => [w.id, w.name]));
  // Best hit per target so one node with many body matches doesn't crowd
  // the list. Highlights count as distinct targets (they deep-link).
  const best = new Map<string, SearchHit>();

  for (const node of nodes) {
    for (const entry of entriesForNode(node)) {
      const haystack = entry.text.toLowerCase();
      let firstIdx = -1;
      let allMatch = true;
      for (const term of terms) {
        const at = haystack.indexOf(term);
        if (at === -1) {
          allMatch = false;
          break;
        }
        if (firstIdx === -1 || at < firstIdx) firstIdx = at;
      }
      if (!allMatch || firstIdx === -1) continue;

      let score = entry.weight * 10;
      if (entry.weight === 3) {
        const titleLower = entry.title.toLowerCase();
        if (titleLower.startsWith(query)) score += 8;
        else if (titleLower.includes(query)) score += 4;
      }
      // Exact phrase (all terms adjacent as typed) beats scattered terms.
      if (terms.length > 1 && haystack.includes(query)) score += 3;

      const key = `${entry.nodeId}:${entry.highlightId ?? ""}`;
      const existing = best.get(key);
      if (existing && existing.score >= score) continue;
      best.set(key, {
        kind: entry.kind,
        nodeId: entry.nodeId,
        workspaceId: entry.workspaceId,
        workspaceName: wsNames.get(entry.workspaceId) ?? "Workspace",
        title: entry.title,
        snippet: snippetAround(entry.text, firstIdx, terms[0].length),
        score,
        highlightId: entry.highlightId,
      });
    }
  }

  return Array.from(best.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
