"use client";

// Two scoped keydown listeners attached to the window: a single-key
// add-node palette ("L" → link, "N" → note, …) and a strict
// Backspace/Delete guard that replaces React Flow's built-in handler.
// Both used to live inline in Canvas.tsx and accounted for ~100 lines
// of mostly defensive focus-checking.

import { useEffect } from "react";
import type { Node, NodeChange } from "@xyflow/react";
import type { NodeKind } from "@/lib/types";

const ADD_NODE_KEYS: Record<string, NodeKind> = {
  l: "link",
  i: "image",
  n: "note",
  b: "page",
  p: "pdf",
  s: "shape",
  a: "ai",
};

function isTypingInTarget(el: HTMLElement | null): boolean {
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable
  );
}

export type UseCanvasShortcutsOptions = {
  nodes: Node[];
  addNode: (kind: NodeKind) => void;
  onNodesChange: (changes: NodeChange[]) => void;
};

export function useCanvasShortcuts({
  nodes,
  addNode,
  onNodesChange,
}: UseCanvasShortcutsOptions) {
  // --- Single-key add palette ----------------------------------------
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingInTarget(target)) return;

      const kind = ADD_NODE_KEYS[event.key.toLowerCase()];
      if (!kind) return;
      event.preventDefault();
      addNode(kind);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [addNode]);

  // --- Scoped Backspace/Delete handler -------------------------------
  // Replaces React Flow's built-in delete-on-keypress (disabled via
  // `deleteKeyCode={null}` on <ReactFlow>). The rule is simple and
  // strict: if the keypress originated from inside a node's panel body
  // — i.e. anywhere below `.react-flow__node` except the node wrapper
  // element itself — we refuse to delete. That makes it impossible to
  // accidentally nuke a panel by pressing Backspace while typing in it,
  // closing a math/mermaid card, scrubbing a PDF viewer, etc. Deletion
  // via the node menu and canvas context menu is unaffected.
  //
  // Selection-then-Backspace still works: clicking a node's frame moves
  // focus to the `.react-flow__node` wrapper itself (target === node),
  // so the guard lets the keypress through and we dispatch a `remove`
  // change through the existing pipeline (which handles undo).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (isTypingInTarget(target)) return;

      const nodeEl = target.closest(".react-flow__node");
      if (nodeEl && target !== nodeEl) return;

      // Defensive: also check `document.activeElement`. Some panel
      // interactions (drag handles, native scrollbar interactions) leave
      // `event.target` on document.body while keeping the panel focused.
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        if (isTypingInTarget(active)) return;
        const activeNodeEl = active.closest(".react-flow__node");
        if (activeNodeEl && active !== activeNodeEl) return;
      }

      const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
      if (selectedIds.length === 0) return;

      event.preventDefault();
      onNodesChange(selectedIds.map((id) => ({ type: "remove", id })));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nodes, onNodesChange]);
}
