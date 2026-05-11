"use client";

import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import {
  ArrowUpRight,
  ExternalLink,
  Highlighter,
  Link2,
} from "lucide-react";
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
  const openPanel = useStore((s) => s.openPanel);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(d.url);
  const [title, setTitle] = useState(d.title);
  const [description, setDescription] = useState(d.description ?? "");

  const save = () => {
    updateNodeData(id, { url, title, description } as Partial<LinkNodeData>);
    setEditing(false);
  };

  const resolvedUrl = normalizeUrl(d.url);
  let hostname = "";
  try {
    hostname = new URL(d.extractedFinalUrl ?? resolvedUrl).hostname.replace(
      /^www\./,
      ""
    );
  } catch {
    hostname = d.url;
  }

  const highlightCount = d.highlights?.length ?? 0;
  const displayTitle = d.title || d.extractedTitle || "";
  const subtitle = d.extractedSiteName ?? hostname;
  const excerpt = d.description?.trim() || d.extractedExcerpt?.trim() || "";

  return (
    <NodeShell
      id={id}
      accentColor="#2a4a6b"
      WatermarkIcon={Link2}
      label="Link"
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
      <div className="px-3 pb-3 pt-2.5 min-w-[240px]">
        {editing ? (
          <div className="flex flex-col gap-2">
            <input
              className="nodrag text-[13px] px-2 py-1.5 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] text-[var(--pg-fg)] outline-none focus:border-[var(--pg-accent)]"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              className="nodrag text-[12px] px-2 py-1.5 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] text-[var(--pg-fg-soft)] outline-none focus:border-[var(--pg-accent)]"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <textarea
              className="nodrag text-[12px] px-2 py-1.5 rounded-md border border-[var(--pg-border-strong)] resize-none bg-[var(--pg-bg)] text-[var(--pg-fg-soft)] outline-none focus:border-[var(--pg-accent)]"
              placeholder="Description (optional)"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
          <div className="flex flex-col gap-1">
            <EditableTitle
              value={displayTitle}
              onChange={(next) =>
                updateNodeData(id, { title: next } as Partial<LinkNodeData>)
              }
              placeholder="Untitled link"
              className="text-[13.5px] font-medium leading-snug text-[var(--pg-fg)]"
            />
            {excerpt ? (
              <div className="line-clamp-2 text-[12px] text-[var(--pg-fg-soft)] leading-snug">
                {excerpt}
              </div>
            ) : null}
            <div className="text-[11px] text-[var(--pg-muted)] truncate">
              {subtitle}
            </div>
            <div className="mt-0.5 flex items-center gap-3">
              {resolvedUrl ? (
                <a
                  href={resolvedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nodrag inline-flex items-center gap-1 text-[12px] text-[var(--pg-accent)] hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open original <ExternalLink size={10} />
                </a>
              ) : null}
              {highlightCount > 0 ? (
                <span
                  className="inline-flex items-center gap-1 text-[11px] text-[var(--pg-muted)]"
                  title={`${highlightCount} highlight${
                    highlightCount === 1 ? "" : "s"
                  }`}
                >
                  <Highlighter size={10} />
                  {highlightCount}
                </span>
              ) : null}
              {!d.extractedHtml && resolvedUrl ? (
                <span
                  className="text-[10px] uppercase tracking-wider text-[var(--pg-muted-soft)]"
                  title="Open the panel to load the reader view"
                >
                  Open to load
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </NodeShell>
  );
}
