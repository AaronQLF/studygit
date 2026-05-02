"use client";

import type { NodeProps } from "@xyflow/react";
import { FileText, Pencil } from "lucide-react";
import { NodeShell } from "./NodeShell";
import { EditableTitle } from "./EditableTitle";
import { useStore } from "@/lib/store";
import type { PageNodeData } from "@/lib/types";

export function PageNode({ id, data }: NodeProps) {
  const d = data as unknown as PageNodeData;
  const updateNodeData = useStore((s) => s.updateNodeData);
  const openPanel = useStore((s) => s.openPanel);

  return (
    <NodeShell
      id={id}
      className="w-[440px]"
      accentColor="#b53b1e"
      WatermarkIcon={FileText}
      label="Page"
    >
      <div className="flex items-center justify-end px-3.5 pt-2.5 pb-1">
        <button
          className="nodrag flex items-center gap-1 text-[12px] px-2 py-1 rounded text-[var(--pg-muted)] hover:text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
          onClick={() => openPanel(id)}
        >
          <Pencil size={11} /> Open
        </button>
      </div>

      <div
        className="px-4 pt-1 pb-3 max-h-[420px] overflow-y-auto"
        onDoubleClick={() => openPanel(id)}
      >
        <EditableTitle
          value={d.title}
          onChange={(next) =>
            updateNodeData(id, { title: next } as Partial<PageNodeData>)
          }
          placeholder="Untitled page"
          className="mb-2 text-[18px] font-semibold leading-tight text-[var(--pg-fg)]"
        />
        {d.content ? (
          <div
            className="pg-prose pg-prose-preview text-[13px] text-[var(--pg-fg-soft)]"
            dangerouslySetInnerHTML={{ __html: d.content }}
          />
        ) : (
          <div className="text-[13px] italic text-[var(--pg-muted)]">
            Empty page. Open it and press <code>/</code> to start.
          </div>
        )}
      </div>
    </NodeShell>
  );
}
