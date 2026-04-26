"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ExternalLink, Link2 } from "lucide-react";
import { useStore } from "@/lib/store";
import type { CanvasNode, LinkNodeData } from "@/lib/types";

function normalizeUrl(url: string) {
  const value = url.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export function LinkPanelBody({ node }: { node: CanvasNode }) {
  const data = node.data as LinkNodeData;
  const updateNodeData = useStore((s) => s.updateNodeData);
  const [linkTitle, setLinkTitle] = useState(data.title);
  const [linkUrl, setLinkUrl] = useState(data.url);
  const [linkDescription, setLinkDescription] = useState(
    data.description ?? ""
  );
  const [linkEmbed, setLinkEmbed] = useState(data.embed ?? true);

  useEffect(() => {
    const timer = setTimeout(() => {
      updateNodeData(node.id, {
        title: linkTitle,
        url: linkUrl,
        description: linkDescription,
        embed: linkEmbed,
      } as Partial<LinkNodeData>);
    }, 220);
    return () => clearTimeout(timer);
  }, [
    linkDescription,
    linkEmbed,
    linkTitle,
    linkUrl,
    node.id,
    updateNodeData,
  ]);

  const resolvedLinkUrl = normalizeUrl(linkUrl);

  return (
    <section className="flex-1 overflow-y-auto">
      <div className="mx-auto h-full max-w-6xl px-6 py-6 flex flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2">
            <div className="mb-1 text-[11px] font-mono text-zinc-500 inline-flex items-center gap-1">
              <Link2 size={11} />
              title
            </div>
            <input
              className="w-full bg-transparent text-lg font-semibold text-zinc-100 outline-none"
              value={linkTitle}
              onChange={(event) => setLinkTitle(event.target.value)}
              placeholder="Website title"
            />
          </div>
          <div className="rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2">
            <div className="mb-1 text-[11px] font-mono text-zinc-500">url</div>
            <div className="flex items-center gap-2">
              <input
                className="w-full bg-transparent text-sm font-mono text-zinc-200 outline-none"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://example.com"
              />
              <a
                href={resolvedLinkUrl || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={clsx(
                  "rounded border px-2 py-1 text-[11px] font-mono",
                  resolvedLinkUrl
                    ? "border-[var(--pg-border-strong)] text-[var(--pg-accent)] hover:bg-zinc-800"
                    : "border-[var(--pg-border)] text-zinc-600 pointer-events-none"
                )}
              >
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
        <textarea
          className="w-full resize-none rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2 text-sm text-zinc-300 outline-none"
          rows={3}
          value={linkDescription}
          onChange={(event) => setLinkDescription(event.target.value)}
          placeholder="Notes about this site..."
        />
        <label className="inline-flex items-center gap-2 text-[11px] font-mono text-zinc-400">
          <input
            type="checkbox"
            checked={linkEmbed}
            onChange={(event) => setLinkEmbed(event.target.checked)}
          />
          embed website in node and focus view
        </label>
        <div className="flex-1 min-h-[340px] overflow-hidden rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-elevated)]">
          {linkEmbed && resolvedLinkUrl ? (
            <iframe
              title={linkTitle || "Embedded website"}
              src={resolvedLinkUrl}
              className="nowheel h-full w-full bg-white"
            />
          ) : (
            <div className="h-full flex items-center justify-center px-4 text-center text-[12px] text-zinc-500">
              {resolvedLinkUrl
                ? "Enable embed to browse this site directly."
                : "Paste a URL to embed and scroll it naturally."}
            </div>
          )}
        </div>
        <p className="text-[11px] font-mono text-zinc-500">
          Some websites block embedding for security (X-Frame-Options).
        </p>
      </div>
    </section>
  );
}
