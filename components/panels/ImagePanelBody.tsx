"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import type { CanvasNode, ImageNodeData } from "@/lib/types";

export function ImagePanelBody({ node }: { node: CanvasNode }) {
  const data = node.data as ImageNodeData;
  const updateNodeData = useStore((s) => s.updateNodeData);
  const [imageUrl, setImageUrl] = useState(data.url);
  const [imageCaption, setImageCaption] = useState(data.caption ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      updateNodeData(node.id, {
        url: imageUrl,
        caption: imageCaption,
      } as Partial<ImageNodeData>);
    }, 220);
    return () => clearTimeout(timer);
  }, [imageCaption, imageUrl, node.id, updateNodeData]);

  return (
    <section className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6 flex flex-col gap-3">
        <div className="text-[11px] font-mono text-zinc-500 inline-flex items-center gap-1">
          <ImageIcon size={11} /> image
        </div>
        <input
          className="rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2 text-sm font-mono text-zinc-200 outline-none"
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
          placeholder="https://..."
        />
        <input
          className="rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2 text-sm text-zinc-300 outline-none"
          value={imageCaption}
          onChange={(event) => setImageCaption(event.target.value)}
          placeholder="Caption"
        />
        <div className="overflow-hidden rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-elevated)]">
          {imageUrl.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={imageCaption || "Image"}
              className="max-h-[70vh] w-full object-contain bg-black"
            />
          ) : (
            <div className="h-64 flex items-center justify-center text-[12px] text-zinc-500">
              Paste an image URL to preview.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
