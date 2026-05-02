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
    <NodeShell
      id={id}
      className="w-[360px]"
      accentColor="#7a4a6b"
      WatermarkIcon={FileText}
      label="Document"
    >
      <div className="flex items-center justify-end px-3.5 pt-2.5 pb-1">
        <button
          className="nodrag text-[12px] px-2 py-1 rounded text-[var(--pg-muted)] hover:text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
          onClick={() => openPanel(id)}
        >
          Open
        </button>
      </div>
      <div className="px-4 pb-4 pt-1" onDoubleClick={() => openPanel(id)}>
        <EditableTitle
          value={d.title}
          onChange={(next) =>
            updateNodeData(id, { title: next } as Partial<DocumentNodeData>)
          }
          placeholder="Untitled document"
          className="mb-1.5 text-[14px] font-semibold leading-snug text-[var(--pg-fg)]"
        />
        <div className="text-[12.5px] text-[var(--pg-fg-soft)] leading-relaxed line-clamp-4 whitespace-pre-wrap">
          {preview || (
            <span className="italic text-[var(--pg-muted)]">
              Empty document. Focus to add content.
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-3 text-[11px] text-[var(--pg-muted)]">
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
