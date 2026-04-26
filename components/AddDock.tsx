"use client";

import type { NodeKind } from "@/lib/types";
import {
  FileSearch,
  FileText,
  Image as ImageIcon,
  Link2,
  NotebookPen,
  StickyNote,
} from "lucide-react";

const ITEMS: {
  kind: NodeKind;
  label: string;
  keybind: string;
  icon: React.ComponentType<{ size?: number }>;
}[] = [
  { kind: "link", label: "link", keybind: "L", icon: Link2 },
  { kind: "image", label: "image", keybind: "I", icon: ImageIcon },
  { kind: "note", label: "note", keybind: "N", icon: StickyNote },
  { kind: "page", label: "page", keybind: "B", icon: NotebookPen },
  { kind: "document", label: "doc", keybind: "D", icon: FileText },
  { kind: "pdf", label: "pdf", keybind: "P", icon: FileSearch },
];

export function AddDock({ onAdd }: { onAdd: (kind: NodeKind) => void }) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
      <div className="flex items-center gap-1 rounded-lg border border-[var(--pg-border)] bg-[color-mix(in_srgb,var(--pg-bg-subtle)_86%,transparent)] px-1.5 py-1 shadow-[var(--pg-shadow)] backdrop-blur-xl">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.kind}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-mono text-zinc-400 hover:bg-[var(--pg-bg-elevated)] hover:text-zinc-100"
              onClick={() => onAdd(item.kind)}
              title={`Add ${item.label} (${item.keybind})`}
            >
              <Icon size={12} />
              {item.label}
              <span className="rounded border border-[var(--pg-border)] px-1 text-[10px] text-zinc-500">
                {item.keybind}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
