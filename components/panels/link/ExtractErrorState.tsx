"use client";

import { ExternalLink, RefreshCw } from "lucide-react";

export function ExtractErrorState({
  error,
  url,
  onRetry,
}: {
  error: string;
  url: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-8">
      <div className="max-w-md text-center">
        <div className="mb-1 text-sm font-semibold text-[var(--pg-fg)]">
          Couldn&rsquo;t load the article
        </div>
        <p className="mb-3 text-[12px] text-[var(--pg-fg-soft)]">{error}</p>
        <p className="mb-4 break-all text-[11px] text-[var(--pg-muted)]">{url}</p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--pg-accent)] px-3 py-1.5 text-[12px] text-white hover:opacity-90"
          >
            <RefreshCw size={11} />
            Try again
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pg-border-strong)] px-3 py-1.5 text-[12px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
          >
            <ExternalLink size={11} />
            Open original
          </a>
        </div>
      </div>
    </div>
  );
}
