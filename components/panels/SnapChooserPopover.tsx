"use client";

// Windows-11-style snap layout picker. Each layout renders as a
// thumbnail grid: hover a slot to preview, click to snap. The chooser
// closes after any pick or when the user clicks outside it.

import { useRef, useState } from "react";
import clsx from "clsx";
import {
  SNAP_LAYOUTS,
  SNAP_LAYOUT_ORDER,
  type SnapLayoutId,
} from "@/lib/snap-layouts";
import { useDismissOnOutside } from "@/lib/hooks/use-dismiss-on-outside";

export type SnapPickHandler = (layout: SnapLayoutId, slot: number) => void;

export type SnapChooserPopoverProps = {
  activeSnap: { layout: SnapLayoutId; slot: number } | null;
  otherSnaps: Array<{ layout: SnapLayoutId; slot: number }>;
  onPick: SnapPickHandler;
  onUnsnap: () => void;
  onClose: () => void;
};

export function SnapChooserPopover({
  activeSnap,
  otherSnaps,
  onPick,
  onUnsnap,
  onClose,
}: SnapChooserPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDismissOnOutside({
    open: true,
    onDismiss: onClose,
    refs: [ref],
    escape: false,
  });

  return (
    <div
      ref={ref}
      data-panel-control
      onMouseDown={(event) => event.stopPropagation()}
      className="absolute right-0 top-[calc(100%+6px)] z-[200] w-[280px] rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg-elevated)] p-3 shadow-[var(--pg-shadow-lg)]"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-[var(--pg-muted)]">
          Snap layout
        </span>
        {activeSnap ? (
          <button
            type="button"
            onClick={onUnsnap}
            className="rounded-md px-1.5 py-0.5 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg)] hover:text-[var(--pg-fg)]"
          >
            Unsnap
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SNAP_LAYOUT_ORDER.map((layoutId) => (
          <SnapLayoutThumb
            key={layoutId}
            layoutId={layoutId}
            activeSnap={activeSnap}
            otherSnaps={otherSnaps}
            onPick={onPick}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--pg-muted)]">
        Click a cell to fill that quadrant. Dragging the panel unsnaps it.
      </p>
    </div>
  );
}

function SnapLayoutThumb({
  layoutId,
  activeSnap,
  otherSnaps,
  onPick,
}: {
  layoutId: SnapLayoutId;
  activeSnap: { layout: SnapLayoutId; slot: number } | null;
  otherSnaps: Array<{ layout: SnapLayoutId; slot: number }>;
  onPick: SnapPickHandler;
}) {
  const def = SNAP_LAYOUTS[layoutId];
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10.5px] text-[var(--pg-muted)]">{def.label}</div>
      <div
        className="relative aspect-[16/10] overflow-hidden rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg)]"
        onMouseLeave={() => setHoverSlot(null)}
      >
        {def.slots.map((slot, slotIndex) => {
          const isActive =
            activeSnap?.layout === layoutId && activeSnap.slot === slotIndex;
          const isOtherOccupied = otherSnaps.some(
            (o) => o.layout === layoutId && o.slot === slotIndex
          );
          const isHover = hoverSlot === slotIndex;
          return (
            <button
              key={slotIndex}
              type="button"
              onMouseEnter={() => setHoverSlot(slotIndex)}
              onClick={() => onPick(layoutId, slotIndex)}
              className={clsx(
                "absolute border transition-colors",
                isActive
                  ? "border-[var(--pg-accent)] bg-[color-mix(in_srgb,var(--pg-accent)_25%,transparent)]"
                  : isHover
                  ? "border-[var(--pg-accent)] bg-[color-mix(in_srgb,var(--pg-accent)_15%,transparent)]"
                  : isOtherOccupied
                  ? "border-[var(--pg-border-strong)] bg-[var(--pg-bg-subtle)]"
                  : "border-[var(--pg-border)] bg-transparent hover:border-[var(--pg-border-strong)]"
              )}
              style={{
                left: `calc(${slot.x * 100}% + 2px)`,
                top: `calc(${slot.y * 100}% + 2px)`,
                width: `calc(${slot.w * 100}% - 4px)`,
                height: `calc(${slot.h * 100}% - 4px)`,
              }}
              title={`Slot ${slotIndex + 1}`}
            />
          );
        })}
      </div>
    </div>
  );
}
