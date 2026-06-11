"use client";

// Draw-boxes-over-an-image editor for occlusion cards. Drag to add a
// covered region, click a region's × to remove it. Rects are stored
// normalized to [0,1] (same shape as PDF highlight rects) so they stay
// glued to the image at any rendered size.

import { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";
import type { PdfHighlightRect } from "@/lib/types";

const MIN_SIZE = 0.015;

export function ImageOcclusionEditor({
  imageUrl,
  rects,
  onChange,
}: {
  imageUrl: string;
  rects: PdfHighlightRect[];
  onChange: (next: PdfHighlightRect[]) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<PdfHighlightRect | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const pointFromEvent = useCallback((event: React.PointerEvent): {
    x: number;
    y: number;
  } | null => {
    const el = wrapperRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }, []);

  const rectFrom = (
    a: { x: number; y: number },
    b: { x: number; y: number }
  ): PdfHighlightRect => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  });

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const point = pointFromEvent(event);
    if (!point) return;
    dragStartRef.current = point;
    setDraft({ ...point, width: 0, height: 0 });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const start = dragStartRef.current;
    if (!start) return;
    const point = pointFromEvent(event);
    if (!point) return;
    setDraft(rectFrom(start, point));
  };

  const onPointerUp = () => {
    const finished = draft;
    dragStartRef.current = null;
    setDraft(null);
    if (finished && finished.width > MIN_SIZE && finished.height > MIN_SIZE) {
      onChange([...rects, finished]);
    }
  };

  return (
    <div className="space-y-1.5">
      <div
        ref={wrapperRef}
        className="relative inline-block max-w-full cursor-crosshair touch-none select-none overflow-hidden rounded-[var(--pg-radius-md)] border border-[var(--pg-border)]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Diagram to occlude"
          draggable={false}
          className="block max-h-[320px] w-auto max-w-full"
        />
        {rects.map((r, i) => (
          <span
            key={i}
            className="group absolute rounded-[3px] bg-[var(--pg-study)]/85"
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.width * 100}%`,
              height: `${r.height * 100}%`,
            }}
          >
            <button
              type="button"
              className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white shadow group-hover:flex"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onChange(rects.filter((_, idx) => idx !== i));
              }}
              title="Remove this cover"
            >
              <X size={9} />
            </button>
          </span>
        ))}
        {draft ? (
          <span
            className="absolute rounded-[3px] border-2 border-dashed border-[var(--pg-study)] bg-[var(--pg-study)]/30"
            style={{
              left: `${draft.x * 100}%`,
              top: `${draft.y * 100}%`,
              width: `${draft.width * 100}%`,
              height: `${draft.height * 100}%`,
            }}
          />
        ) : null}
      </div>
      <p className="text-[11px] text-[var(--pg-muted)]">
        Drag to cover a label or region · hover a cover and hit × to remove it
        {rects.length > 0 ? ` · ${rects.length} covered` : ""}
      </p>
    </div>
  );
}
