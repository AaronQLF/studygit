"use client";

// Accent color controls used by ThemeSettingsDialog: a row of preset
// swatches and a freeform `#rrggbb` input. Both live here together
// because their styling is paired in the dialog (same row, same
// height) and they share no other consumers.

import clsx from "clsx";
import { useEffect, useState } from "react";

export function SwatchButton({
  hex,
  active,
  onPick,
}: {
  hex: string;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Use accent ${hex}`}
      title={hex}
      className={clsx(
        "h-7 w-7 rounded-full border transition-transform",
        active
          ? "border-[var(--pg-fg)] scale-110"
          : "border-[var(--pg-border-strong)] hover:scale-105"
      )}
      style={{ backgroundColor: hex }}
    />
  );
}

export function CustomAccentInput({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? "#8a2a17");

  // Keep the draft in sync if another path (e.g. preset reset) cleared
  // or replaced the accent — but only when the dialog is mounted.
  useEffect(() => {
    queueMicrotask(() => setDraft(value ?? "#8a2a17"));
  }, [value]);

  const handleChange = (next: string) => {
    setDraft(next);
    if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next);
  };

  return (
    <label
      className="inline-flex h-7 items-center gap-1.5 rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg)] px-2 text-[11px] text-[var(--pg-muted)] focus-within:border-[var(--pg-border-strong)]"
      title="Custom hex color"
    >
      <input
        type="color"
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
        aria-label="Pick custom accent color"
      />
      <input
        type="text"
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        spellCheck={false}
        className="w-[72px] bg-transparent font-mono text-[11px] tracking-tight text-[var(--pg-fg)] outline-none"
        placeholder="#a83257"
      />
    </label>
  );
}
