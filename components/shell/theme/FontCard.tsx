"use client";

// One entry in the Typeface picker. Renders a big "Ag" plus the font's
// name in that font's own face, so the gallery previews each option the
// way a type specimen would. Selecting it swaps `--font-serif` app-wide
// (see lib/fonts.ts).

import clsx from "clsx";
import { Check } from "lucide-react";
import { FONTS, type FontId } from "@/lib/fonts";

export function FontCard({
  id,
  active,
  onPick,
}: {
  id: FontId;
  active: boolean;
  onPick: () => void;
}) {
  const def = FONTS[id];
  return (
    <button
      type="button"
      onClick={onPick}
      className={clsx(
        "group relative flex flex-col gap-1.5 rounded-[var(--pg-radius)] border p-2.5 text-left transition-colors",
        active
          ? "border-[var(--pg-accent)] bg-[var(--pg-accent-soft)]"
          : "border-[var(--pg-border)] bg-[var(--pg-bg)] hover:border-[var(--pg-border-strong)] hover:bg-[var(--pg-bg-elevated)]"
      )}
      aria-pressed={active}
    >
      {active ? (
        <div className="absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--pg-accent)] text-white">
          <Check size={10} />
        </div>
      ) : null}
      <span
        className="text-[26px] leading-none text-[var(--pg-fg)]"
        style={{ fontFamily: def.stack }}
        aria-hidden
      >
        Ag
      </span>
      <div>
        <div
          className="text-[13px] font-medium leading-tight text-[var(--pg-fg)]"
          style={{ fontFamily: def.stack }}
        >
          {def.name}
        </div>
        <div className="mt-0.5 text-[11px] leading-snug text-[var(--pg-muted)]">
          {def.description}
        </div>
      </div>
    </button>
  );
}
