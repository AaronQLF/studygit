"use client";

import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, Eye, Pencil } from "lucide-react";
import { NodeShell } from "./NodeShell";
import { useStore } from "@/lib/store";
import type { BlogNodeData } from "@/lib/types";

export function BlogNode({ id, data }: NodeProps) {
  const d = data as unknown as BlogNodeData;
  const updateNodeData = useStore((s) => s.updateNodeData);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [title, setTitle] = useState(d.title);
  const [markdown, setMarkdown] = useState(d.markdown);

  const save = () => {
    updateNodeData(id, { title, markdown } as Partial<BlogNodeData>);
    setMode("read");
  };

  return (
    <NodeShell id={id} className="w-[440px]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--pg-border)]">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
          <BookOpen size={11} /> blog
        </div>
        <div className="flex items-center gap-1">
          {mode === "read" ? (
            <button
              className="nodrag flex items-center gap-1 text-xs px-2 py-1 rounded font-mono text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
              onClick={() => setMode("edit")}
            >
              <Pencil size={11} /> Edit
            </button>
          ) : (
            <>
              <button
                className="nodrag flex items-center gap-1 text-xs px-2 py-1 rounded font-mono text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                onClick={() => {
                  setTitle(d.title);
                  setMarkdown(d.markdown);
                  setMode("read");
                }}
              >
                Cancel
              </button>
              <button
                className="nodrag flex items-center gap-1 text-xs px-2 py-1 rounded border border-[var(--pg-border-strong)] text-zinc-200 hover:bg-zinc-800 font-mono"
                onClick={save}
              >
                <Eye size={11} /> Save
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-4 max-h-[520px] overflow-y-auto">
        {mode === "edit" ? (
          <div className="flex flex-col gap-2">
            <input
              className="nodrag w-full text-lg font-semibold px-2 py-1.5 border border-[var(--pg-border-strong)] rounded outline-none bg-transparent text-zinc-100"
              placeholder="Blog title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="nodrag w-full text-sm font-mono px-2 py-2 border border-[var(--pg-border-strong)] rounded outline-none resize-y min-h-[300px] bg-transparent text-zinc-200"
              placeholder="Write in markdown..."
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
            />
          </div>
        ) : (
          <div>
            <h1 className="text-xl font-semibold text-zinc-100 mb-2 leading-tight">
              {d.title || "Untitled"}
            </h1>
            <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {d.markdown || "_Double-click to start writing..._"}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </NodeShell>
  );
}
