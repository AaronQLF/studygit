"use client";

// One entry in the theme palette gallery. Always renders the *light*
// variant of the theme so the gallery stays consistent and legible
// even when the user is currently in dark mode — the applied palette
// still tracks the user's actual mode preference.

import clsx from "clsx";
import { Check } from "lucide-react";
import { THEMES, type ThemeId } from "@/lib/themes";

export function PresetCard({
  id,
  active,
  onPick,
}: {
  id: ThemeId;
  active: boolean;
  onPick: () => void;
}) {
  const def = THEMES[id];
  const palette = def.light;
  return (
    <button
      type="button"
      onClick={onPick}
      className={clsx(
        "group flex flex-col gap-2 rounded-[var(--pg-radius)] border p-2 text-left transition-colors",
        active
          ? "border-[var(--pg-accent)] bg-[var(--pg-accent-soft)]"
          : "border-[var(--pg-border)] bg-[var(--pg-bg)] hover:border-[var(--pg-border-strong)] hover:bg-[var(--pg-bg-elevated)]"
      )}
      aria-pressed={active}
    >
      <div
        className="relative h-14 w-full overflow-hidden rounded-[var(--pg-radius)] border border-[var(--pg-border)]"
        style={{ backgroundColor: palette["--pg-bg"] }}
      >
        {/* Three stacked bars approximating the preset's content layers
            so the gallery shows real contrast, not just one color. */}
        <div
          className="absolute left-2 top-2 h-1.5 w-9/12 rounded-[2px]"
          style={{ backgroundColor: palette["--pg-fg"] }}
        />
        <div
          className="absolute left-2 top-5 h-1 w-7/12 rounded-[2px]"
          style={{ backgroundColor: palette["--pg-fg-soft"] }}
        />
        <div
          className="absolute left-2 top-8 h-1 w-5/12 rounded-[2px]"
          style={{ backgroundColor: palette["--pg-muted"] }}
        />
        <div
          className="absolute right-2 bottom-2 h-3 w-3 rounded-full"
          style={{ backgroundColor: palette["--pg-accent"] }}
        />
        {active ? (
          <div className="absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--pg-accent)] text-white">
            <Check size={10} />
          </div>
        ) : null}
      </div>
      <div>
        <div className="text-[12.5px] font-medium leading-tight text-[var(--pg-fg)]">
          {def.name}
        </div>
        <div className="text-[11px] leading-snug text-[var(--pg-muted)]">
          {def.description}
        </div>
      </div>
    </button>
  );
}
