"use client";

// Header entry point for the daily review loop: shows how many cards are
// due across every deck and workspace, opens the Study Today overlay, and
// keeps the desktop app's dock badge in sync. The due count refreshes on
// any store change plus a slow interval tick (cards become due by time
// passing, not just by edits).

import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { useStore } from "@/lib/store";
import { totalDueCount } from "@/lib/study";
import { StudyTodayOverlay } from "./StudyTodayOverlay";

export function StudyTodayButton() {
  const [open, setOpen] = useState(false);
  // Minute tick so cards crossing their due time surface without
  // requiring a store change.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const due = useStore((s) => totalDueCount(s.nodes));

  // Desktop dock badge (no-op in the browser or older shells).
  useEffect(() => {
    window.studygit?.setBadgeCount?.(due);
  }, [due]);

  return (
    <>
      <button
        className={
          due > 0
            ? "relative inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--pg-study-soft)] px-2 text-[11px] font-medium tracking-tight text-[var(--pg-study)] hover:bg-[var(--pg-study-soft)] "
            : "relative inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
        }
        onClick={() => setOpen(true)}
        title={
          due > 0
            ? `${due} ${due === 1 ? "card" : "cards"} due — study now`
            : "Review flashcards"
        }
      >
        <GraduationCap size={13} />
        <span className="hidden font-medium tracking-tight sm:inline">
          Study
        </span>
        {due > 0 ? (
          <span className="inline-flex min-w-[16px] items-center justify-center rounded-full bg-[var(--pg-study)] px-1 text-[9.5px] font-semibold leading-[15px] text-white">
            {due > 99 ? "99+" : due}
          </span>
        ) : null}
      </button>
      <StudyTodayOverlay open={open} onClose={() => setOpen(false)} />
    </>
  );
}
