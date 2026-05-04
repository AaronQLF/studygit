"use client";

import { useEffect, useState } from "react";
import type { NodeKind } from "@/lib/types";
import {
  FileSearch,
  FileText,
  Image as ImageIcon,
  Link2,
  NotebookPen,
  Shapes,
  StickyNote,
} from "lucide-react";

const ITEMS: {
  kind: NodeKind;
  label: string;
  keybind: string;
  icon: React.ComponentType<{ size?: number }>;
}[] = [
  { kind: "link", label: "Link", keybind: "L", icon: Link2 },
  { kind: "image", label: "Image", keybind: "I", icon: ImageIcon },
  { kind: "note", label: "Note", keybind: "N", icon: StickyNote },
  { kind: "page", label: "Page", keybind: "B", icon: NotebookPen },
  { kind: "document", label: "Document", keybind: "D", icon: FileText },
  { kind: "pdf", label: "PDF", keybind: "P", icon: FileSearch },
  { kind: "shape", label: "Shape", keybind: "S", icon: Shapes },
];

const TIP_KEY = "personalgit-dock-tip-dismissed";

export function AddDock({ onAdd }: { onAdd: (kind: NodeKind) => void }) {
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    try {
      setShowTip(!window.localStorage.getItem(TIP_KEY));
    } catch {
      setShowTip(false);
    }
  }, []);

  const dismissTip = () => {
    if (!showTip) return;
    setShowTip(false);
    try {
      window.localStorage.setItem(TIP_KEY, "1");
    } catch {
      // noop
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5">
      <div className="relative flex items-center gap-0.5 rounded-full border border-[var(--pg-border-strong)] bg-[var(--pg-bg-subtle)] px-1.5 py-1 shadow-[var(--pg-shadow)]">
        <div className="pointer-events-none absolute inset-x-2 top-0 h-px bg-white/45 dark:bg-white/10" />
        {ITEMS.map((item, index) => {
          const Icon = item.icon;
          const showDivider = index === 2;
          return (
            <div key={item.kind} className="flex items-center">
              {showDivider ? (
                <span className="mx-1.5 h-5 w-px bg-[var(--pg-border-strong)]" />
              ) : null}
              <button
                className="group inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
                onClick={() => {
                  dismissTip();
                  onAdd(item.kind);
                }}
                title={`Add ${item.label}  ·  ${item.keybind}`}
                aria-label={`Add ${item.label}`}
              >
                <Icon size={15} />
              </button>
            </div>
          );
        })}
      </div>
      {showTip ? (
        <span className="pg-serif text-[11px] italic tracking-wide text-[var(--pg-muted)]">
          press · to add
        </span>
      ) : null}
    </div>
  );
}
