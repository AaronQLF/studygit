"use client";

import { Sun } from "lucide-react";

export type Theme = "light" | "dark" | "system";

export const STORAGE_KEY = "personalgit-theme";
const DEFAULT_THEME: Theme = "light";

export function readThemePreference(): Theme {
  return DEFAULT_THEME;
}

export function applyTheme(_theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark");
  root.classList.add("light");
}

export function writeThemePreference(_theme: Theme) {
  localStorage.setItem(STORAGE_KEY, DEFAULT_THEME);
  applyTheme(DEFAULT_THEME);
}

export function cycleTheme(_theme: Theme): Theme {
  return DEFAULT_THEME;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const onEnforceLight = () => {
    writeThemePreference(DEFAULT_THEME);
  };

  return (
    <button
      title="Theme locked to light"
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)] ${className}`}
      onClick={onEnforceLight}
    >
      <Sun size={14} />
    </button>
  );
}
