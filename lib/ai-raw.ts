"use client";

// Shared client helper for "raw mode" AI calls — structured/utility
// generations that want the model's verbatim output instead of the
// markdown→HTML citation pipeline. Used by flashcard generation and the
// inline writing assistant. Mirrors lib/ai-client.ts's two transports:
// hosted POST /api/ai (mode: "raw") and the Electron main-process bridge
// for private/VPN providers.

import {
  AI_HEADER_API_KEY,
  AI_HEADER_BASE_URL,
  AI_HEADER_MODEL,
  type AiSettings,
} from "@/lib/ai-settings";
import {
  buildProviderMessages,
  renderSourcesBlock,
  sanitizeSources,
  type AiRequestSource,
  type ProviderResponse,
} from "@/lib/ai-request";

export type RawAnswer =
  | { ok: true; answer: string }
  | { ok: false; error: string; details?: string };

export async function fetchRawAnswer(
  systemPrompt: string,
  sources: AiRequestSource[],
  userPrompt: string,
  settings: AiSettings
): Promise<RawAnswer> {
  const bridge =
    typeof window !== "undefined" ? window.studygit?.aiFetch : undefined;

  if (typeof bridge === "function") {
    const cleanedSources = sanitizeSources(sources);
    const providerMessages = buildProviderMessages(
      systemPrompt,
      renderSourcesBlock(cleanedSources),
      [{ role: "user", text: userPrompt, attachments: [] }]
    );
    const result = await bridge({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      messages: providerMessages,
      temperature: 0.3,
    });
    if (!result.ok) {
      return {
        ok: false,
        error:
          result.kind === "network"
            ? "Couldn't reach AI provider"
            : result.message,
        details: result.details,
      };
    }
    const answer =
      (result.json as ProviderResponse)?.choices?.[0]?.message?.content?.trim() ??
      "";
    if (!answer) return { ok: false, error: "Empty answer from model" };
    return { ok: true, answer };
  }

  try {
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [AI_HEADER_BASE_URL]: settings.baseUrl,
        [AI_HEADER_API_KEY]: settings.apiKey,
        [AI_HEADER_MODEL]: settings.model,
      },
      body: JSON.stringify({
        mode: "raw",
        messages: [{ role: "user", text: userPrompt }],
        sources,
        systemPromptExtra: systemPrompt,
      }),
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => null)) as {
        error?: string;
        details?: string;
      } | null;
      return {
        ok: false,
        error: err?.error ?? `AI request failed (${response.status})`,
        details: err?.details,
      };
    }
    const payload = (await response.json()) as { answer?: string };
    const answer = payload.answer?.trim() ?? "";
    if (!answer) return { ok: false, error: "Empty answer from model" };
    return { ok: true, answer };
  } catch (err) {
    return { ok: false, error: (err as Error).message || "Network error" };
  }
}
