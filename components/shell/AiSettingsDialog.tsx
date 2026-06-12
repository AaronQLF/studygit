"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import {
  DEFAULT_AI_SETTINGS,
  readAiSettings,
  testAiConnection,
  writeAiSettings,
  type AiSettings,
} from "@/lib/ai-settings";

// Re-export the storage-side event identifier so existing call sites
// (UserMenu, AppShell) can import dialog-related symbols from one place,
// the same way ThemeSettingsDialog co-locates THEME_DIALOG_EVENT with its
// dialog component.
export { AI_SETTINGS_DIALOG_EVENT } from "@/lib/ai-settings";

type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; modelCount: number }
  | { kind: "error"; message: string };

// Quick presets to nudge users toward the most common OpenAI-compatible
// endpoints. Selecting one just fills the base-URL input — the user still
// supplies their own key + model.
const PRESETS: Array<{ id: string; label: string; baseUrl: string; hint?: string }> = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    hint: "Run `ollama serve` and pull a model first.",
  },
  {
    id: "together",
    label: "Together",
    baseUrl: "https://api.together.xyz/v1",
  },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
  },
];

export function AiSettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setSettings(readAiSettings());
      setShowKey(false);
      setTest({ kind: "idle" });
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

  const update = (patch: Partial<AiSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      // Persist every keystroke. Same pattern as ThemeSettingsDialog —
      // the user expects "I closed the dialog and my settings stuck."
      writeAiSettings(patch);
      return next;
    });
    setTest({ kind: "idle" });
  };

  const reset = () => {
    setSettings(DEFAULT_AI_SETTINGS);
    writeAiSettings(DEFAULT_AI_SETTINGS);
    setTest({ kind: "idle" });
  };

  const runTest = async () => {
    setTest({ kind: "running" });
    const result = await testAiConnection(settings);
    if (result.ok) {
      setTest({ kind: "ok", modelCount: result.modelCount });
    } else {
      setTest({ kind: "error", message: result.message });
    }
  };

  if (!open) return null;

  return (
    <div
      className="pg-anim-fade fixed inset-0 z-[70] bg-[rgba(15,15,20,0.32)] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="mx-auto mt-[8vh] w-[min(560px,92vw)] rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg)] shadow-[var(--pg-shadow-lg)] overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="AI provider settings"
      >
        <header className="flex items-center justify-between border-b border-[var(--pg-border)] px-4 py-3">
          <div className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--pg-fg)]">
            <Sparkles size={14} className="text-[var(--pg-accent)]" />
            AI provider
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-7 items-center gap-1.5 rounded-[var(--pg-radius)] px-2 text-[11.5px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              title="Reset to OpenAI defaults"
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
          <p className="mb-4 text-[12px] leading-relaxed text-[var(--pg-muted)]">
            Studygit talks to any{" "}
            <span className="text-[var(--pg-fg-soft)]">OpenAI-compatible</span>{" "}
            endpoint. Your key is stored locally in this browser and is sent
            with each request but never persisted on the Studygit server.
          </p>

          <Section label="Provider">
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESETS.map((preset) => {
                const active =
                  settings.baseUrl.replace(/\/+$/, "") ===
                  preset.baseUrl.replace(/\/+$/, "");
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => update({ baseUrl: preset.baseUrl })}
                    className={clsx(
                      "inline-flex h-7 items-center rounded-[var(--pg-radius)] border px-2.5 text-[11.5px] transition-colors",
                      active
                        ? "border-[var(--pg-accent)] bg-[var(--pg-accent-soft)] text-[var(--pg-fg)]"
                        : "border-[var(--pg-border)] bg-[var(--pg-bg)] text-[var(--pg-muted)] hover:border-[var(--pg-border-strong)] hover:text-[var(--pg-fg)]"
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section
            label="Base URL"
            hint="Must include /v1 (or equivalent) suffix."
          >
            <input
              type="url"
              spellCheck={false}
              value={settings.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--pg-fg)] outline-none focus:border-[var(--pg-border-strong)]"
            />
          </Section>

          <Section label="API key">
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                spellCheck={false}
                autoComplete="off"
                value={settings.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })}
                placeholder="sk-…"
                className="w-full rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2.5 py-1.5 pr-8 font-mono text-[12px] text-[var(--pg-fg)] outline-none focus:border-[var(--pg-border-strong)]"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-[var(--pg-radius)] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
                title={showKey ? "Hide" : "Show"}
              >
                {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          </Section>

          <Section label="Model">
            <input
              type="text"
              spellCheck={false}
              value={settings.model}
              onChange={(e) => update({ model: e.target.value })}
              placeholder="gpt-4o-mini"
              className="w-full rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--pg-fg)] outline-none focus:border-[var(--pg-border-strong)]"
            />
          </Section>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={runTest}
              disabled={test.kind === "running"}
              className={clsx(
                "inline-flex h-7 items-center gap-1.5 rounded-[var(--pg-radius)] border px-2.5 text-[12px] transition-colors",
                test.kind === "running"
                  ? "border-[var(--pg-border)] bg-[var(--pg-bg)] text-[var(--pg-muted)]"
                  : "border-[var(--pg-border)] bg-[var(--pg-bg)] text-[var(--pg-fg)] hover:border-[var(--pg-border-strong)] hover:bg-[var(--pg-bg-elevated)]"
              )}
            >
              {test.kind === "running" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              Test connection
            </button>
            <TestResult state={test} />
          </div>
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
    <section className="mb-4 last:mb-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="pg-section-label">{label}</span>
        {hint ? (
          <span className="text-[11px] text-[var(--pg-muted)]">{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function TestResult({ state }: { state: TestState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "running") {
    return (
      <span className="text-[11.5px] text-[var(--pg-muted)]">Probing…</span>
    );
  }
  if (state.kind === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--pg-fg-soft)]">
        <Check size={11} className="text-emerald-500" />
        Connected
        {state.modelCount > 0 ? ` · ${state.modelCount} models` : ""}
      </span>
    );
  }
  return (
    <span className="text-[11.5px] text-red-500" title={state.message}>
      {state.message.length > 80 ? `${state.message.slice(0, 80)}…` : state.message}
    </span>
  );
}
