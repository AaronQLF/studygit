"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";

export type Theme = "light" | "dark" | "system";

export const STORAGE_KEY = "personalgit-theme";
const DEFAULT_THEME: Theme = "dark";

export function readThemePreference(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? DEFAULT_THEME;
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
}

export function writeThemePreference(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

export function cycleTheme(theme: Theme): Theme {
  if (theme === "system") return "light";
  if (theme === "light") return "dark";
  return "system";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = readThemePreference();
    setTheme(saved);
    applyTheme(saved);
    setReady(true);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const current = readThemePreference();
      if (current === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const onToggle = () => {
    const next = cycleTheme(theme);
    setTheme(next);
    writeThemePreference(next);
  };

  if (!ready) {
    return <div className={`h-7 w-7 ${className}`} aria-hidden />;
  }

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : SunMoon;
  const title =
    theme === "dark"
      ? "Theme: dark (click to cycle)"
      : theme === "light"
      ? "Theme: light (click to cycle)"
      : "Theme: system (click to cycle)";

  return (
    <button
      title={title}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800/80 bg-zinc-950/60 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 ${className}`}
      onClick={onToggle}
    >
      <Icon size={14} />
    </button>
  );
}
