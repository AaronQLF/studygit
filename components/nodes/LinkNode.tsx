"use client";

import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { ExternalLink, Link2 } from "lucide-react";
import { NodeShell } from "./NodeShell";
import { EditableTitle } from "./EditableTitle";
import { useStore } from "@/lib/store";
import type { LinkNodeData } from "@/lib/types";

function normalizeUrl(url: string) {
  const value = url.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export function LinkNode({ id, data }: NodeProps) {
  const d = data as unknown as LinkNodeData;
  const updateNodeData = useStore((s) => s.updateNodeData);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(d.url);
  const [title, setTitle] = useState(d.title);
  const [description, setDescription] = useState(d.description ?? "");
  const [embed, setEmbed] = useState(d.embed ?? true);

  const save = () => {
    updateNodeData(id, { url, title, description, embed } as Partial<LinkNodeData>);
    setEditing(false);
  };

  const resolvedUrl = normalizeUrl(d.url);
  let hostname = "";
  try {
    hostname = new URL(resolvedUrl).hostname.replace(/^www\./, "");
  } catch {
    hostname = d.url;
  }

  return (
    <NodeShell id={id}>
      <div className="p-3.5 min-w-[230px]">
        {editing ? (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-mono text-zinc-500">link</div>
            <input
              className="nodrag text-sm px-2 py-1 rounded border border-[var(--pg-border-strong)] bg-transparent text-zinc-200 outline-none"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              className="nodrag text-xs px-2 py-1 rounded border border-[var(--pg-border-strong)] bg-transparent text-zinc-300 font-mono outline-none"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <textarea
              className="nodrag text-xs px-2 py-1 rounded border border-[var(--pg-border-strong)] resize-none bg-transparent text-zinc-300 outline-none"
              placeholder="Description (optional)"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <label className="nodrag inline-flex items-center gap-2 text-[11px] font-mono text-zinc-400">
              <input
                type="checkbox"
                checked={embed}
                onChange={(event) => setEmbed(event.target.checked)}
              />
              embed website
            </label>
            <div className="flex gap-1 justify-end">
              <button
                className="nodrag text-xs px-2 py-1 rounded font-mono text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
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
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
              <Link2 size={11} />
              link
            </div>
            <EditableTitle
              value={d.title}
              onChange={(next) =>
                updateNodeData(id, { title: next } as Partial<LinkNodeData>)
              }
              placeholder="Untitled link"
              className="text-sm font-medium leading-snug text-zinc-100"
            />
            {d.description && (
              <div className="text-xs text-zinc-400 leading-snug">
                {d.description}
              </div>
            )}
            <div className="text-[11px] font-mono text-zinc-500 truncate">{hostname}</div>
            <a
              href={resolvedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="nodrag mt-1 inline-flex items-center gap-1 text-xs text-[var(--pg-accent)] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Open <ExternalLink size={10} />
            </a>
            {(d.embed ?? true) && resolvedUrl ? (
              <div className="nodrag nowheel mt-2 h-36 overflow-hidden rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-elevated)]">
                <iframe
                  title={d.title || "Embedded website"}
                  src={resolvedUrl}
                  className="h-full w-full bg-white"
                  loading="lazy"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </NodeShell>
  );
}
