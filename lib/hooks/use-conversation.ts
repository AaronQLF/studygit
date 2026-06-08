"use client";

// Headless engine shared by every AI conversation surface (the canvas
// "Ask AI" node and the app-wide Study Buddy dock). It owns the composer
// state, the send/retry lifecycle, history assembly, and the call to
// `sendAiRequest`. Each surface supplies a `thread` (where its turns
// live) and a `getSendSources` (how it grounds the model); everything
// else is identical, so it lives here once instead of being copy-pasted
// per surface.

import { useCallback, useState } from "react";
import { nanoid } from "nanoid";
import { hasAiCredentials, readAiSettings } from "@/lib/ai-settings";
import { sendAiRequest } from "@/lib/ai-client";
import { attachmentsForWire } from "@/lib/ai-attachments";
import type { AiRequestSource } from "@/lib/ai-request";
import type { AiAttachment, AiProvenance, AiTurn } from "@/lib/types";

// The turn list a surface owns, plus the three mutations the engine
// needs. For the AI node these are bound to the node id; for the buddy
// they're the app-level store actions directly.
export type ConversationThread = {
  turns: AiTurn[];
  appendTurn: (turn: AiTurn) => void;
  updateTurn: (turnId: string, patch: Partial<AiTurn>) => void;
  removeTurn: (turnId: string) => void;
};

export type UseConversationArgs = {
  thread: ConversationThread;
  // Resolved at send time (not a value) because both surfaces re-stamp
  // their source ids as a side effect when a turn is sent. Returns the
  // grounding sources already filtered to "ready" and mapped to the
  // wire shape.
  getSendSources: () => AiRequestSource[];
  // Surface-specific addendum to the system prompt — the Study Buddy
  // uses it to teach the model the `pgedit` block format.
  systemPromptExtra?: string;
  // Fires when the first turn of a conversation is sent, before the
  // network call. The AI node uses it to auto-name itself from the
  // prompt.
  onFirstTurn?: (promptText: string, attachments: AiAttachment[]) => void;
};

export type UseConversationResult = {
  composer: string;
  setComposer: (next: string) => void;
  pendingAttachments: AiAttachment[];
  setPendingAttachments: (next: AiAttachment[]) => void;
  attachmentError: string | null;
  setAttachmentError: (next: string | null) => void;
  credsMissing: boolean;
  turnRunning: boolean;
  send: (text: string, attachments?: AiAttachment[]) => Promise<void>;
  retryFrom: (assistantTurnId: string) => void;
};

export function useConversation({
  thread,
  getSendSources,
  systemPromptExtra,
  onFirstTurn,
}: UseConversationArgs): UseConversationResult {
  const { turns, appendTurn, updateTurn, removeTurn } = thread;

  const [composer, setComposer] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<AiAttachment[]>(
    []
  );
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [credsMissing, setCredsMissing] = useState(false);

  const turnRunning = turns.some((t) => t.status === "running");

  const send = useCallback(
    async (text: string, attachments: AiAttachment[] = []) => {
      const promptText = text.trim();
      // Allow image-only messages — the model can answer about the
      // attached image on its own.
      if (!promptText && attachments.length === 0) return;
      if (!hasAiCredentials()) {
        setCredsMissing(true);
        return;
      }
      setCredsMissing(false);

      const sources = getSendSources();

      const userTurn: AiTurn = {
        id: nanoid(8),
        role: "user",
        text: promptText,
        createdAt: Date.now(),
        attachments: attachments.length > 0 ? attachments : undefined,
      };
      const assistantTurn: AiTurn = {
        id: nanoid(8),
        role: "assistant",
        text: "",
        createdAt: Date.now(),
        status: "running",
      };

      // Snapshot before appending so history excludes the turn we're
      // sending and onFirstTurn sees the true "is this the first turn?".
      const priorTurns = turns;
      const isFirstTurn = priorTurns.length === 0;

      appendTurn(userTurn);
      appendTurn(assistantTurn);
      setComposer("");
      setPendingAttachments([]);
      setAttachmentError(null);
      if (isFirstTurn) onFirstTurn?.(promptText, attachments);

      try {
        // Re-send full history so the model sees prior context. Images
        // ride along only on user turns and are re-fed every turn so the
        // model's visual context survives multi-turn questions.
        const history = [
          ...priorTurns
            .filter(
              (t) => t.role === "user" || (t.text && t.status !== "error")
            )
            .map((t) => ({
              role: t.role,
              text: t.text,
              attachments:
                t.role === "user"
                  ? attachmentsForWire(t.attachments)
                  : undefined,
            })),
          {
            role: "user" as const,
            text: promptText,
            attachments: attachmentsForWire(attachments),
          },
        ];

        const result = await sendAiRequest(
          { messages: history, sources, systemPromptExtra },
          readAiSettings()
        );

        if (!result.ok) {
          const message =
            (result.error.error ?? "AI request failed") +
            (result.error.details ? ` — ${result.error.details}` : "");
          updateTurn(assistantTurn.id, { status: "error", error: message });
          return;
        }

        updateTurn(assistantTurn.id, {
          status: "idle",
          text: result.payload.answer ?? "",
          provenance: (result.payload.provenance as AiProvenance) ?? null,
          error: undefined,
        });
      } catch (err) {
        updateTurn(assistantTurn.id, {
          status: "error",
          error: (err as Error)?.message ?? "Network error",
        });
      }
    },
    [turns, appendTurn, updateTurn, getSendSources, systemPromptExtra, onFirstTurn]
  );

  // Re-run an assistant turn: drop it (and any later turns) plus the
  // user turn above it, then resend that user message. Same semantics as
  // ChatGPT/Claude's "regenerate".
  const retryFrom = useCallback(
    (assistantTurnId: string) => {
      const idx = turns.findIndex((t) => t.id === assistantTurnId);
      if (idx < 1) return;
      const previous = turns[idx - 1];
      if (previous.role !== "user") return;
      const toRemove = turns.slice(idx).map((t) => t.id);
      for (const id of toRemove) removeTurn(id);
      removeTurn(previous.id);
      void send(previous.text, previous.attachments ?? []);
    },
    [turns, removeTurn, send]
  );

  return {
    composer,
    setComposer,
    pendingAttachments,
    setPendingAttachments,
    attachmentError,
    setAttachmentError,
    credsMissing,
    turnRunning,
    send,
    retryFrom,
  };
}
