"use client";

// Active-recall answer box shared by both study surfaces. The student
// types (or dictates) an answer, the AI judges it against the card's
// reference, and the verdict maps to a suggested FSRS grade the caller
// commits. Quiz is opt-in per session (the Flip/Quiz toggle lives in the
// study surfaces); occlusion cards aren't quizzable and fall back to flip.

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CornerDownLeft, Loader2, Mic, X } from "lucide-react";
import {
  AI_SETTINGS_DIALOG_EVENT,
  hasAiCredentials,
} from "@/lib/ai-settings";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";
import { judgeQuizAnswer, type QuizJudgement } from "@/lib/quiz";
import type { FlashcardGrade } from "@/lib/flashcards";
import type { Flashcard } from "@/lib/types";

const VERDICT_STYLE: Record<
  QuizJudgement["verdict"],
  { label: string; className: string }
> = {
  correct: {
    label: "Correct",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  partial: {
    label: "Partially right",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  incorrect: {
    label: "Not quite",
    className: "border-red-500/40 bg-red-500/10 text-red-500",
  },
};

export function QuizPanel({
  card,
  onGraded,
}: {
  card: Flashcard;
  // Called once the student commits a grade (suggested or overridden).
  // The parent advances to the next card.
  onGraded: (grade: FlashcardGrade) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [judging, setJudging] = useState(false);
  const [judgement, setJudgement] = useState<QuizJudgement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fresh card → fresh answer box.
  const [prevCardId, setPrevCardId] = useState(card.id);
  if (prevCardId !== card.id) {
    setPrevCardId(card.id);
    setAnswer("");
    setJudgement(null);
    setError(null);
    setJudging(false);
  }

  const stt = useSpeechRecognition({
    continuous: true,
    onFinalChunk: (chunk) => {
      setAnswer((prev) => {
        const sep = prev && !/\s$/.test(prev) ? " " : "";
        return `${prev}${sep}${chunk}`;
      });
    },
  });

  useEffect(() => {
    if (!judgement) textareaRef.current?.focus();
  }, [judgement, card.id]);

  const submit = useCallback(async () => {
    if (judging || judgement) return;
    if (!answer.trim()) return;
    if (!hasAiCredentials()) {
      window.dispatchEvent(new CustomEvent(AI_SETTINGS_DIALOG_EVENT));
      return;
    }
    if (stt.listening) stt.stop();
    setJudging(true);
    setError(null);
    const result = await judgeQuizAnswer(card, answer);
    setJudging(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setJudgement(result.judgement);
  }, [answer, judging, judgement, card, stt]);

  // After a verdict: Enter accepts the suggested grade, 1–4 override.
  useEffect(() => {
    if (!judgement) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onGraded(judgement.suggestedGrade);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [judgement, onGraded]);

  if (judgement) {
    const style = VERDICT_STYLE[judgement.verdict];
    return (
      <div className="mx-auto w-full max-w-xl space-y-3">
        <div className={`rounded-[var(--pg-radius-md)] border px-3.5 py-2.5 ${style.className}`}>
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold">
            {judgement.verdict === "correct" ? (
              <Check size={13} />
            ) : (
              <X size={13} />
            )}
            {style.label}
          </div>
          {judgement.explanation ? (
            <p className="text-[12.5px] leading-snug text-[var(--pg-fg-soft)]">
              {judgement.explanation}
            </p>
          ) : null}
        </div>

        <div className="rounded-[var(--pg-radius-md)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2">
          <div className="mb-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--pg-muted)]">
            Your answer
          </div>
          <p className="text-[12.5px] text-[var(--pg-fg-soft)]">{answer}</p>
        </div>

        <p className="text-center text-[11px] text-[var(--pg-muted)]">
          Enter accepts the suggested grade · or pick below to override
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits, Shift+Enter newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Answer from memory, then press Enter to check…"
          rows={3}
          className="pg-input w-full resize-none pr-10 text-[13.5px] leading-relaxed"
        />
        {stt.supported ? (
          <button
            onClick={() => (stt.listening ? stt.stop() : stt.start())}
            className={
              stt.listening
                ? "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-[var(--pg-radius-md)] bg-[var(--pg-accent)] text-white"
                : "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-[var(--pg-radius-md)] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            }
            title={stt.listening ? "Stop dictation" : "Dictate your answer"}
          >
            <Mic size={14} className={stt.listening ? "animate-pulse" : ""} />
          </button>
        ) : null}
      </div>

      {stt.listening && stt.interimTranscript ? (
        <p className="mt-1 px-1 text-[12px] italic text-[var(--pg-muted)]">
          {stt.interimTranscript}
        </p>
      ) : null}

      {error ? (
        <p className="mt-1.5 px-1 text-[11.5px] text-red-500">{error}</p>
      ) : null}

      <div className="mt-2.5 flex items-center justify-center">
        <button
          onClick={() => void submit()}
          disabled={judging || !answer.trim()}
          className="pg-btn pg-btn-study px-4 disabled:opacity-40"
        >
          {judging ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <CornerDownLeft size={13} />
          )}
          {judging ? "Checking…" : "Check answer"}
        </button>
      </div>
    </div>
  );
}
