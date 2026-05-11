"use client";

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import type {
  CanvasNode,
  LinkNodeData,
  PdfNodeData,
  WebHighlight,
} from "@/lib/types";

export type CitationAttrs = {
  nodeId: string | null;
  highlightId: string | null;
  label: string | null;
  page: number | null;
  excerpt: string | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    citation: {
      insertCitation: (attrs: CitationAttrs) => ReturnType;
    };
  }
}

function clampExcerpt(text: string | null | undefined): string {
  if (!text) return "";
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > 140 ? `${single.slice(0, 140)}…` : single;
}

function hostnameOf(url: string | undefined | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

type ResolvedSource = {
  title: string;
  // What to show as the secondary chip on the pill: page number (PDFs) or
  // hostname (web articles), or null if there's nothing to show.
  locator: { kind: "page"; page: number } | { kind: "host"; host: string } | null;
  highlightText: string | null;
  highlightColor: string | null;
  // True when the source exists but the referenced highlight no longer does.
  orphan: boolean;
};

function resolveSource(
  sourceNode: CanvasNode | null,
  highlightId: string | null
): ResolvedSource | null {
  if (!sourceNode) return null;
  if (sourceNode.data.kind === "pdf") {
    const data = sourceNode.data as PdfNodeData;
    const highlight =
      highlightId != null
        ? data.highlights.find((h) => h.id === highlightId) ?? null
        : null;
    return {
      title: data.title || "Untitled PDF",
      locator: highlight
        ? { kind: "page", page: highlight.page }
        : null,
      highlightText: highlight?.text ?? null,
      highlightColor: highlight?.color ?? null,
      orphan: highlightId != null && highlight == null,
    };
  }
  if (sourceNode.data.kind === "link") {
    const data = sourceNode.data as LinkNodeData;
    const highlights: WebHighlight[] = data.highlights ?? [];
    const highlight =
      highlightId != null
        ? highlights.find((h) => h.id === highlightId) ?? null
        : null;
    const host = hostnameOf(data.extractedFinalUrl ?? data.url);
    return {
      title: data.extractedTitle || data.title || host || "Untitled link",
      locator: host ? { kind: "host", host } : null,
      highlightText: highlight?.text ?? null,
      highlightColor: highlight?.color ?? null,
      orphan: highlightId != null && highlight == null,
    };
  }
  return null;
}

function CitationView({ node, selected }: NodeViewProps) {
  const attrs = node.attrs as CitationAttrs;
  const nodeId = attrs.nodeId;
  const highlightId = attrs.highlightId;

  const sourceNode = useStore((s) =>
    nodeId ? s.nodes.find((n) => n.id === nodeId) ?? null : null
  ) as CanvasNode | null;

  const live = useMemo(
    () => resolveSource(sourceNode, highlightId),
    [sourceNode, highlightId]
  );

  const isMissingSource = nodeId != null && sourceNode == null;
  const isMissingHighlight = live?.orphan ?? false;
  const isBroken = isMissingSource;

  const docTitle = live?.title ?? attrs.label ?? "Missing source";
  const locator =
    live?.locator ??
    (attrs.page != null ? { kind: "page" as const, page: attrs.page } : null);
  const excerpt = clampExcerpt(live?.highlightText ?? attrs.excerpt);
  const color = live?.highlightColor ?? "var(--pg-accent)";

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!nodeId || isBroken) return;
    if (!highlightId) {
      useStore.getState().openPanel(nodeId);
      return;
    }
    useStore.getState().requestHighlightJump(nodeId, highlightId);
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  const locatorLabel =
    locator?.kind === "page"
      ? `p${locator.page}`
      : locator?.kind === "host"
      ? locator.host
      : null;
  const titleAttr = excerpt
    ? `${docTitle}${locatorLabel ? ` · ${locatorLabel}` : ""} — "${excerpt}"`
    : docTitle;

  return (
    <NodeViewWrapper
      as="span"
      className={`pg-citation${selected ? " is-selected" : ""}${
        isBroken ? " is-broken" : ""
      }${isMissingHighlight ? " is-orphan" : ""}`}
      data-drag-handle={false}
      contentEditable={false}
    >
      <button
        type="button"
        className="pg-citation-pill"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        title={titleAttr}
        disabled={isBroken}
        style={{ ["--pg-citation-color" as string]: color }}
      >
        <span className="pg-citation-doc">{docTitle}</span>
        {locatorLabel ? (
          <span className="pg-citation-page">{locatorLabel}</span>
        ) : null}
      </button>
    </NodeViewWrapper>
  );
}

export const Citation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      nodeId: {
        default: null as string | null,
        parseHTML: (element) => element.getAttribute("data-node-id"),
        renderHTML: (attrs) =>
          attrs.nodeId ? { "data-node-id": attrs.nodeId as string } : {},
      },
      highlightId: {
        default: null as string | null,
        parseHTML: (element) => element.getAttribute("data-highlight-id"),
        renderHTML: (attrs) =>
          attrs.highlightId
            ? { "data-highlight-id": attrs.highlightId as string }
            : {},
      },
      label: {
        default: null as string | null,
        parseHTML: (element) => element.getAttribute("data-label"),
        renderHTML: (attrs) =>
          attrs.label ? { "data-label": attrs.label as string } : {},
      },
      page: {
        default: null as number | null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-page");
          if (raw == null || raw === "") return null;
          const n = Number(raw);
          return Number.isFinite(n) ? n : null;
        },
        renderHTML: (attrs) =>
          attrs.page != null ? { "data-page": String(attrs.page) } : {},
      },
      excerpt: {
        default: null as string | null,
        parseHTML: (element) => element.getAttribute("data-excerpt"),
        renderHTML: (attrs) =>
          attrs.excerpt ? { "data-excerpt": attrs.excerpt as string } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-type='citation']" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as CitationAttrs;
    const docLabel = attrs.label ?? "Missing source";
    const excerpt = clampExcerpt(attrs.excerpt);
    // For server-rendered citations we don't know if the source is a PDF or
    // a web article, so fall back to the stored `page` attr (PDFs).
    // Once mounted, the React node view replaces this with the live locator.
    const locatorLabel = attrs.page != null ? `p${attrs.page}` : null;
    const titleAttr = excerpt
      ? `${docLabel}${locatorLabel ? ` · ${locatorLabel}` : ""} — "${excerpt}"`
      : docLabel;
    const pillChildren: Array<string | (string | object)[]> = [
      ["span", { class: "pg-citation-doc" }, docLabel],
    ];
    if (locatorLabel) {
      pillChildren.push([
        "span",
        { class: "pg-citation-page" },
        locatorLabel,
      ]);
    }
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "citation",
        class: "pg-citation",
      }),
      [
        "span",
        { class: "pg-citation-pill", title: titleAttr },
        ...pillChildren,
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CitationView);
  },

  addCommands() {
    return {
      insertCitation:
        (attrs: CitationAttrs) =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs,
            })
            .insertContent(" ")
            .run(),
    } as Partial<RawCommands>;
  },
});

export default Citation;
