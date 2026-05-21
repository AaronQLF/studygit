"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { Editor } from "@tiptap/react";
import { Highlighter, Type } from "lucide-react";

type ColorMode = "text" | "highlight";

type Swatch = {
  label: string;
  value: string; // CSS color string
};

// Curated palette tuned to read well on both light and dark page surfaces.
// `null`-valued swatch (handled separately below) clears the color.
const TEXT_COLORS: Swatch[] = [
  { label: "Slate", value: "#475569" },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Amber", value: "#d97706" },
  { label: "Green", value: "#16a34a" },
  { label: "Teal", value: "#0d9488" },
  { label: "Blue", value: "#2563eb" },
  { label: "Indigo", value: "#4f46e5" },
  { label: "Purple", value: "#9333ea" },
  { label: "Pink", value: "#db2777" },
];

// Highlight swatches are softer so dark text stays readable on top.
const HIGHLIGHT_COLORS: Swatch[] = [
  { label: "Yellow", value: "#fde68a" },
  { label: "Orange", value: "#fed7aa" },
  { label: "Red", value: "#fecaca" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Purple", value: "#ddd6fe" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Teal", value: "#99f6e4" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Stone", value: "#e7e5e4" },
];

export function ColorPickerButton({
  editor,
  mode,
}: {
  editor: Editor;
  mode: ColorMode;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const isText = mode === "text";
  const swatches = isText ? TEXT_COLORS : HIGHLIGHT_COLORS;
  const Icon = isText ? Type : Highlighter;
  const activeColor: string | null = isText
    ? (editor.getAttributes("textStyle").color as string | null) ?? null
    : (editor.getAttributes("highlight").color as string | null) ?? null;

  const isActive = isText
    ? !!activeColor
    : editor.isActive("highlight");

  useEffect(() => {
    if (!open) return;
    const handleDown = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const apply = (color: string) => {
    if (isText) {
      editor.chain().focus().setColor(color).run();
    } else {
      editor.chain().focus().setHighlight({ color }).run();
    }
    setOpen(false);
  };

  const clear = () => {
    if (isText) {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().unsetHighlight().run();
    }
    setOpen(false);
  };

  // The little bar under the icon shows whichever color is currently
  // applied at the caret, so the toolbar tells you what would happen if
  // you re-clicked the button without re-opening the popover.
  const indicatorColor = activeColor ?? (isActive && !isText ? "#fde68a" : undefined);

  return (
    <div ref={wrapperRef} className="pg-color-button-wrapper">
      <button
        type="button"
        title={
          isText
            ? "Text color"
            : "Highlight color"
        }
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "inline-flex h-7 w-7 flex-col items-center justify-center gap-[1px] rounded-md text-[var(--pg-muted)] transition-colors",
          isActive
            ? "bg-[var(--pg-bg-elevated)] text-[var(--pg-fg)]"
            : "hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
        )}
      >
        <Icon size={13} />
        <span
          className="pg-color-button-bar"
          style={{
            backgroundColor:
              indicatorColor ?? "var(--pg-border-strong)",
          }}
        />
      </button>
      {open ? (
        <div className="pg-color-popover" role="dialog">
          <div className="pg-color-popover-label">
            {isText ? "Text color" : "Highlight"}
          </div>
          <div className="pg-color-swatches">
            <button
              type="button"
              className="pg-color-swatch pg-color-swatch-clear"
              title="Default"
              onClick={clear}
              aria-label="Clear color"
            >
              <span aria-hidden>—</span>
            </button>
            {swatches.map((swatch) => {
              const selected = activeColor === swatch.value;
              return (
                <button
                  key={swatch.value}
                  type="button"
                  className={clsx(
                    "pg-color-swatch",
                    selected && "is-selected"
                  )}
                  onClick={() => apply(swatch.value)}
                  title={swatch.label}
                  aria-label={`${isText ? "Text" : "Highlight"} color ${swatch.label}`}
                >
                  <span
                    aria-hidden
                    className="pg-color-swatch-chip"
                    style={{ backgroundColor: swatch.value }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ColorPickerButton;
