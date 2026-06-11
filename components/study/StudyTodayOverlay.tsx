"use client";

// "Study today" — one review session over every due card in every deck
// and workspace. Opens from the header button; Space flips, 1–4 grades,
// Esc leaves. Grading writes through the normal store pipeline, so deck
// panels and canvas cards stay live, and the first review of the day
// bumps the streak.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Flame, GraduationCap, RotateCcw, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { collectDueCards } from "@/lib/study";
import {
  gradeCard,
  nextDueLabel,
  previewIntervalsNow,
  type FlashcardGrade,
} from "@/lib/flashcards";
import { CardFace } from "./CardFace";
import { GRADE_BUTTONS } from "./grade-buttons";
import type { Flashcard, FlashcardsNodeData } from "@/lib/types";

type QueueEntry = { nodeId: string; cardId: string; deckTitle: string };

export function StudyTodayOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const nodes = useStore((s) => s.nodes);
  const updateNodeData = useStore((s) => s.updateNodeData);
  const recordStudyDay = useStore((s) => s.recordStudyDay);
  const streak = useStore((s) => s.studyStreak);

  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Snapshot the due queue when the overlay opens.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      const due = collectDueCards(useStore.getState().nodes).map((ref) => ({
        nodeId: ref.nodeId,
        cardId: ref.card.id,
        deckTitle: ref.deckTitle,
      }));
      setQueue(due);
      setSessionTotal(due.length);
      setReviewed(0);
      setFlipped(false);
    });
  }, [open]);

  // Resolve the current entry against live store state; entries whose
  // card/deck vanished mid-session are skipped at render time. The
  // deck's exam date rides along so grading respects its interval cap.
  const { current, liveQueue } = useMemo(() => {
    const live: Array<
      QueueEntry & { card: Flashcard; examDate: number | null }
    > = [];
    for (const entry of queue) {
      const node = nodes.find((n) => n.id === entry.nodeId);
      if (!node || node.data.kind !== "flashcards") continue;
      const data = node.data as FlashcardsNodeData;
      const card = data.cards?.find((c) => c.id === entry.cardId);
      if (!card) continue;
      live.push({ ...entry, card, examDate: data.examDate ?? null });
    }
    return { current: live[0], liveQueue: live };
  }, [queue, nodes]);

  const grade = useCallback(
    (g: FlashcardGrade) => {
      if (!current) return;
      const node = useStore.getState().nodes.find((n) => n.id === current.nodeId);
      if (!node || node.data.kind !== "flashcards") return;
      const data = node.data as FlashcardsNodeData;
      const graded = gradeCard(current.card, g, Date.now(), {
        examDate: data.examDate ?? null,
      });
      updateNodeData(current.nodeId, {
        cards: (data.cards ?? []).map((c) =>
          c.id === current.cardId ? graded : c
        ),
      } as Partial<FlashcardsNodeData>);
      recordStudyDay();
      setQueue((q) => {
        const rest = q.filter(
          (e) => !(e.nodeId === current.nodeId && e.cardId === current.cardId)
        );
        if (g === "again") {
          return [
            ...rest,
            {
              nodeId: current.nodeId,
              cardId: current.cardId,
              deckTitle: current.deckTitle,
            },
          ];
        }
        return rest;
      });
      if (g === "again") setSessionTotal((n) => n + 1);
      setReviewed((n) => n + 1);
      setFlipped(false);
    },
    [current, updateNodeData, recordStudyDay]
  );

  // Keyboard: Space/Enter flips, 1–4 grades, Esc closes.
  useEffect(() => {
    if (!open) return;
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
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      if (!flipped) return;
      const match = GRADE_BUTTONS.find((g) => g.key === e.key);
      if (match) {
        e.preventDefault();
        grade(match.grade);
      }
    };
    // Capture phase so the panel/canvas Escape handlers underneath don't
    // also fire while the overlay is up.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, flipped, grade, onClose]);

  if (!open) return null;

  const progress = sessionTotal ? Math.min(1, reviewed / sessionTotal) : 0;
  const previews =
    current && flipped
      ? previewIntervalsNow(current.card, { examDate: current.examDate })
      : null;
  const allCards = nodes.flatMap((n) =>
    n.data.kind === "flashcards"
      ? ((n.data as FlashcardsNodeData).cards ?? [])
      : []
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[var(--pg-bg)]/96 backdrop-blur-[3px]">
      <div className="flex h-12 shrink-0 items-center gap-3 px-5">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--pg-fg)]">
          <GraduationCap size={15} className="text-[var(--pg-study)]" />
          Study today
        </span>
        {streak && streak.count > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-500">
            <Flame size={11} />
            {streak.count}-day streak
          </span>
        ) : null}
        <div className="h-1.5 max-w-md flex-1 overflow-hidden rounded-full bg-[var(--pg-bg-subtle)]">
          <div
            className="h-full rounded-full bg-[var(--pg-study)] transition-[width] duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="text-[11.5px] tabular-nums text-[var(--pg-muted)]">
          {liveQueue.length} left
        </span>
        <button
          onClick={onClose}
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          title="Close (Esc)"
        >
          <X size={15} />
        </button>
      </div>

      {!current ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Check size={30} className="text-emerald-500" />
          <div className="pg-serif text-[22px] font-semibold text-[var(--pg-fg)]">
            {reviewed > 0 ? "All done for today" : "Nothing due right now"}
          </div>
          <div className="text-[13px] text-[var(--pg-muted)]">
            {reviewed > 0
              ? `${reviewed} ${reviewed === 1 ? "review" : "reviews"} done.`
              : "Generate cards from your readings and they'll queue up here."}
            {nextDueLabel(allCards)
              ? ` Next card due ${nextDueLabel(allCards)}.`
              : ""}
          </div>
          {streak && streak.count > 1 ? (
            <div className="inline-flex items-center gap-1.5 text-[13px] text-orange-500">
              <Flame size={14} />
              {streak.count} days in a row — keep it going.
            </div>
          ) : null}
          <button
            onClick={onClose}
            className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--pg-radius-md)] border border-[var(--pg-border-strong)] px-3.5 py-1.5 text-[13px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
          >
            Back to canvas
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-1 min-h-0 items-center justify-center px-8 py-6">
            <button
              onClick={() => setFlipped((f) => !f)}
              className="flex max-h-full w-full max-w-2xl flex-col items-center justify-center gap-4 rounded-[var(--pg-radius-xl)] border border-[var(--pg-border)] bg-[var(--pg-bg)] px-10 py-12 text-center shadow-[var(--pg-shadow-lg)] transition-shadow hover:shadow-xl"
            >
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--pg-muted)]">
                {current.deckTitle} · {flipped ? "Answer" : "Question"}
              </span>
              <span className="pg-serif overflow-y-auto whitespace-pre-wrap text-[20px] font-medium leading-relaxed text-[var(--pg-fg)]">
                <CardFace
                  card={current.card}
                  side={flipped ? "answer" : "question"}
                />
              </span>
              {!flipped ? (
                <span className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-[var(--pg-muted)]">
                  <RotateCcw size={11} />
                  Click or press Space to reveal
                </span>
              ) : null}
            </button>
          </div>

          <div className="shrink-0 px-6 pb-8">
            {flipped ? (
              <div className="mx-auto flex max-w-2xl items-center justify-center gap-2">
                {GRADE_BUTTONS.map((g) => (
                  <button
                    key={g.grade}
                    onClick={() => grade(g.grade)}
                    className={`flex-1 rounded-[var(--pg-radius-md)] border bg-[var(--pg-bg)] px-3 py-2.5 text-[13px] font-medium transition-colors ${g.className}`}
                  >
                    <span className="flex flex-col items-center gap-0.5">
                      <span>
                        {g.label}
                        <span className="ml-1.5 rounded bg-[var(--pg-bg-subtle)] px-1 text-[10px] text-[var(--pg-muted)]">
                          {g.key}
                        </span>
                      </span>
                      {previews ? (
                        <span className="text-[10px] font-normal tabular-nums text-[var(--pg-muted)]">
                          {previews[g.grade]}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center text-[11.5px] text-[var(--pg-muted)]">
                Space to flip · 1–4 to grade · Esc to leave
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
