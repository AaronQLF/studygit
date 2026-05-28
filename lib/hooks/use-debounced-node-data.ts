"use client";

// Debounce writes to `updateNodeData(nodeId, patch)` so simple panels
// (notes, image URL editor) don't hammer the store / persistence layer
// on every keystroke. Used to be open-coded as a 220ms setTimeout in
// every panel body that owns local form state.

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import type { AnyNodeData } from "@/lib/types";

export function useDebouncedNodeData<TData extends AnyNodeData>(
  nodeId: string,
  patch: Partial<TData>,
  delayMs: number = 220
) {
  const updateNodeData = useStore((s) => s.updateNodeData);
  useEffect(() => {
    const timer = setTimeout(() => {
      updateNodeData(nodeId, patch as Partial<AnyNodeData>);
    }, delayMs);
    return () => clearTimeout(timer);
    // We intentionally depend on the *stringified* patch via JSON so a
    // new object reference each render doesn't immediately reset the
    // timer. Stable shapes (plain string/number values) round-trip
    // cleanly through JSON.stringify.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, delayMs, JSON.stringify(patch), updateNodeData]);
}
