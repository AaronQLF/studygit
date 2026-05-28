"use client";

// Position a fixed-position popover under a trigger element, tracking
// resize/scroll so it stays put when the page reflows underneath it.
// Returns a `{ top, left, width }` rect the consumer applies as inline
// styles. Width is clamped between [minWidth, maxWidth] and the popover
// is shifted into the viewport horizontally if the trigger sits flush
// against the right edge.

import { useCallback, useEffect, useState, type RefObject } from "react";

export type AnchoredPopoverGeom = {
  top: number;
  left: number;
  width: number;
};

export type UseAnchoredPopoverOptions = {
  /** The trigger we're anchoring to. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Whether the popover is currently rendered. */
  open: boolean;
  /** Minimum width of the popover. Defaults to 320. */
  minWidth?: number;
  /** Maximum width of the popover. Defaults to 420. */
  maxWidth?: number;
  /** Pixel gap between the anchor's bottom edge and the popover. Defaults to 6. */
  offsetY?: number;
  /**
   * Lower bound for the popover's top — keeps it from hanging off the
   * bottom of the viewport. Defaults to 320 below the viewport bottom.
   */
  maxViewportFromBottom?: number;
};

export function useAnchoredPopover({
  anchorRef,
  open,
  minWidth = 320,
  maxWidth = 420,
  offsetY = 6,
  maxViewportFromBottom = 320,
}: UseAnchoredPopoverOptions): AnchoredPopoverGeom {
  const [geom, setGeom] = useState<AnchoredPopoverGeom>({
    top: 0,
    left: 0,
    width: minWidth,
  });

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(maxWidth, Math.max(minWidth, rect.width));
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - width - 8
    );
    const top = Math.min(
      rect.bottom + offsetY,
      window.innerHeight - maxViewportFromBottom
    );
    setGeom({ top, left, width });
  }, [anchorRef, minWidth, maxWidth, offsetY, maxViewportFromBottom]);

  useEffect(() => {
    if (!open) return;
    reposition();
    const onResize = () => reposition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, reposition]);

  return geom;
}
