"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark" | "system";

export const STORAGE_KEY = "personalgit-theme";
const DEFAULT_THEME: Theme = "system";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function readThemePreference(): Theme {
  if (typeof document !== "undefined") {
    const fromAttr = document.documentElement.dataset.themePref;
    if (isTheme(fromAttr)) return fromAttr;
  }
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) return stored;
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = resolveTheme(theme);
  root.classList.remove("light");
  root.classList.remove("dark");
  root.classList.add(resolved);
  root.dataset.themePref = theme;
  root.style.colorScheme = resolved;
}

export function writeThemePreference(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  applyTheme(theme);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("personalgit:themechange"));
  }
}

export function cycleTheme(theme: Theme): Theme {
  if (theme === "light") return "dark";
  if (theme === "dark") return "system";
  return "light";
}

const LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const ICONS: Record<Theme, React.ComponentType<{ size?: number }>> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readThemePreference());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = () => setTheme(readThemePreference());
    window.addEventListener("personalgit:themechange", onChange);
    return () =>
      window.removeEventListener("personalgit:themechange", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onPrefChange = () => applyTheme("system");
    mq.addEventListener?.("change", onPrefChange);
    return () => mq.removeEventListener?.("change", onPrefChange);
  }, [theme]);

  const Icon = ICONS[theme];
  const next = cycleTheme(theme);

  return (
    <button
      type="button"
      title={
        mounted
          ? `Theme: ${LABELS[theme]} (click for ${LABELS[next]})`
          : "Toggle theme"
      }
      aria-label={`Theme: ${LABELS[theme]}. Click to switch to ${LABELS[next]}.`}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)] ${className}`}
      onClick={() => {
        const nextTheme = cycleTheme(theme);
        setTheme(nextTheme);
        writeThemePreference(nextTheme);
      }}
      suppressHydrationWarning
    >
      <Icon size={14} />
    </button>
  );
}
