"use client";

// Shared question/answer renderer for every review surface. Handles the
// three card types:
//   basic     — plain front/back text
//   cloze     — blanks on the question side, highlighted reveals on the
//               answer side
//   occlusion — image with covered regions (question) / outlined regions
//               (answer), plus the optional hint line

import { clozeQuestion, clozeSegments } from "@/lib/flashcards";
import type { Flashcard } from "@/lib/types";

export function CardFace({
  card,
  side,
}: {
  card: Flashcard;
  side: "question" | "answer";
}) {
  if (card.type === "occlusion" && card.imageUrl) {
    return (
      <span className="flex w-full flex-col items-center gap-3">
        {card.front ? (
          <span className="text-[14px] text-[var(--pg-fg-soft)]">
            {card.front}
          </span>
        ) : null}
        <span className="relative inline-block max-h-[46vh] overflow-hidden rounded-[var(--pg-radius-md)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.imageUrl}
            alt={card.front || "Occluded diagram"}
            draggable={false}
            className="max-h-[46vh] w-auto max-w-full select-none rounded-[var(--pg-radius-md)]"
          />
          {(card.occlusionRects ?? []).map((r, i) => (
            <span
              key={i}
              className="absolute rounded-[3px]"
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.width * 100}%`,
                height: `${r.height * 100}%`,
                ...(side === "question"
                  ? { backgroundColor: "var(--pg-study)", opacity: 0.92 }
                  : {
                      border: "2px solid var(--pg-study)",
                      backgroundColor: "transparent",
                    }),
              }}
            />
          ))}
        </span>
      </span>
    );
  }

  if (card.type === "cloze") {
    if (side === "question") {
      return <span>{clozeQuestion(card.front)}</span>;
    }
    return (
      <span>
        {clozeSegments(card.front).map((segment, i) =>
          segment.hidden ? (
            <mark
              key={i}
              className="rounded-[3px] bg-[var(--pg-study-soft)] px-0.5 font-semibold text-[var(--pg-study)]"
            >
              {segment.text}
            </mark>
          ) : (
            <span key={i}>{segment.text}</span>
          )
        )}
      </span>
    );
  }

  return <span>{side === "question" ? card.front : card.back}</span>;
}
