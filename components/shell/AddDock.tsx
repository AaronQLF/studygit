"use client";

import { useEffect, useState } from "react";
import type { NodeKind } from "@/lib/types";
import {
  FileSearch,
  Layers,
  Link2,
  NotebookPen,
  Sparkles,
  StickyNote,
} from "lucide-react";

// The dock surfaces only the study-loop essentials, grouped capture →
// sources → study. The peripheral kinds (Image, Shape) stay one right-click
// or single keystroke (I / S) away via the canvas context menu and command
// palette — de-emphasized, not removed.
const ITEMS: {
  kind: NodeKind;
  label: string;
  keybind: string;
  icon: React.ComponentType<{ size?: number }>;
}[] = [
  { kind: "note", label: "Note", keybind: "N", icon: StickyNote },
  { kind: "page", label: "Page", keybind: "B", icon: NotebookPen },
  { kind: "link", label: "Link", keybind: "L", icon: Link2 },
  { kind: "pdf", label: "PDF", keybind: "P", icon: FileSearch },
  { kind: "ai", label: "Ask AI", keybind: "A", icon: Sparkles },
  { kind: "flashcards", label: "Flashcards", keybind: "F", icon: Layers },
];

// Render a thin divider *before* these item indices to set off the
// capture / sources / study groups.
const DIVIDER_BEFORE = new Set([2, 4]);

const TIP_KEY = "studygit-dock-tip-dismissed";

export function AddDock({ onAdd }: { onAdd: (kind: NodeKind) => void }) {
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    // Defer to a microtask so the setState doesn't fire synchronously
    // during the effect body — same pattern used elsewhere for the
    // "read from localStorage on mount" idiom.
    queueMicrotask(() => {
      try {
        setShowTip(!window.localStorage.getItem(TIP_KEY));
      } catch {
        setShowTip(false);
      }
    });
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
          const showDivider = DIVIDER_BEFORE.has(index);
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
        <span className="pg-section-label">
          press · to add
        </span>
      ) : null}
    </div>
  );
}
