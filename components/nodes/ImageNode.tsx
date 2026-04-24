"use client";

import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { Image as ImageIcon } from "lucide-react";
import { NodeShell } from "./NodeShell";
import { useStore } from "@/lib/store";
import type { ImageNodeData } from "@/lib/types";

export function ImageNode({ id, data }: NodeProps) {
  const d = data as unknown as ImageNodeData;
  const updateNodeData = useStore((s) => s.updateNodeData);
  const [editing, setEditing] = useState(!d.url);
  const [url, setUrl] = useState(d.url);
  const [caption, setCaption] = useState(d.caption ?? "");

  const save = () => {
    updateNodeData(id, { url, caption } as Partial<ImageNodeData>);
    setEditing(false);
  };

  return (
    <NodeShell id={id}>
      <div className="p-3.5 w-[280px]">
        {editing ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-mono">
              <ImageIcon size={11} /> image
            </div>
            <input
              className="nodrag text-xs px-2 py-1 border border-[var(--pg-border-strong)] rounded bg-transparent text-zinc-200 outline-none font-mono"
              placeholder="Image URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <input
              className="nodrag text-xs px-2 py-1 border border-[var(--pg-border-strong)] rounded bg-transparent text-zinc-300 outline-none"
              placeholder="Caption (optional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            <div className="flex gap-1 justify-end">
              <button
                className="nodrag text-xs px-2 py-1 rounded font-mono hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                className="nodrag text-xs px-2 py-1 rounded font-mono border border-[var(--pg-border-strong)] hover:bg-zinc-800 text-zinc-200"
                onClick={save}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-mono">
              <ImageIcon size={11} /> image
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={d.url}
              alt={d.caption ?? ""}
              className="w-full rounded-md bg-[var(--pg-bg-elevated)] object-cover border border-[var(--pg-border)]"
            />
            {d.caption && (
              <div className="text-xs text-zinc-400 leading-snug">
                {d.caption}
              </div>
            )}
          </div>
        )}
      </div>
    </NodeShell>
  );
}
