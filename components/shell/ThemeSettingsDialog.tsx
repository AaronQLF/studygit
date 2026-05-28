"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Monitor, Moon, Palette, RotateCcw, Sun, X } from "lucide-react";
import {
  applyThemePreset,
  DEFAULT_THEME_ID,
  readAccentOverride,
  readThemePresetId,
  THEME_CHANGE_EVENT,
  THEME_ORDER,
  writeAccentOverride,
  writeThemePreset,
  type ThemeId,
} from "@/lib/themes";
import {
  DEFAULT_GRID,
  GRID_DENSITY_LABELS,
  GRID_STYLE_LABELS,
  readGridPrefs,
  writeGridPrefs,
  type GridDensity,
  type GridPrefs,
  type GridStyle,
} from "@/lib/canvas-grid";
import {
  readThemePreference,
  writeThemePreference,
  type Theme as ThemeMode,
} from "@/components/ui/ThemeToggle";
import { PresetCard } from "./theme/PresetCard";
import { GridStyleCard } from "./theme/GridStyleCard";
import {
  CustomAccentInput,
  SwatchButton,
} from "./theme/AccentControls";

export const THEME_DIALOG_EVENT = "studygit:open-theme-settings";

// Suggested accent palette shown above the freeform color input. These
// are picked to feel distinct against any preset background.
const ACCENT_PALETTE: string[] = [
  "#8a2a17",
  "#b53b1e",
  "#1f4e79",
  "#2f5d2a",
  "#8b4513",
  "#5a2a6b",
  "#a83257",
  "#0a0a0a",
];

const MODE_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

export function ThemeSettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [presetId, setPresetId] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [accent, setAccent] = useState<string | null>(null);
  const [grid, setGrid] = useState<GridPrefs>(DEFAULT_GRID);

  // Hydrate from localStorage when the dialog opens (and refresh if it
  // gets re-opened after the user changed mode via the header toggle).
  // Defer the state updates to a microtask so we don't fire setState
  // synchronously inside the effect body.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setMode(readThemePreference());
      setPresetId(readThemePresetId());
      setAccent(readAccentOverride());
      setGrid(readGridPrefs());
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pickMode = (next: ThemeMode) => {
    setMode(next);
    writeThemePreference(next);
  };

  const pickPreset = (id: ThemeId) => {
    setPresetId(id);
    applyThemePreset(id, accent);
    writeThemePreset(id);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
    }
  };

  const pickAccent = (hex: string | null) => {
    const normalized = hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : null;
    setAccent(normalized);
    applyThemePreset(presetId, normalized);
    writeAccentOverride(normalized);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
    }
  };

  const pickGridStyle = (style: GridStyle) => {
    const next: GridPrefs = { ...grid, style };
    setGrid(next);
    writeGridPrefs(next);
  };

  const pickGridDensity = (density: GridDensity) => {
    const next: GridPrefs = { ...grid, density };
    setGrid(next);
    writeGridPrefs(next);
  };

  const reset = () => {
    pickPreset(DEFAULT_THEME_ID);
    pickAccent(null);
    setGrid(DEFAULT_GRID);
    writeGridPrefs(DEFAULT_GRID);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-[rgba(15,15,20,0.32)] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="mx-auto mt-[8vh] w-[min(640px,92vw)] rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg)] shadow-[var(--pg-shadow-lg)] overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Theme settings"
      >
        <header className="flex items-center justify-between border-b border-[var(--pg-border)] px-4 py-3">
          <div className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--pg-fg)]">
            <Palette size={14} className="text-[var(--pg-accent)]" />
            Theme
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-7 items-center gap-1.5 rounded-[var(--pg-radius)] px-2 text-[11.5px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              title="Reset to default"
            >
              <RotateCcw size={11} />
              Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--pg-radius)] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        <div className="max-h-[72vh] overflow-y-auto px-4 py-4">
          <Section label="Appearance">
            <div className="inline-flex rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-0.5">
              {MODE_OPTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => pickMode(id)}
                  className={clsx(
                    "inline-flex h-7 items-center gap-1.5 rounded-[var(--pg-radius)] px-2.5 text-[12px] transition-colors",
                    mode === id
                      ? "bg-[var(--pg-bg)] text-[var(--pg-fg)] shadow-[var(--pg-shadow-sm)]"
                      : "text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
                  )}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
          </Section>

          <Section label="Preset">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {THEME_ORDER.map((id) => (
                <PresetCard
                  key={id}
                  id={id}
                  active={id === presetId}
                  onPick={() => pickPreset(id)}
                />
              ))}
            </div>
          </Section>

          <Section
            label="Accent color"
            hint="Overrides the preset accent across the app."
          >
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_PALETTE.map((hex) => (
                <SwatchButton
                  key={hex}
                  hex={hex}
                  active={accent?.toLowerCase() === hex.toLowerCase()}
                  onPick={() => pickAccent(hex)}
                />
              ))}
              <CustomAccentInput value={accent} onChange={pickAccent} />
              {accent ? (
                <button
                  type="button"
                  onClick={() => pickAccent(null)}
                  className="ml-1 inline-flex h-7 items-center rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg)] px-2 text-[11px] text-[var(--pg-muted)] hover:border-[var(--pg-border-strong)] hover:text-[var(--pg-fg)]"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </Section>

          <Section
            label="Canvas grid"
            hint="Pattern drawn behind the canvas nodes."
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(GRID_STYLE_LABELS) as GridStyle[]).map((style) => (
                <GridStyleCard
                  key={style}
                  style={style}
                  active={style === grid.style}
                  onPick={() => pickGridStyle(style)}
                />
              ))}
            </div>
            <div className="mt-3 inline-flex rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-0.5">
              {(Object.keys(GRID_DENSITY_LABELS) as GridDensity[]).map(
                (density) => (
                  <button
                    key={density}
                    type="button"
                    onClick={() => pickGridDensity(density)}
                    disabled={grid.style === "none"}
                    className={clsx(
                      "inline-flex h-7 items-center rounded-[var(--pg-radius)] px-2.5 text-[12px] transition-colors",
                      grid.style === "none" && "opacity-50 cursor-not-allowed",
                      grid.density === density
                        ? "bg-[var(--pg-bg)] text-[var(--pg-fg)] shadow-[var(--pg-shadow-sm)]"
                        : "text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
                    )}
                    title={
                      grid.style === "none"
                        ? "Density has no effect when the grid is hidden"
                        : undefined
                    }
                  >
                    {GRID_DENSITY_LABELS[density]}
                  </button>
                )
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 last:mb-1">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="pg-section-label">{label}</span>
        {hint ? (
          <span className="text-[11px] text-[var(--pg-muted)]">{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}
