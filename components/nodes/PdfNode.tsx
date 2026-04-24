"use client";

import { useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { FileText, Highlighter, MessageSquare, Sparkles, Upload } from "lucide-react";
import { NodeShell } from "./NodeShell";
import { useStore } from "@/lib/store";
import type { PdfNodeData } from "@/lib/types";

export function PdfNode({ id, data }: NodeProps) {
  const d = data as unknown as PdfNodeData;
  const focusNode = useStore((s) => s.focusNode);
  const updateNodeData = useStore((s) => s.updateNodeData);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commentCount = d.highlights.reduce(
    (sum, h) => sum + h.comments.length,
    0
  );
  const aiMessageCount = d.highlights.reduce(
    (sum, h) => sum + h.aiThread.length,
    0
  );

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `upload failed (${res.status})`);
      }
      const json = (await res.json()) as { url: string; name: string };
      updateNodeData(id, {
        src: json.url,
        fileName: json.name,
        title: d.title || json.name.replace(/\.pdf$/i, ""),
      } as Partial<PdfNodeData>);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <NodeShell id={id} className="w-[320px]">
      <div className="flex items-center justify-between border-b border-[var(--pg-border)] px-4 py-2">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
          <FileText size={11} /> pdf
        </div>
        <button
          className="nodrag rounded border border-[var(--pg-border-strong)] px-2 py-1 text-xs font-mono text-zinc-200 hover:bg-zinc-800"
          onClick={() => focusNode(id)}
        >
          focus
        </button>
      </div>
      <div className="p-4" onDoubleClick={() => focusNode(id)}>
        <div className="mb-2 truncate text-base font-semibold leading-snug text-zinc-100">
          {d.title || d.fileName || "Untitled PDF"}
        </div>
        {d.src ? (
          <div className="truncate text-[11px] font-mono text-zinc-500">
            {d.fileName ?? d.src}
          </div>
        ) : (
          <div className="nodrag">
            <div className="mb-2 text-[11px] text-zinc-400">
              Drop a PDF or click below to upload.
            </div>
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-bg-elevated)] px-2.5 py-1.5 text-[11px] font-mono text-zinc-200 hover:bg-zinc-800"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              disabled={uploading}
            >
              <Upload size={11} /> {uploading ? "uploading…" : "upload pdf"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload(file);
                event.target.value = "";
              }}
            />
            {error ? (
              <div className="mt-2 text-[11px] text-red-400">{error}</div>
            ) : null}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-mono text-zinc-500">
          {typeof d.pageCount === "number" ? (
            <div className="inline-flex items-center gap-1">
              <FileText size={11} /> {d.pageCount} page{d.pageCount === 1 ? "" : "s"}
            </div>
          ) : null}
          <div className="inline-flex items-center gap-1">
            <Highlighter size={11} /> {d.highlights.length}
          </div>
          <div className="inline-flex items-center gap-1">
            <MessageSquare size={11} /> {commentCount}
          </div>
          <div className="inline-flex items-center gap-1">
            <Sparkles size={11} /> {aiMessageCount}
          </div>
        </div>
      </div>
    </NodeShell>
  );
}
