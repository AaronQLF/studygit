"use client";

// Bridge between the global `pendingHighlightJumps[nodeId]` slot in the
// store and a panel-local "jump to this target" handler. Three panels
// (AI answer, link, PDF) all needed the same shape — subscribe on mount,
// honor any pending request that was already queued, then react to any
// future changes — so it lives here as a single hook.
//
// The panel passes in a `tryJump(targetId)` callback that returns
// nothing. The callback is responsible for whatever "jump" means in that
// panel (scroll a turn into view, switch the link panel back to reader
// mode, run pdf.js's scrollToHighlight). It is also responsible for
// calling the store's `consumePendingHighlightJump(nodeId)` once it has
// either landed the jump or decided to drop it — that mirrors the
// behavior of the open-coded versions and keeps the store's queue tidy.
//
// `tryJump` is intentionally not reactive; we read the freshest reference
// from a ref on each fire so the subscription only binds once per node.

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";

export function usePendingHighlightJump(
  nodeId: string,
  tryJump: (targetId: string) => void
) {
  const handlerRef = useRef(tryJump);
  useEffect(() => {
    handlerRef.current = tryJump;
  }, [tryJump]);

  useEffect(() => {
    const initial = useStore.getState().pendingHighlightJumps[nodeId] ?? null;
    if (initial) handlerRef.current(initial);

    return useStore.subscribe((state, prev) => {
      const next = state.pendingHighlightJumps[nodeId] ?? null;
      const before = prev.pendingHighlightJumps[nodeId] ?? null;
      if (!next || next === before) return;
      handlerRef.current(next);
    });
  }, [nodeId]);
}
