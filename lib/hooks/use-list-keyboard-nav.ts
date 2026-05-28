"use client";

// Generic keyboard navigation for a vertical list with a single active
// index. Currently used by SourcePicker; pulled out so future pickers /
// command palettes share the same Enter/Arrow/Home/End semantics.
//
// The hook owns the active index because it has to know how to clamp it
// against the live item count, and it auto-scrolls the active row into
// view via the provided `listRef`. Callers handle the actual "commit"
// side-effect inside `onCommit` (selecting a row, drilling into a group,
// etc.).

import { useCallback, useEffect, useState, type RefObject } from "react";

export type UseListKeyboardNavOptions = {
  /** Total number of items currently shown in the list. */
  itemCount: number;
  /** Called when the user presses Enter on the active item. */
  onCommit: (index: number) => void;
  /**
   * The scroll container holding the list. The hook keeps the active
   * row in view by adjusting `scrollTop` when arrow keys move past the
   * visible window.
   */
  listRef: RefObject<HTMLElement | null>;
  /**
   * When this value changes the active index resets to 0. Pass anything
   * that should reset cursor position (a search query, the current
   * "view"/drill-target, etc.).
   */
  resetKey: unknown;
};

export type ListKeyboardNav = {
  activeIndex: number;
  /** Bind to the input element's `onKeyDown` (or anywhere arrow keys fire). */
  onKeyDown: (event: React.KeyboardEvent) => void;
  /** Set the active index (e.g. on mouse hover). */
  setActiveIndex: (index: number) => void;
};

export function useListKeyboardNav({
  itemCount,
  onCommit,
  listRef,
  resetKey,
}: UseListKeyboardNavOptions): ListKeyboardNav {
  const [activeIndex, setActiveIndex] = useState(0);
  const clamped = Math.min(activeIndex, Math.max(0, itemCount - 1));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex(0);
  }, [resetKey]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const child = list.children[clamped] as HTMLElement | undefined;
    if (!child) return;
    const top = child.offsetTop;
    const bottom = top + child.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [clamped, listRef]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) =>
          itemCount ? (Math.min(i, itemCount - 1) + 1) % itemCount : 0
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) =>
          itemCount
            ? (Math.min(i, itemCount - 1) - 1 + itemCount) % itemCount
            : 0
        );
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        onCommit(clamped);
        return;
      }
    },
    [itemCount, onCommit, clamped]
  );

  return { activeIndex: clamped, onKeyDown, setActiveIndex };
}
