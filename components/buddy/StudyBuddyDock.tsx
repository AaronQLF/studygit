"use client";

// Right-side dock that hosts the Study Buddy panel app-wide. Mounts
// next to the main canvas (inside AppShell) so it visually shrinks the
// canvas when open instead of overlaying it. The dock owns three
// pieces of chrome the inner panel doesn't need to care about:
//
//   1. A drag-handle on the left edge that resizes the dock's width
//      (state in the store, persisted with the workspace snapshot so
//      the user's preferred width sticks across reloads).
//   2. A close button in the top-right that flips `studyBuddy.open`.
//   3. The collapsed/expanded shell rendering. When closed we render
//      nothing — the toggle button lives in AppShell's header so it's
//      still reachable.

import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  STUDY_BUDDY_MAX_WIDTH,
  STUDY_BUDDY_MIN_WIDTH,
} from "@/lib/defaults";
import { StudyBuddyPanel } from "./StudyBuddyPanel";

export function StudyBuddyDock() {
  const open = useStore((s) => s.studyBuddy.open);
  const width = useStore((s) => s.studyBuddy.width);
  const setOpen = useStore((s) => s.setStudyBuddyOpen);
  const setWidth = useStore((s) => s.setStudyBuddyWidth);

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Resize handle drag — measure pointer X relative to viewport right
  // edge so the math stays correct when the sidebar collapses or the
  // window is resized mid-drag. We commit the final width to the store
  // (and thus to disk) once on pointerup; intermediate values are kept
  // visually fluid via a CSS variable.
  const dragStateRef = useRef<{
    dragging: boolean;
    pendingWidth: number;
  }>({ dragging: false, pendingWidth: width });

  const onResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      dragStateRef.current.dragging = true;

      const onMove = (ev: PointerEvent) => {
        if (!dragStateRef.current.dragging) return;
        const next = clamp(window.innerWidth - ev.clientX);
        dragStateRef.current.pendingWidth = next;
        if (wrapperRef.current) {
          wrapperRef.current.style.width = `${next}px`;
        }
      };
      const onEnd = () => {
        if (!dragStateRef.current.dragging) return;
        dragStateRef.current.dragging = false;
        setWidth(dragStateRef.current.pendingWidth);
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onEnd);
        target.removeEventListener("pointercancel", onEnd);
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onEnd);
      target.addEventListener("pointercancel", onEnd);
    },
    [setWidth]
  );

  // Keep the live width in sync with the store when the user *isn't*
  // dragging — covers the initial mount + any external setWidth calls.
  useEffect(() => {
    if (dragStateRef.current.dragging) return;
    if (wrapperRef.current) {
      wrapperRef.current.style.width = cssWidthFor(width);
    }
  }, [width]);

  if (!open) return null;

  return (
    <aside
      ref={wrapperRef}
      className="relative flex h-full shrink-0 flex-col border-l border-[var(--pg-border)] bg-[var(--pg-bg)]"
      style={{ width: cssWidthFor(width) }}
      aria-label="Study Buddy"
    >
      <div
        onPointerDown={onResizeStart}
        className="group absolute left-0 top-0 z-10 h-full w-1 -translate-x-1/2 cursor-col-resize"
        title="Drag to resize"
      >
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-[var(--pg-accent)]" />
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="absolute right-1 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]"
        title="Close Study Buddy"
        aria-label="Close Study Buddy"
      >
        <X size={13} />
      </button>
      <div className="flex h-full min-h-0 flex-col">
        <StudyBuddyPanel />
      </div>
    </aside>
  );
}

function clamp(n: number): number {
  return Math.max(STUDY_BUDDY_MIN_WIDTH, Math.min(STUDY_BUDDY_MAX_WIDTH, Math.round(n)));
}

// The persisted width can exceed a small viewport (set the dock to 720px
// on a monitor, reopen on a laptop) — cap it at render time so the dock
// never swallows the whole window. The 220px reserve keeps a usable
// sliver of canvas + sidebar toggle reachable.
function cssWidthFor(width: number): string {
  return `min(${width}px, calc(100vw - 220px))`;
}
