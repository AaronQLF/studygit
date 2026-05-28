"use client";

import { Extension, type Editor } from "@tiptap/core";
import { useStore } from "@/lib/store";
import type { CanvasNode, PageNodeData } from "@/lib/types";

// Fired by the slash menu when the user picks the "Page (subpage)" item.
// PageLinkCreator listens for this event on the editor it was configured
// with, materialises a new page node on the canvas, draws a logical edge
// between the parent and child, and inserts a clickable pill at the
// caret position.
export const SUBPAGE_CREATE_EVENT = "pg:create-subpage";

export type SubpageCreateEventDetail = {
  editor: Editor;
  // Optional title hint. The slash menu currently doesn't prompt — the
  // panel just opens on top of the new page so the user can start typing
  // the title immediately.
  title?: string;
};

type PageLinkCreatorOptions = {
  sourceNodeId: string | null;
  workspaceId: string | null;
};

const DEFAULT_PAGE_WIDTH = 440;
const SIBLING_GAP = 64;

function findFreePositionFor(
  parent: CanvasNode,
  siblings: CanvasNode[]
): { x: number; y: number } {
  const parentWidth = parent.width ?? DEFAULT_PAGE_WIDTH;
  let candidateX = parent.position.x + parentWidth + SIBLING_GAP;
  const candidateY = parent.position.y;

  // Walk down the row to the right of the parent and stop at the first
  // column that's empty. Keeps subpages from stacking on top of each other
  // when a parent spawns many children.
  for (let attempt = 0; attempt < 16; attempt++) {
    const collides = siblings.some((n) => {
      if (n.id === parent.id) return false;
      const w = n.width ?? DEFAULT_PAGE_WIDTH;
      const h = n.height ?? 280;
      const overlapsX =
        n.position.x < candidateX + DEFAULT_PAGE_WIDTH &&
        n.position.x + w > candidateX;
      const overlapsY =
        n.position.y < candidateY + 320 && n.position.y + h > candidateY;
      return overlapsX && overlapsY;
    });
    if (!collides) break;
    candidateX += DEFAULT_PAGE_WIDTH + SIBLING_GAP;
  }

  return { x: candidateX, y: candidateY };
}

export const PageLinkCreator = Extension.create<PageLinkCreatorOptions>({
  name: "pageLinkCreator",

  addOptions() {
    return {
      sourceNodeId: null,
      workspaceId: null,
    };
  },

  onCreate() {
    const editor = this.editor;
    const options = this.options;

    const handleEvent = (event: Event) => {
      const detail = (event as CustomEvent<SubpageCreateEventDetail>).detail;
      if (!detail || detail.editor !== editor) return;

      const state = useStore.getState();
      const workspaceId = options.workspaceId ?? state.selectedWorkspaceId;
      if (!workspaceId) return;

      const parent = options.sourceNodeId
        ? state.nodes.find((n) => n.id === options.sourceNodeId) ?? null
        : null;

      const wsNodes = state.nodes.filter((n) => n.workspaceId === workspaceId);
      const position = parent
        ? findFreePositionFor(parent, wsNodes)
        : { x: 120, y: 120 };

      const title = (detail.title?.trim() || "Untitled page").slice(0, 120);
      const data: PageNodeData = {
        kind: "page",
        title,
        content: "",
      };

      const newId = state.addNode(workspaceId, data, position);

      // Draw the structural edge on the canvas so the relationship is
      // visible without opening either panel. Self-edges are a no-op
      // upstream, so we don't have to guard for the (shouldn't-happen)
      // case where source equals the freshly minted id.
      if (parent) {
        state.addEdge(workspaceId, parent.id, newId);
      }

      // Insert the clickable pill so the parent body has a navigable
      // reference too. Inserted via the editor command so it lands at the
      // current selection (slash menu already deleted the `/page` range).
      editor
        .chain()
        .focus()
        .insertPageLink({ pageId: newId, label: title })
        .run();

      // Open the new page in a panel so the user can rename it and start
      // writing immediately. Deferred a frame so the editor finishes its
      // own command before the panel grabs focus.
      requestAnimationFrame(() => {
        state.openPanel(newId);
      });
    };

    window.addEventListener(SUBPAGE_CREATE_EVENT, handleEvent);

    const storage = this.storage as { cleanup?: () => void };
    storage.cleanup = () => {
      window.removeEventListener(SUBPAGE_CREATE_EVENT, handleEvent);
    };
  },

  onDestroy() {
    const storage = this.storage as { cleanup?: () => void };
    storage.cleanup?.();
  },
});

export default PageLinkCreator;
