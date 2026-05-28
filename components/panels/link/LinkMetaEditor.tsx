"use client";

// Tiny inline title + URL editor shown above the article. Owns its own
// draft state so typing in the inputs doesn't trigger a store write per
// keystroke (commit happens on Save).

import { useState } from "react";
import type { LinkNodeData } from "@/lib/types";

export function LinkMetaEditor({
  data,
  onSave,
  onCancel,
}: {
  data: LinkNodeData;
  onSave: (patch: Partial<LinkNodeData>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(data.title ?? "");
  const [url, setUrl] = useState(data.url ?? "");
  return (
    <div className="grid gap-2 border-b border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2 md:grid-cols-[1fr_2fr_auto]">
      <input
        className="rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] px-2 py-1.5 text-[12px] text-[var(--pg-fg)] outline-none focus:border-[var(--pg-accent)]"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title"
      />
      <input
        className="rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] px-2 py-1.5 font-mono text-[12px] text-[var(--pg-fg)] outline-none focus:border-[var(--pg-accent)]"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://…"
      />
      <div className="flex justify-end gap-1">
        <button
          type="button"
          className="rounded-md px-2 py-1 text-[12px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="rounded-md bg-[var(--pg-accent)] px-2.5 py-1 text-[12px] text-white hover:opacity-90"
          onClick={() => onSave({ title, url })}
        >
          Save
        </button>
      </div>
    </div>
  );
}
