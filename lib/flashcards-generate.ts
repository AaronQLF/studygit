"use client";

// Client dispatcher for AI flashcard generation. The transport (hosted
// raw-mode /api/ai vs the Electron main-process bridge) lives in
// lib/ai-raw.ts; this module owns the flashcard prompt + parsing.

import { type AiSettings } from "@/lib/ai-settings";
import { type AiRequestSource } from "@/lib/ai-request";
import { fetchRawAnswer } from "@/lib/ai-raw";
import {
  FLASHCARD_SYSTEM_PROMPT,
  flashcardUserPrompt,
  parseGeneratedCards,
  type GeneratedCardDraft,
} from "@/lib/flashcards";

export type GenerateCardsResult =
  | { ok: true; cards: GeneratedCardDraft[] }
  | { ok: false; error: string; details?: string };

export async function generateCardsFromSources(
  sources: AiRequestSource[],
  count: number,
  guidance: string,
  settings: AiSettings
): Promise<GenerateCardsResult> {
  const userPrompt = flashcardUserPrompt(count, guidance);
  const raw = await fetchRawAnswer(
    FLASHCARD_SYSTEM_PROMPT,
    sources,
    userPrompt,
    settings
  );
  if (!raw.ok) return raw;
  const cards = parseGeneratedCards(raw.answer);
  if (cards.length === 0) {
    return {
      ok: false,
      error: "Couldn't parse cards from the model's reply",
      details: raw.answer.slice(0, 300),
    };
  }
  return { ok: true, cards };
}
