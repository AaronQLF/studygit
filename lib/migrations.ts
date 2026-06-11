import { marked } from "marked";
import type {
  BlogNodeData,
  CanvasNode,
  FlashcardsNodeData,
  LinkNodeData,
  PageNodeData,
} from "./types";

marked.setOptions({
  gfm: true,
  breaks: false,
});

export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return "";
  try {
    const html = marked.parse(markdown, { async: false }) as string;
    return html.trim();
  } catch {
    const escaped = markdown
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<p>${escaped.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`;
  }
}

/** Plain-text document bodies → minimal TipTap-friendly HTML. */
export function plainTextToPageHtml(text: string): string {
  if (!text.trim()) return "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`;
}

export function blogDataToPageData(blog: BlogNodeData): PageNodeData {
  return {
    kind: "page",
    title: blog.title,
    content: markdownToHtml(blog.markdown),
  };
}

/** Persisted shape before document nodes were removed (highlights/comments dropped). */
type LegacyDocumentNodeData = {
  kind: "document";
  title: string;
  content: string;
};

function documentLegacyToPageData(d: LegacyDocumentNodeData): PageNodeData {
  return {
    kind: "page",
    title: d.title?.trim() ? d.title : "Migrated page",
    content: plainTextToPageHtml(d.content ?? ""),
  };
}

export function migrateNode(node: CanvasNode): {
  node: CanvasNode;
  changed: boolean;
} {
  const kind = (node.data as { kind: string }).kind;

  if (kind === "blog") {
    return {
      node: {
        ...node,
        data: blogDataToPageData(node.data as BlogNodeData),
      },
      changed: true,
    };
  }

  if (kind === "document") {
    const nextData = documentLegacyToPageData(
      node.data as unknown as LegacyDocumentNodeData
    );
    return {
      node: {
        ...node,
        data: nextData,
        width:
          node.width === 360 || node.width === undefined ? 440 : node.width,
      },
      changed: true,
    };
  }

  // Link nodes gained a `highlights` array when reader-view annotations
  // shipped. Backfill so the array is always non-undefined.
  if (kind === "link") {
    const data = node.data as LinkNodeData;
    if (!Array.isArray(data.highlights)) {
      return {
        node: {
          ...node,
          data: { ...data, highlights: [] },
        },
        changed: true,
      };
    }
  }

  // Flashcards decks: backfill the `cards` array so hand-edited or
  // partially-written snapshots can't crash the deck panel.
  if (kind === "flashcards") {
    const data = node.data as FlashcardsNodeData;
    if (!Array.isArray(data.cards)) {
      return {
        node: { ...node, data: { ...data, cards: [] } },
        changed: true,
      };
    }
  }

  // AI Answer / conversation nodes.
  //
  // Two ages of data to handle here:
  //   1. The initial single-shot shape we shipped briefly:
  //        { prompt, answer, sources, provenance, status }
  //      Convert it into a two-turn conversation so no work is lost.
  //   2. Any node missing the modern fields (e.g. hand-edited state.json):
  //      backfill `turns: []` and `sources: []` so panels don't crash on
  //      runtime undefined accesses.
  if (kind === "ai") {
    const data = node.data as unknown as Record<string, unknown>;
    const hasModernTurns = Array.isArray(data.turns);
    const hasLegacyShape =
      typeof data.prompt === "string" || typeof data.answer === "string";

    // A turn persisted as "running" means the app reloaded (or crashed)
    // mid-request. Left as-is it permanently blocks the conversation —
    // useConversation refuses to send while any turn is running — so
    // demote it to a retryable error on load.
    const hasStuckRunningTurn =
      hasModernTurns &&
      (data.turns as Array<{ status?: string }>).some(
        (t) => t?.status === "running"
      );

    const needsMigration = !hasModernTurns || hasLegacyShape || hasStuckRunningTurn;
    if (needsMigration) {
      const turns: Array<{
        id: string;
        role: "user" | "assistant";
        text: string;
        createdAt: number;
        status?: "idle" | "running" | "error";
        provenance?: unknown;
        error?: string;
      }> = Array.isArray(data.turns)
        ? (data.turns as Array<{
            id: string;
            role: "user" | "assistant";
            text: string;
            createdAt: number;
            status?: "idle" | "running" | "error";
            provenance?: unknown;
            error?: string;
          }>)
        : [];

      // Legacy prompt → leading user turn (only if it didn't already get
      // copied in some earlier partial migration).
      if (typeof data.prompt === "string" && data.prompt.trim()) {
        const alreadyHas = turns.some(
          (t) => t.role === "user" && t.text === data.prompt
        );
        if (!alreadyHas) {
          turns.push({
            id: `t-${node.id}-user-0`,
            role: "user",
            text: data.prompt as string,
            createdAt: Date.now(),
          });
        }
      }
      // Legacy answer → assistant turn.
      if (typeof data.answer === "string" && data.answer.trim()) {
        const alreadyHas = turns.some(
          (t) => t.role === "assistant" && t.text === data.answer
        );
        if (!alreadyHas) {
          turns.push({
            id: `t-${node.id}-asst-0`,
            role: "assistant",
            text: data.answer as string,
            createdAt: Date.now(),
            status: "idle",
            provenance: (data.provenance as unknown) ?? null,
          });
        }
      }

      return {
        node: {
          ...node,
          data: {
            kind: "ai",
            title:
              typeof data.title === "string" && data.title
                ? (data.title as string)
                : "Ask AI",
            sources: Array.isArray(data.sources)
              ? (data.sources as never[])
              : [],
            turns: turns.map((t) =>
              t.status === "running"
                ? {
                    ...t,
                    status: "error" as const,
                    error:
                      "Interrupted — the app reloaded while this reply was generating. Retry to re-ask.",
                  }
                : t
            ) as never,
          },
        },
        changed: true,
      };
    }
  }

  return { node, changed: false };
}
