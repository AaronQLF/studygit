"use client";

// Flip / Quiz segmented toggle shared by both study surfaces. Flip is
// self-graded recall; Quiz has the AI judge a written answer.

import { Layers, PenLine } from "lucide-react";

export type StudyMode = "flip" | "quiz";

export function StudyModeToggle({
  mode,
  onChange,
}: {
  mode: StudyMode;
  onChange: (mode: StudyMode) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-[var(--pg-radius-md)] border border-[var(--pg-border)]">
      <button
        onClick={() => onChange("flip")}
        className={
          mode === "flip"
            ? "inline-flex items-center gap-1 bg-[var(--pg-bg-elevated)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--pg-fg)]"
            : "inline-flex items-center gap-1 px-2.5 py-1 text-[11.5px] text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
        }
        title="Flip and grade yourself"
      >
        <Layers size={12} />
        Flip
      </button>
      <button
        onClick={() => onChange("quiz")}
        className={
          mode === "quiz"
            ? "inline-flex items-center gap-1 bg-[var(--pg-bg-elevated)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--pg-fg)]"
            : "inline-flex items-center gap-1 px-2.5 py-1 text-[11.5px] text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
        }
        title="Write an answer and let AI check it"
      >
        <PenLine size={12} />
        Quiz
      </button>
    </div>
  );
}
