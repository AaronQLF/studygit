"use client";

// Inline writing assistant: Notion-AI-style transforms applied to the
// current selection. Each action is a one-shot raw-mode call — the model
// gets the selected text plus a tight instruction and must return only
// the rewritten text.

import { readAiSettings, type AiSettings } from "@/lib/ai-settings";
import { fetchRawAnswer } from "@/lib/ai-raw";

export type RewriteAction =
  | "improve"
  | "grammar"
  | "shorter"
  | "longer"
  | "simplify";

export const REWRITE_ACTIONS: Array<{
  action: RewriteAction;
  label: string;
}> = [
  { action: "improve", label: "Improve writing" },
  { action: "grammar", label: "Fix grammar & spelling" },
  { action: "shorter", label: "Make shorter" },
  { action: "longer", label: "Make longer" },
  { action: "simplify", label: "Simplify language" },
];

const INSTRUCTIONS: Record<RewriteAction, string> = {
  improve:
    "Improve clarity, flow, and word choice while keeping the meaning and roughly the same length.",
  grammar:
    "Fix grammar, spelling, and punctuation only. Keep the wording otherwise unchanged.",
  shorter:
    "Rewrite more concisely — cut filler while keeping every key piece of information. Aim for about half the length.",
  longer:
    "Expand with relevant detail, explanation, or examples. Aim for roughly double the length.",
  simplify:
    "Rewrite in plain, simple language a high-school student would find easy to follow.",
};

const REWRITE_SYSTEM_PROMPT = [
  "You are a precise writing assistant embedded in a student note-taking app.",
  "Apply the requested transformation to the user's text.",
  "Return ONLY the transformed text — no preamble, no surrounding quotes, no commentary.",
  "Preserve the original language of the text.",
  "Preserve inline LaTeX ($...$) and code spans verbatim unless the instruction requires changing them.",
  "Never invent facts that are not in the original text.",
].join(" ");

export const MAX_REWRITE_CHARS = 12_000;

export type RewriteResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export async function rewriteText(
  action: RewriteAction,
  text: string,
  settings: AiSettings = readAiSettings()
): Promise<RewriteResult> {
  const input = text.trim();
  if (!input) return { ok: false, error: "Nothing selected" };
  if (input.length > MAX_REWRITE_CHARS) {
    return {
      ok: false,
      error: `Selection too long (over ${Math.round(MAX_REWRITE_CHARS / 1000)}k characters)`,
    };
  }
  const prompt = [
    `Transformation: ${INSTRUCTIONS[action]}`,
    "",
    "Text:",
    input,
  ].join("\n");
  const result = await fetchRawAnswer(REWRITE_SYSTEM_PROMPT, [], prompt, settings);
  if (!result.ok) {
    return {
      ok: false,
      error: result.details ? `${result.error} — ${result.details}` : result.error,
    };
  }
  return { ok: true, text: result.answer };
}
