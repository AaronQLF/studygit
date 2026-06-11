// Shared grade-button config for every review surface (per-deck study
// view + the cross-deck Today overlay). Lives in its own tiny module so
// the eager Today overlay doesn't have to import the lazy-loaded deck
// panel chunk just for four buttons.

import type { FlashcardGrade } from "@/lib/flashcards";

export const GRADE_BUTTONS: Array<{
  grade: FlashcardGrade;
  label: string;
  key: string;
  className: string;
}> = [
  {
    grade: "again",
    label: "Again",
    key: "1",
    className: "border-red-500/40 text-red-500 hover:bg-red-500/10",
  },
  {
    grade: "hard",
    label: "Hard",
    key: "2",
    className: "border-amber-500/40 text-amber-600 hover:bg-amber-500/10",
  },
  {
    grade: "good",
    label: "Good",
    key: "3",
    className: "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10",
  },
  {
    grade: "easy",
    label: "Easy",
    key: "4",
    className: "border-sky-500/40 text-sky-600 hover:bg-sky-500/10",
  },
];
