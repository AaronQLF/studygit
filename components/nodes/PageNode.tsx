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
      actions={
        <button
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          onClick={() => openPanel(id)}
          title="Open page"
        >
          <Pencil size={10} /> Open
        </button>
      }
    >
      <div
        className="px-4 pt-2.5 pb-3.5 max-h-[420px] overflow-y-auto"
        onDoubleClick={() => openPanel(id)}
      >
        <EditableTitle
          value={d.title}
          onChange={(next) =>
            updateNodeData(id, { title: next } as Partial<PageNodeData>)
          }
          placeholder="Untitled page"
          className="pg-serif mb-2 text-[20px] font-semibold leading-tight tracking-[-0.005em] text-[var(--pg-fg)]"
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
