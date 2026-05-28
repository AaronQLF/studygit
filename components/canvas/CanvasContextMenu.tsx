"use client";

// Right-click "Add node here" popover. Position is page-relative
// (clientX/clientY) and `flowPos` carries the React Flow coordinates so
// the parent can drop the new node exactly under the cursor.

import type { NodeKind } from "@/lib/types";
import { CONTEXT_MENU_KINDS, KIND_ICONS, KIND_LABELS } from "./node-defaults";

export type CanvasContextMenuProps = {
  x: number;
  y: number;
  flowPos: { x: number; y: number };
  onAdd: (kind: NodeKind, flowPos: { x: number; y: number }) => void;
  onDismiss: () => void;
};

export function CanvasContextMenu({
  x,
  y,
  flowPos,
  onAdd,
  onDismiss,
}: CanvasContextMenuProps) {
  return (
    <div
      className="fixed z-50 bg-[var(--pg-bg)] border border-[var(--pg-border)] rounded-md shadow-[var(--pg-shadow)] p-1 min-w-[180px]"
      style={{ top: y, left: x }}
      onClick={onDismiss}
    >
      {CONTEXT_MENU_KINDS.map((kind) => {
        const Icon = KIND_ICONS[kind];
        return (
          <button
            key={kind}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-[13px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
            onClick={() => onAdd(kind, flowPos)}
          >
            <Icon size={14} />
            Add {KIND_LABELS[kind]}
          </button>
        );
      })}
    </div>
  );
}
