"use client";

import type { NodeProps } from "@xyflow/react";
import { FileText, Highlighter, MessageSquare } from "lucide-react";
import { NodeShell } from "./NodeShell";
import { EditableTitle } from "./EditableTitle";
import { useStore } from "@/lib/store";
import type { DocumentNodeData } from "@/lib/types";

export function DocumentNode({ id, data }: NodeProps) {
  const d = data as unknown as DocumentNodeData;
  const openPanel = useStore((s) => s.openPanel);
  const updateNodeData = useStore((s) => s.updateNodeData);

  const preview =
    d.content.length > 200 ? d.content.slice(0, 200) + "..." : d.content;

  const commentCount = d.highlights.reduce(
    (sum, h) => sum + h.comments.length,
    0
  );

  return (
    <NodeShell id={id} className="w-[360px]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--pg-border)]">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
          <FileText size={11} /> doc
        </div>
        <button
          className="nodrag text-xs px-2 py-1 rounded border border-[var(--pg-border-strong)] text-zinc-200 hover:bg-zinc-800 font-mono"
          onClick={() => openPanel(id)}
        >
          open
        </button>
      </div>
      <div className="p-4" onDoubleClick={() => openPanel(id)}>
        <EditableTitle
          value={d.title}
          onChange={(next) =>
            updateNodeData(id, { title: next } as Partial<DocumentNodeData>)
          }
          placeholder="Untitled document"
          className="mb-1.5 text-base font-semibold leading-snug text-zinc-100"
        />
        <div className="text-xs text-zinc-400 leading-relaxed line-clamp-4 whitespace-pre-wrap">
          {preview || (
            <span className="italic text-zinc-500">
              Empty document. Focus to add content.
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-3 text-[11px] text-zinc-500 font-mono">
          <div className="flex items-center gap-1">
            <Highlighter size={11} />
            {d.highlights.length} highlight{d.highlights.length !== 1 && "s"}
          </div>
          <div className="flex items-center gap-1">
            <MessageSquare size={11} />
            {commentCount} comment{commentCount !== 1 && "s"}
          </div>
        </div>
      </div>
    </NodeShell>
  );
}
