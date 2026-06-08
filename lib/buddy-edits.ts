"use client";

// Parse and apply Study Buddy "edit suggestion" payloads.
//
// The buddy is instructed (via systemPromptExtra) to emit any proposed
// edits to a Page or Note as a fenced code block tagged `pgedit`,
// containing a single JSON object describing what to change. After the
// server's Markdown→HTML pipeline runs (lib/ai-citations.ts), each such
// fence becomes:
//
//     <pre><code class="language-pgedit">{ ...JSON... }</code></pre>
//
// (The sanitizer allowlist already permits `pre` + `code` with `class`,
// so no changes to ai-citations.ts were needed to let these pass.)
//
// On the client, the dock's turn renderer pulls those blocks out of the
// HTML before display and renders an interactive Accept/Reject card for
// each one alongside the prose. Accepting an edit dispatches a single
// `updateNodeData` call against the target node — Page (rich-text HTML),
// Note (plain text), or a Link node's free-form `notes` field.

import type { AnyNodeData, CanvasNode } from "./types";

export type EditMode = "replace" | "append" | "prepend";

// Targets are either an explicit canvas node id (for any editable
// node — Page / Note / Link.notes) or the sentinel "current", which the
// resolver swaps for whichever editable node is currently focused at
// apply time. "current" is the most useful default because the buddy
// follows the user's focus.
export type EditTarget = string;

export type EditSuggestion = {
  // Stable client-side id, generated when the suggestion is parsed out
  // of the assistant turn. Used as a React key and to track which
  // suggestion has been accepted/rejected (we keep them in component
  // state so the same turn doesn't re-apply on re-render).
  id: string;
  target: EditTarget;
  mode: EditMode;
  // Short human-readable label the model picked. Surfaced as the card
  // title so the user can see what's being proposed at a glance.
  title?: string;
  // The new content. For Page / Link.notes this is HTML; for Note it
  // is plain text. The applier coerces between the two if the target
  // kind doesn't match (e.g. user proposed HTML but target is a Note).
  content: string;
  // Optional rationale. Rendered as a footer line on the card.
  reason?: string;
};

