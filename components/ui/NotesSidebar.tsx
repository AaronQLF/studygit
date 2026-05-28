"use client";

// Reader-side notes aside used by the Link and PDF panels — same shell
// with a "Notes" header, close button, and an embedded RichTextEditor
// pre-wired to cite back into the current source node.

import { PanelRightClose, StickyNote } from "lucide-react";
import {
  RichTextEditor,
} from "@/components/editors/RichTextEditor";

export type NotesSidebarProps = {
  value: string;
  onChange: (html: string) => void;
  onClose: () => void;
  /** Placeholder shown when the editor is empty. */
  placeholder?: string;
  /** Citation context for the editor (drives the /cite picker). */
  citationContext: { sourceNodeId: string; workspaceId: string };
  /** Width of the aside; matches the highlight sidebar in both panels. */
  widthClass?: string;
};

export function NotesSidebar({
  value,
  onChange,
  onClose,
  placeholder = "Take notes here… press /cite to reference a highlight",
  citationContext,
  widthClass = "w-[360px]",
}: NotesSidebarProps) {
  return (
    <aside
      className={`flex ${widthClass} shrink-0 flex-col border-l border-[var(--pg-border)] bg-[var(--pg-bg)]`}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--pg-border)] px-3">
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--pg-muted)]">
          <StickyNote size={12} />
          Notes
        </div>
        <button
          type="button"
          title="Close notes"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
        >
          <PanelRightClose size={12} />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <RichTextEditor
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          citationContext={citationContext}
        />
      </div>
    </aside>
  );
}
