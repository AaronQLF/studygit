"use client";

// Client-side dispatcher for AI conversation requests.
//
// Two transports, same return shape:
//
//   1. Hosted path (`/api/ai`, `mode: "full"`) — used by the web build
//      and as a fallback. The hosted Vercel function builds the
//      provider message array, calls the AI provider, processes
//      citations, and returns `{ answer, provenance }`. This only
//      works when the configured AI base URL is reachable from
//      Vercel's network.
//
//   2. Electron path — used whenever `window.studygit.aiFetch` is
//      available (i.e. the packaged desktop app). The renderer
//      assembles the same provider message array locally using the
//      shared helpers in `lib/ai-request.ts`, asks the Electron main
//      process to make the actual HTTP call (so it leaves the user's
//      laptop directly, with full access to corp DNS / VPN / LAN), and
//      then posts the raw answer back to `/api/ai` with
//      `mode: "process-only"` to reuse the existing JSDOM/marked-based
//      citation pipeline. The return shape matches the hosted path
//      exactly so callers don't need to branch.
//
// Network failures in transport 2 are translated into the same
// `{ error, details? }` JSON the hosted path uses, so the UI rendering
// code in AiAnswerPanelBody.tsx is identical for both.

import {
  AI_HEADER_API_KEY,
  AI_HEADER_BASE_URL,
  AI_HEADER_MODEL,
  type AiSettings,
} from "@/lib/ai-settings";
import {
  buildProviderMessages,
  cleanMessages,
  computePromptHashHex,
  hostnameOrEmpty,
  renderSourcesBlock,
  sanitizeSources,
  SYSTEM_PROMPT_RULES,
  type AiAnswerPayload,
  type AiRequestSource,
  type AiWireMessage,
  type ProviderResponse,
} from "@/lib/ai-request";

export type AiSendInput = {
  messages: AiWireMessage[];
  sources: AiRequestSource[];
};

// Same as the hosted `{ error, details? }` payload so the UI can show a
// uniform error pill regardless of which transport produced it.
export type AiSendError = {
  error: string;
  details?: string;
};

export type AiSendResult =
  | { ok: true; payload: AiAnswerPayload }
  | { ok: false; error: AiSendError; status: number };

function inElectron(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.studygit?.aiFetch === "function";
}

async function postHosted(
  input: AiSendInput,
  settings: AiSettings
): Promise<AiSendResult> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [AI_HEADER_BASE_URL]: settings.baseUrl,
      [AI_HEADER_API_KEY]: settings.apiKey,
      [AI_HEADER_MODEL]: settings.model,
    },
    body: JSON.stringify({ messages: input.messages, sources: input.sources }),
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as AiSendError | null;
    return {
      ok: false,
      status: response.status,
      error: err ?? { error: `AI request failed (${response.status})` },
    };
  }
  const payload = (await response.json()) as AiAnswerPayload;
  return { ok: true, payload };
}

async function postProcessOnly(
  raw: string,
  sources: AiRequestSource[]
): Promise<
  | { ok: true; html: string; resolved: number; dropped: number; demoted: number }
  | { ok: false; status: number; error: AiSendError }
> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "process-only", raw, sources }),
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as AiSendError | null;
    return {
      ok: false,
      status: response.status,
      error: err ?? { error: `Citation processing failed (${response.status})` },
    };
  }
  const json = (await response.json()) as {
    html: string;
    resolved: number;
    dropped: number;
    demoted: number;
  };
  return {
    ok: true,
    html: json.html,
    resolved: json.resolved,
    dropped: json.dropped,
    demoted: json.demoted,
  };
}

async function sendViaElectron(
  input: AiSendInput,
  settings: AiSettings
): Promise<AiSendResult> {
  // Refuse early if the bridge somehow vanished between the inElectron()
  // check and now (e.g. preload crashed mid-session).
  const bridge = window.studygit?.aiFetch;
  if (!bridge) {
    return {
      ok: false,
      status: 0,
      error: { error: "Electron AI bridge unavailable" },
    };
  }

  const cleaned = cleanMessages(input.messages);
  if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== "user") {
    return {
      ok: false,
      status: 400,
      error: { error: "messages must end with a user turn" },
    };
  }

  const sources = sanitizeSources(input.sources);
  const sourcesBlock = renderSourcesBlock(sources);
  const providerMessages = buildProviderMessages(
    SYSTEM_PROMPT_RULES,
    sourcesBlock,
    cleaned
  );

  const createdAt = Date.now();
  const promptHashPromise = computePromptHashHex(
    SYSTEM_PROMPT_RULES,
    sourcesBlock,
    JSON.stringify(cleaned)
  );

  const fetchResult = await bridge({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    messages: providerMessages,
    temperature: 0.3,
  });

  if (!fetchResult.ok) {
    // Translate the IPC result into the same `{error, details}` pill the
    // hosted path emits. Add a hint when the renderer can't even reach
    // the configured provider — the user's chat panel is the only
    // surface where they'll see this, so the message has to stand on
    // its own.
    let error = fetchResult.message;
    let details = fetchResult.details;
    if (fetchResult.kind === "network") {
      const host = hostnameOrEmpty(settings.baseUrl);
      error = "Couldn't reach AI provider";
      details = host
        ? `Your machine couldn't connect to ${host}. Check your network / VPN / the base URL configured in Configure AI.${
            fetchResult.details ? ` (${fetchResult.details})` : ""
          }`
        : fetchResult.message;
    } else if (fetchResult.kind === "timeout") {
      error = "AI provider timed out";
    }
    return {
      ok: false,
      status: fetchResult.status ?? 502,
      error: { error, details },
    };
  }

  const providerJson = fetchResult.json as ProviderResponse;
  const raw = providerJson?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) {
    return {
      ok: false,
      status: 502,
      error: { error: "empty answer from model" },
    };
  }

  const processed = await postProcessOnly(raw, sources);
  if (!processed.ok) return processed;

  const promptHash = await promptHashPromise;

  const payload: AiAnswerPayload = {
    answer: processed.html,
    provenance: {
      model: settings.model,
      baseUrlHost: hostnameOrEmpty(settings.baseUrl),
      promptHash,
      createdAt,
      finishedAt: Date.now(),
      citationsResolved: processed.resolved,
      citationsDropped: processed.dropped,
      citationsDemoted: processed.demoted,
      usage: providerJson?.usage,
    },
  };
  return { ok: true, payload };
}

export async function sendAiRequest(
  input: AiSendInput,
  settings: AiSettings
): Promise<AiSendResult> {
  if (inElectron()) {
    return sendViaElectron(input, settings);
  }
  return postHosted(input, settings);
}
