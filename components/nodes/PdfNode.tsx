"use client";

import { type DragEvent, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import clsx from "clsx";
import { FileText, Highlighter, MessageSquare, Sparkles, Upload } from "lucide-react";
import { NodeShell } from "./NodeShell";
import { PdfThumbnail } from "./PdfThumbnail";
import { EditableTitle } from "./EditableTitle";
import { useStore } from "@/lib/store";
import type { PdfNodeData } from "@/lib/types";

export function PdfNode({ id, data }: NodeProps) {
  const d = data as unknown as PdfNodeData;
  const openPanel = useStore((s) => s.openPanel);
  const updateNodeData = useStore((s) => s.updateNodeData);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);

  const commentCount = d.highlights.reduce(
    (sum, h) => sum + h.comments.length,
    0
  );
  const aiMessageCount = d.highlights.reduce(
    (sum, h) => sum + h.aiThread.length,
    0
  );

  const handlePickedFile = (file: File | null | undefined) => {
    if (!file) return;
    upload(file);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const looksLikePdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!looksLikePdf) {
      setError("Please drop a PDF file.");
      return;
    }
    upload(file);
  };

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
    <NodeShell
      id={id}
      className="w-[320px]"
      accentColor="#a87234"
      WatermarkIcon={FileText}
      label="PDF"
    >
      <div className="px-3.5 pt-2 pb-3.5 space-y-2.5" onDoubleClick={() => openPanel(id)}>
        <div className="flex items-center justify-end">
          <button
            className="nodrag rounded-md px-2 py-1 text-[12px] text-[var(--pg-muted)] hover:text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
            onClick={() => openPanel(id)}
          >
            Open
          </button>
        </div>
        <EditableTitle
          value={d.title || d.fileName || ""}
          onChange={(next) =>
            updateNodeData(id, { title: next } as Partial<PdfNodeData>)
          }
          placeholder="Untitled PDF"
          className="text-[14px] font-semibold leading-snug text-[var(--pg-fg)]"
        />
        <div
          className={clsx(
            "nodrag overflow-hidden rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] transition-colors",
            isDragOver && "border-[var(--pg-accent)] bg-[var(--pg-accent-soft)]"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="aspect-[4/3] w-full">
            {d.src ? (
              <PdfThumbnail
                key={`${d.src}-${previewAttempt}`}
                src={d.src}
                width={288}
                className="h-full w-full object-cover"
                onRetry={() => setPreviewAttempt((value) => value + 1)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                <FileText size={18} className="text-[var(--pg-muted)]" />
                <p className="text-[11px] text-[var(--pg-fg-soft)]">
                  Drop a PDF here or upload one to generate a cover preview.
                </p>
                <button
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] px-2.5 py-1.5 text-[12px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
                  onClick={(event) => {
                    event.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  disabled={uploading}
                >
                  <Upload size={12} /> {uploading ? "Uploading..." : "Upload PDF"}
                </button>
              </div>
            )}
          </div>
        </div>
        {d.src ? (
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-[11px] text-[var(--pg-muted)]">
              {d.fileName ?? d.src}
            </div>
            <button
              className="nodrag rounded-md px-1.5 py-0.5 text-[10px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              onClick={(event) => {
                event.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              Replace
            </button>
          </div>
        ) : null}
        {error ? (
          <div className="text-[11px] text-red-500">{error}</div>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--pg-muted)]">
          {typeof d.pageCount === "number" ? (
            <div className="inline-flex items-center gap-1 rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2 py-0.5">
              <FileText size={11} /> {d.pageCount} page{d.pageCount === 1 ? "" : "s"}
            </div>
          ) : null}
          <div className="inline-flex items-center gap-1 rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2 py-0.5">
            <Highlighter size={11} /> {d.highlights.length}
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2 py-0.5">
            <MessageSquare size={11} /> {commentCount}
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2 py-0.5">
            <Sparkles size={11} /> {aiMessageCount}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => {
            handlePickedFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
    </NodeShell>
  );
}
