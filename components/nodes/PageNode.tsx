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
    <NodeShell id={id} className="w-[440px]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--pg-border)]">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
          <FileText size={11} /> page
        </div>
        <button
          className="nodrag flex items-center gap-1 text-xs px-2 py-1 rounded font-mono text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
          onClick={() => openPanel(id)}
        >
          <Pencil size={11} /> Open
        </button>
      </div>

      <div
        className="px-4 py-3 max-h-[420px] overflow-y-auto"
        onDoubleClick={() => openPanel(id)}
      >
        <EditableTitle
          value={d.title}
          onChange={(next) =>
            updateNodeData(id, { title: next } as Partial<PageNodeData>)
          }
          placeholder="Untitled page"
          className="mb-2 text-xl font-semibold leading-tight text-zinc-100"
        />
        {d.content ? (
          <div
            className="pg-prose pg-prose-preview text-[13px] text-zinc-300"
            dangerouslySetInnerHTML={{ __html: d.content }}
          />
        ) : (
          <div className="text-[13px] italic text-zinc-500">
            Empty page. Open it and press <code>/</code> to start.
          </div>
        )}
      </div>
    </NodeShell>
  );
}
