"use client";

// Pre-extraction empty state for the link panel. Owns its own input
// state so the user can paste / type a URL without lifting it up to
// the panel body.

import { useState } from "react";
import { Link2 } from "lucide-react";

export function EmptyUrlState({
  onSubmit,
}: {
  onSubmit: (url: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-dashed border-[var(--pg-border-strong)] bg-[var(--pg-bg-subtle)] p-8 text-center">
        <Link2 size={28} className="mx-auto mb-2 text-[var(--pg-muted)]" />
        <div className="mb-1 text-sm font-semibold text-[var(--pg-fg)]">
          No URL yet
        </div>
        <div className="mb-4 text-[12px] text-[var(--pg-fg-soft)]">
          Paste a link to an article, blog post, or essay to load a clean
          reader view you can highlight and cite.
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const next = value.trim();
            if (next) onSubmit(next);
          }}
          className="flex items-center gap-2"
        >
          <input
            className="flex-1 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] px-2.5 py-1.5 text-[13px] text-[var(--pg-fg)] outline-none focus:border-[var(--pg-accent)]"
            placeholder="https://example.com/article"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-md bg-[var(--pg-accent)] px-3 py-1.5 text-[12px] text-white transition-opacity hover:opacity-90"
          >
            Load
          </button>
        </form>
      </div>
    </div>
  );
}