const PGEDIT_RE =
  /<pre[^>]*>\s*<code[^>]*class="[^"]*\blanguage-pgedit\b[^"]*"[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi;

function decodeHtmlEntities(input: string): string {
  // Marked HTML-escapes content inside fenced code blocks. We need to
  // un-escape before JSON.parse, but we deliberately don't run a full
  // entity decoder — the sanitizer already discarded anything dangerous,
  // and only these five escapes appear inside model-emitted JSON in
  // practice.
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseSuggestion(rawJson: string, idSeed: string): EditSuggestion | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeHtmlEntities(rawJson.trim()));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const target = typeof obj.target === "string" ? obj.target.trim() : "";
  if (!target) return null;

  const modeRaw = typeof obj.mode === "string" ? obj.mode.trim().toLowerCase() : "";
  const mode: EditMode =
    modeRaw === "append" ? "append" : modeRaw === "prepend" ? "prepend" : "replace";

  // Models occasionally use "replace"+"new"+"old" or just "content".
  // Normalize to a single `content` field so the card and applier don't
  // have to know about the variants.
  const content =
    typeof obj.content === "string"
      ? obj.content
      : typeof obj.replace === "string"
        ? obj.replace
        : typeof obj.new === "string"
          ? obj.new
          : "";
  if (!content.trim()) return null;

  const title = typeof obj.title === "string" ? obj.title.trim() : undefined;
  const reason = typeof obj.reason === "string" ? obj.reason.trim() : undefined;

  return {
    id: idSeed,
    target,
    mode,
    title: title || undefined,
    content,
    reason: reason || undefined,
  };
}

// Pull every pgedit block out of a rendered assistant turn's HTML. The
// returned `cleanHtml` has the fenced code blocks stripped so the dock
// can render interactive cards in their place without showing the raw
// JSON twice.
export function extractEditSuggestions(html: string): {
  cleanHtml: string;
  suggestions: EditSuggestion[];
} {
  if (!html.includes("language-pgedit")) {
    return { cleanHtml: html, suggestions: [] };
  }
  const suggestions: EditSuggestion[] = [];
  let counter = 0;
  const cleanHtml = html.replace(PGEDIT_RE, (_match, body: string) => {
    counter += 1;
    const idSeed = `pgedit-${counter}`;
    const parsed = parseSuggestion(body, idSeed);
    if (parsed) suggestions.push(parsed);
    return "";
  });
  return { cleanHtml, suggestions };
}

// Convert a piece of HTML to a reasonable plain-text representation for
// targets that don't accept HTML (Note nodes). Mirrors the lightweight
// stripper used elsewhere in the app — no external deps, deterministic,
// and good enough for prose. We deliberately don't decode every HTML
// entity (those are sanitized upstream); this only normalizes the
// handful that survive the markdown pipeline.
function htmlToPlain(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Wrap arbitrary plain text into a minimal HTML representation suitable
// for Page nodes. Splits on blank lines into paragraphs and preserves
// single newlines as <br>.
function plainToHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return "";
  return paragraphs
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// True for nodes the buddy is allowed to edit. Keeping this list small
// (Page, Note, Link.notes) intentionally — anything more would need
// kind-specific handling for highlight anchors and we don't want the
// model rewriting PDF metadata or AI conversation transcripts.
export type EditableKind = "page" | "note" | "link";

export function editableKindOf(node: CanvasNode | null): EditableKind | null {
  if (!node) return null;
  const k = node.data.kind;
  if (k === "page" || k === "note" || k === "link") return k;
  return null;
}

// Resolve "current" to whichever node id the user is actually focused
// on, but only if that node is editable. Falls back to the literal
// target id otherwise.
export function resolveEditTarget(
  target: EditTarget,
  focusedNodeId: string | null,
  nodes: CanvasNode[]
): { nodeId: string | null; node: CanvasNode | null; kind: EditableKind | null } {
  const directNode = nodes.find((n) => n.id === target) ?? null;
  if (directNode) {
    return { nodeId: directNode.id, node: directNode, kind: editableKindOf(directNode) };
  }
  if (target === "current" && focusedNodeId) {
    const focused = nodes.find((n) => n.id === focusedNodeId) ?? null;
    return {
      nodeId: focused?.id ?? null,
      node: focused,
      kind: editableKindOf(focused),
    };
  }
  return { nodeId: null, node: null, kind: null };
}

// Build the Partial<AnyNodeData> patch for accepting `suggestion` against
// `node`. Returns null if the target isn't editable. The caller (the
// dock's Accept handler) hands the patch to `updateNodeData`.
export function buildEditPatch(
  suggestion: EditSuggestion,
  node: CanvasNode
): Partial<AnyNodeData> | null {
  const kind = editableKindOf(node);
  if (!kind) return null;

  if (kind === "page" && node.data.kind === "page") {
    const incoming = suggestion.content;
    // If the model emitted plain text, wrap it into <p> so the rich-text
    // editor renders it cleanly.
    const incomingHtml = /<[a-z][^>]*>/i.test(incoming) ? incoming : plainToHtml(incoming);
    if (suggestion.mode === "replace") {
      return { content: incomingHtml };
    }
    if (suggestion.mode === "append") {
      return { content: `${node.data.content ?? ""}${incomingHtml}` };
    }
    return { content: `${incomingHtml}${node.data.content ?? ""}` };
  }

  if (kind === "note" && node.data.kind === "note") {
    const incoming = /<[a-z][^>]*>/i.test(suggestion.content)
      ? htmlToPlain(suggestion.content)
      : suggestion.content;
    if (suggestion.mode === "replace") {
      return { text: incoming };
    }
    if (suggestion.mode === "append") {
      const sep = (node.data.text ?? "").trim() ? "\n\n" : "";
      return { text: `${node.data.text ?? ""}${sep}${incoming}` };
    }
    const sep = (node.data.text ?? "").trim() ? "\n\n" : "";
    return { text: `${incoming}${sep}${node.data.text ?? ""}` };
  }

  if (kind === "link" && node.data.kind === "link") {
    // Link nodes have a free-form `notes` HTML field that lives next
    // to the article reader. That's the only writable surface on a
    // link — everything else (extracted snapshot, highlights) is
    // managed by the reader itself.
    const incoming = suggestion.content;
    const incomingHtml = /<[a-z][^>]*>/i.test(incoming) ? incoming : plainToHtml(incoming);
    if (suggestion.mode === "replace") {
      return { notes: incomingHtml };
    }
    if (suggestion.mode === "append") {
      return { notes: `${node.data.notes ?? ""}${incomingHtml}` };
    }
    return { notes: `${incomingHtml}${node.data.notes ?? ""}` };
  }

  return null;
}

// Plain-text preview for the Accept/Reject card — a short summary of
// what the new content looks like. Caps to ~280 chars so a giant
// rewrite doesn't blow the card's height.
export function previewContent(suggestion: EditSuggestion): string {
  const text = /<[a-z][^>]*>/i.test(suggestion.content)
    ? htmlToPlain(suggestion.content)
    : suggestion.content;
  const trimmed = text.trim();
  if (trimmed.length <= 280) return trimmed;
  return `${trimmed.slice(0, 280)}…`;
}
