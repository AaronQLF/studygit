"use client";

// User-supplied AI provider configuration. Stored per-device in
// localStorage rather than in the synced app state because the API key is a
// secret and should not round-trip through Supabase / data/state.json.
//
// Any OpenAI-compatible endpoint works: OpenAI, Together, Groq, OpenRouter,
// Ollama (via its /v1 compatibility layer), LM Studio, vLLM, etc. The user
// supplies the base URL, the key, and the model name; the server route in
// app/api/ai/route.ts forwards verbatim and never persists the key.

import {
  AI_HEADER_API_KEY,
  AI_HEADER_BASE_URL,
  AI_HEADER_MODEL,
} from "./ai-headers";

export type AiSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
};

const STORAGE_KEY = "studygit:ai-settings:v1";

export const AI_SETTINGS_DIALOG_EVENT = "studygit:open-ai-settings";
export const AI_SETTINGS_CHANGE_EVENT = "studygit:ai-settings-change";

// Re-export so existing callers (and ones that imported from here before
// the split) keep working. New code should prefer importing directly from
// "@/lib/ai-headers" when only the header names are needed on the
// server-side route.
export {
  AI_HEADER_BASE_URL,
  AI_HEADER_API_KEY,
  AI_HEADER_MODEL,
} from "./ai-headers";

function isValidBaseUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function readAiSettings(): AiSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_AI_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    return {
      baseUrl:
        typeof parsed.baseUrl === "string" && isValidBaseUrl(parsed.baseUrl)
          ? parsed.baseUrl.replace(/\/+$/, "")
          : DEFAULT_AI_SETTINGS.baseUrl,
      apiKey:
        typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model:
        typeof parsed.model === "string" && parsed.model.trim()
          ? parsed.model.trim()
          : DEFAULT_AI_SETTINGS.model,
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function writeAiSettings(patch: Partial<AiSettings>): AiSettings {
  const current = readAiSettings();
  const next: AiSettings = {
    baseUrl: patch.baseUrl !== undefined ? patch.baseUrl : current.baseUrl,
    apiKey: patch.apiKey !== undefined ? patch.apiKey : current.apiKey,
    model: patch.model !== undefined ? patch.model : current.model,
  };
  next.baseUrl = (next.baseUrl || DEFAULT_AI_SETTINGS.baseUrl).replace(/\/+$/, "");
  next.model = next.model || DEFAULT_AI_SETTINGS.model;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable (private mode, etc.) — fall back to
    // silently losing the write; the dialog re-hydrates from disk on next
    // open and shows the user the configuration didn't stick.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AI_SETTINGS_CHANGE_EVENT));
  }
  return next;
}

export function hasAiCredentials(settings: AiSettings = readAiSettings()): boolean {
  return Boolean(
    settings.apiKey?.trim() &&
      isValidBaseUrl(settings.baseUrl) &&
      settings.model?.trim()
  );
}

// Build the headers carried on every /api/ai call. Centralized so callers
// don't have to remember the header names and so we can change the wire
// format in one place if we ever need to.
export function aiRequestHeaders(
  settings: AiSettings = readAiSettings()
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    [AI_HEADER_BASE_URL]: settings.baseUrl,
    [AI_HEADER_API_KEY]: settings.apiKey,
    [AI_HEADER_MODEL]: settings.model,
  };
}

// Probe the configured provider for a 200 response. Used by the settings
// dialog's "Test connection" button. We hit /models because every
// OpenAI-compatible server implements it (and it's cheap — no token spend).
export async function testAiConnection(
  settings: AiSettings
): Promise<{ ok: true; modelCount: number } | { ok: false; message: string }> {
  if (!isValidBaseUrl(settings.baseUrl)) {
    return { ok: false, message: "Base URL is not a valid http(s) URL." };
  }
  if (!settings.apiKey.trim()) {
    return { ok: false, message: "API key is required." };
  }
  try {
    const res = await fetch(`${settings.baseUrl.replace(/\/+$/, "")}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
      },
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 240);
      return {
        ok: false,
        message: `Provider returned ${res.status}${text ? ` — ${text}` : ""}`,
      };
    }
    const payload = (await res.json().catch(() => null)) as
      | { data?: unknown[] }
      | null;
    const count = Array.isArray(payload?.data) ? payload!.data!.length : 0;
    return { ok: true, modelCount: count };
  } catch (err) {
    return {
      ok: false,
      message:
        (err as Error)?.message ??
        "Network error reaching the provider. Check the base URL and CORS settings.",
    };
  }
}
