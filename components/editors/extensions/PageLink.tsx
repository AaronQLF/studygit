"use client";

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { FileText } from "lucide-react";
import { useStore } from "@/lib/store";
import type { CanvasNode, PageNodeData } from "@/lib/types";

export type PageLinkAttrs = {
  // The id of the page node this pill points to.
  pageId: string | null;
  // Snapshot of the target page's title at insert-time, used as a fallback
  // when the live node can't be resolved (e.g. server-rendered preview, or
  // the target was deleted).
  label: string | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageLink: {
      insertPageLink: (attrs: PageLinkAttrs) => ReturnType;
    };
  }
}

function PageLinkView({ node, selected }: NodeViewProps) {
  const attrs = node.attrs as PageLinkAttrs;
  const pageId = attrs.pageId;

  // Subscribe to the linked node so the pill label updates live as the
  // target page is renamed (matches the Citation extension's behavior).
  const targetNode = useStore((s) =>
    pageId ? s.nodes.find((n) => n.id === pageId) ?? null : null
  ) as CanvasNode | null;

  const isMissing = pageId != null && targetNode == null;
  const isPage = targetNode?.data.kind === "page";

  const liveTitle =
    isPage && (targetNode!.data as PageNodeData).title
      ? (targetNode!.data as PageNodeData).title
      : null;
  const displayLabel =
    liveTitle ?? attrs.label ?? (isMissing ? "Missing page" : "Untitled page");

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!pageId || isMissing) return;
    const state = useStore.getState();
    if (
      targetNode &&
      targetNode.workspaceId !== state.selectedWorkspaceId
    ) {
      state.selectWorkspace(targetNode.workspaceId);
    }
    state.openPanel(pageId);
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  return (
    <NodeViewWrapper
      as="span"
      className={`pg-page-link${selected ? " is-selected" : ""}${
        isMissing ? " is-broken" : ""
      }`}
      data-drag-handle={false}
      contentEditable={false}
    >
      <button
        type="button"
        className="pg-page-link-pill"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        title={isMissing ? "This subpage no longer exists" : `Open “${displayLabel}”`}
        disabled={isMissing}
      >
        <FileText size={11} className="pg-page-link-icon" aria-hidden />
        <span className="pg-page-link-label">{displayLabel}</span>
      </button>
    </NodeViewWrapper>
  );
}

export const PageLink = Node.create({
  name: "pageLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      pageId: {
        default: null as string | null,
        parseHTML: (element) => element.getAttribute("data-page-id"),
        renderHTML: (attrs) =>
          attrs.pageId ? { "data-page-id": attrs.pageId as string } : {},
      },
      label: {
        default: null as string | null,
        parseHTML: (element) => element.getAttribute("data-label"),
        renderHTML: (attrs) =>
          attrs.label ? { "data-label": attrs.label as string } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-type='page-link']" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as PageLinkAttrs;
    const label = attrs.label ?? "Untitled page";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "page-link",
        class: "pg-page-link",
      }),
      [
        "span",
        {
          class: "pg-page-link-pill",
          title: `Open “${label}”`,
        },
        ["span", { class: "pg-page-link-icon", "aria-hidden": "true" }, "📄"],
        ["span", { class: "pg-page-link-label" }, label],
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageLinkView);
  },

  addCommands() {
    return {
      insertPageLink:
        (attrs: PageLinkAttrs) =>
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

export default PageLink;
