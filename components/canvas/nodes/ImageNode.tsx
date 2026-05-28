"use client";

import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { ArrowUpRight, Image as ImageIcon } from "lucide-react";
import { NodeShell } from "./NodeShell";
import { useStore } from "@/lib/store";
import type { ImageNodeData } from "@/lib/types";

export function ImageNode({ id, data }: NodeProps) {
  const d = data as unknown as ImageNodeData;
  const updateNodeData = useStore((s) => s.updateNodeData);
  const openPanel = useStore((s) => s.openPanel);
  const [editing, setEditing] = useState(!d.url);
  const [url, setUrl] = useState(d.url);
  const [caption, setCaption] = useState(d.caption ?? "");

  const save = () => {
    updateNodeData(id, { url, caption } as Partial<ImageNodeData>);
    setEditing(false);
  };

  return (
    <NodeShell
      id={id}
      accentColor="#6d7f5a"
      WatermarkIcon={ImageIcon}
      label="Image"
      actions={
        !editing ? (
          <button
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            onClick={() => openPanel(id)}
            title="Open in panel"
          >
            Open <ArrowUpRight size={10} />
          </button>
        ) : null
      }
    >
      <div className="px-3 pb-3 pt-2.5 w-[280px]">
        {editing ? (
          <div className="flex flex-col gap-2">
            <input
              className="nodrag text-[12px] px-2 py-1.5 border border-[var(--pg-border-strong)] rounded-md bg-[var(--pg-bg)] text-[var(--pg-fg-soft)] outline-none focus:border-[var(--pg-accent)]"
              placeholder="Image URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <input
              className="nodrag text-[12px] px-2 py-1.5 border border-[var(--pg-border-strong)] rounded-md bg-[var(--pg-bg)] text-[var(--pg-fg-soft)] outline-none focus:border-[var(--pg-accent)]"
              placeholder="Caption (optional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            <div className="flex gap-1 justify-end">
              <button
                className="nodrag text-[12px] px-2 py-1 rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                className="nodrag text-[12px] px-2.5 py-1 rounded-md bg-[var(--pg-accent)] text-white hover:opacity-90"
                onClick={save}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={d.url}
              alt={d.caption ?? ""}
              className="w-full rounded-md bg-[var(--pg-bg-elevated)] object-cover border border-[var(--pg-border)]"
            />
            {d.caption && (
              <div className="text-[12px] text-[var(--pg-fg-soft)] leading-snug">
                {d.caption}
              </div>
            )}
          </div>
        )}
      </div>
    </NodeShell>
  );
}
