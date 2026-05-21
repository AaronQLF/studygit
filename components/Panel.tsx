"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { LayoutGrid, Maximize2, Minimize2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "@/lib/store";
import type { CanvasNode, FloatingPanel } from "@/lib/types";
import {
  SNAP_LAYOUTS,
  SNAP_LAYOUT_ORDER,
  snapGeom,
  type SnapLayoutId,
} from "@/lib/snap-layouts";

const PANEL_MIN_WIDTH = 360;
const PANEL_MIN_HEIGHT = 280;
const VIEWPORT_MARGIN = 12;

// Drag-to-snap hot-zones. Windows-11 / FancyZones style: dragging the
// header into one of these rectangles previews a snap target and lands
// the panel into the matching slot on release.
//   EDGE   — strip along each viewport edge → halves / fullscreen
//   CORNER — square at each viewport corner → quadrants
// Corners win when they overlap an edge so the user can always reach
// every quadrant without surgical aim.
const EDGE_SNAP_THRESHOLD = 18;
const CORNER_SNAP_THRESHOLD = 96;

type SnapZone = { layout: SnapLayoutId; slot: number };

function detectSnapZone(
  pointerX: number,
  pointerY: number,
  vw: number,
  vh: number
): SnapZone | null {
  const nearTop = pointerY < CORNER_SNAP_THRESHOLD;
  const nearBottom = pointerY > vh - CORNER_SNAP_THRESHOLD;
  const nearLeft = pointerX < CORNER_SNAP_THRESHOLD;
  const nearRight = pointerX > vw - CORNER_SNAP_THRESHOLD;
  if (nearTop && nearLeft) return { layout: "quads", slot: 0 };
  if (nearTop && nearRight) return { layout: "quads", slot: 1 };
  if (nearBottom && nearLeft) return { layout: "quads", slot: 2 };
  if (nearBottom && nearRight) return { layout: "quads", slot: 3 };
  if (pointerY < EDGE_SNAP_THRESHOLD) return { layout: "full", slot: 0 };
  if (pointerX < EDGE_SNAP_THRESHOLD) return { layout: "halves-h", slot: 0 };
  if (pointerX > vw - EDGE_SNAP_THRESHOLD)
    return { layout: "halves-h", slot: 1 };
  if (pointerY > vh - EDGE_SNAP_THRESHOLD)
    return { layout: "halves-v", slot: 1 };
  return null;
}

type DragState =
  | { type: "idle" }
  | {
      type: "move";
      pointerStartX: number;
      pointerStartY: number;
      panelStartX: number;
      panelStartY: number;
    }
  | {
      type: "resize";
      pointerStartX: number;
      pointerStartY: number;
      panelStartW: number;
      panelStartH: number;
    };

type Geom = { x: number; y: number; width: number; height: number };

export type PanelProps = {
  panel: FloatingPanel;
  node: CanvasNode | undefined;
  title: string;
  workspaceName?: string;
  children: React.ReactNode;
};

export function Panel({
  panel,
  node,
  title,
  workspaceName,
  children,
}: PanelProps) {
  const movePanel = useStore((s) => s.movePanel);
  const resizePanel = useStore((s) => s.resizePanel);
  const closePanel = useStore((s) => s.closePanel);
  const togglePanelMaximize = useStore((s) => s.togglePanelMaximize);
  const snapPanel = useStore((s) => s.snapPanel);
  const unsnapPanel = useStore((s) => s.unsnapPanel);
  const bringPanelFront = useStore((s) => s.bringPanelFront);
  const totalPanels = useStore((s) => s.panels.length);
  // Only resubscribe when another panel's snap *assignment* changes. The
  // chooser uses these to grey out occupied slots; we don't care about
  // move/resize/z changes from siblings.
  const otherSnaps = useStore(
    useShallow((s) =>
      s.panels
        .filter((p) => p.id !== panel.id && p.snap)
        .map((p) => `${p.snap!.layout}:${p.snap!.slot}`)
    )
  );

  const [drag, setDrag] = useState<DragState>({ type: "idle" });
  const [pendingGeom, setPendingGeom] = useState<Geom | null>(null);
  const [snapChooserOpen, setSnapChooserOpen] = useState(false);
  // Currently-hovered snap zone while a drag is in progress. Rendered as a
  // translucent overlay; commits on mouseup.
  const [snapPreview, setSnapPreview] = useState<SnapZone | null>(null);

  // Track the viewport size so snapped panels recompute their geometry on
  // window resize. We only need this when the panel is snapped/maximized;
  // for free panels we skip the listener.
  const [viewport, setViewport] = useState(() =>
    typeof window === "undefined"
      ? { vw: 1280, vh: 800 }
      : { vw: window.innerWidth, vh: window.innerHeight }
  );
  useEffect(() => {
    if (!panel.maximized && !panel.snap) return;
    const onResize = () =>
      setViewport({ vw: window.innerWidth, vh: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [panel.maximized, panel.snap]);

  const stateRef = useRef({ drag, pendingGeom, panel, snapPreview });
  useEffect(() => {
    stateRef.current = { drag, pendingGeom, panel, snapPreview };
  });

  const visibleGeom: Geom = useMemo(() => {
    if (panel.snap) {
      const g = snapGeom(panel.snap.layout, panel.snap.slot, viewport.vw, viewport.vh);
      if (g) {
        return {
          x: g.x,
          y: g.y,
          width: Math.max(PANEL_MIN_WIDTH, g.width),
          height: Math.max(PANEL_MIN_HEIGHT, g.height),
        };
      }
    }
    if (panel.maximized) {
      return {
        x: VIEWPORT_MARGIN,
        y: VIEWPORT_MARGIN,
        width: Math.max(PANEL_MIN_WIDTH, viewport.vw - 2 * VIEWPORT_MARGIN),
        height: Math.max(PANEL_MIN_HEIGHT, viewport.vh - 2 * VIEWPORT_MARGIN),
      };
    }
    if (pendingGeom) return pendingGeom;
    return {
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
    };
  }, [panel, pendingGeom, viewport.vw, viewport.vh]);

  // Drag handlers (document-level so the cursor can leave the header)
  useEffect(() => {
    if (drag.type === "idle") return;
    const onMove = (event: MouseEvent) => {
      const cur = stateRef.current.drag;
      if (cur.type === "move") {
        const dx = event.clientX - cur.pointerStartX;
        const dy = event.clientY - cur.pointerStartY;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const w = stateRef.current.panel.width;
        const h = stateRef.current.panel.height;
        const nextX = Math.max(
          -w + 64,
          Math.min(vw - 64, cur.panelStartX + dx)
        );
        const nextY = Math.max(
          0,
          Math.min(vh - 32, cur.panelStartY + dy)
        );
        setPendingGeom({ x: nextX, y: nextY, width: w, height: h });
        // Snap-zone preview tracks the pointer (not the panel header)
        // because the header has moved off-screen by the time the user
        // pushes against the bottom or right edge of the viewport.
        const zone = detectSnapZone(event.clientX, event.clientY, vw, vh);
        const prev = stateRef.current.snapPreview;
        if (
          zone?.layout !== prev?.layout ||
          zone?.slot !== prev?.slot
        ) {
          setSnapPreview(zone);
        }
      } else if (cur.type === "resize") {
        const dw = event.clientX - cur.pointerStartX;
        const dh = event.clientY - cur.pointerStartY;
        const x = stateRef.current.panel.x;
        const y = stateRef.current.panel.y;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const nextW = Math.max(
          PANEL_MIN_WIDTH,
          Math.min(vw - x - VIEWPORT_MARGIN, cur.panelStartW + dw)
        );
        const nextH = Math.max(
          PANEL_MIN_HEIGHT,
          Math.min(vh - y - VIEWPORT_MARGIN, cur.panelStartH + dh)
        );
        setPendingGeom({ x, y, width: nextW, height: nextH });
      }
    };
    const onUp = () => {
      const cur = stateRef.current.drag;
      const pending = stateRef.current.pendingGeom;
      const zone = stateRef.current.snapPreview;
      if (cur.type === "move" && zone) {
        // Drag ended inside a snap zone — commit the snap and discard the
        // free-floating pending geometry so movePanel doesn't fight it.
        snapPanel(stateRef.current.panel.id, zone.layout, zone.slot);
      } else if (pending) {
        if (cur.type === "move") {
          movePanel(stateRef.current.panel.id, pending.x, pending.y);
        } else if (cur.type === "resize") {
          resizePanel(stateRef.current.panel.id, pending.width, pending.height);
        }
      }
      setDrag({ type: "idle" });
      setPendingGeom(null);
      setSnapPreview(null);
    };
    const onCancel = () => {
      // ESC while dragging cancels the move — drop pending geometry and the
      // snap preview without persisting anything.
      setDrag({ type: "idle" });
      setPendingGeom(null);
      setSnapPreview(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keydown", onKey);
    };
  }, [drag.type, movePanel, resizePanel, snapPanel]);

  const onHeaderMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest("[data-panel-control]")) return;
      bringPanelFront(panel.id);
      if (panel.maximized) return;
      // If the panel is snapped, materialize the snap rectangle as the
      // panel's free coords first so the drag starts from where it sits
      // on screen. movePanel + resizePanel both clear `snap`.
      let startX = panel.x;
      let startY = panel.y;
      if (panel.snap) {
        startX = visibleGeom.x;
        startY = visibleGeom.y;
        resizePanel(panel.id, visibleGeom.width, visibleGeom.height);
        movePanel(panel.id, startX, startY);
      }
      setDrag({
        type: "move",
        pointerStartX: event.clientX,
        pointerStartY: event.clientY,
        panelStartX: startX,
        panelStartY: startY,
      });
      event.preventDefault();
    },
    [
      bringPanelFront,
      movePanel,
      panel.id,
      panel.maximized,
      panel.snap,
      panel.x,
      panel.y,
      resizePanel,
      visibleGeom.height,
      visibleGeom.width,
      visibleGeom.x,
      visibleGeom.y,
    ]
  );

  const onResizeMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      bringPanelFront(panel.id);
      if (panel.maximized) return;
      // Same materialize-on-grab trick as move: unsnap and start the
      // resize from the slot's pixel dimensions.
      let startW = panel.width;
      let startH = panel.height;
      if (panel.snap) {
        startW = visibleGeom.width;
        startH = visibleGeom.height;
        movePanel(panel.id, visibleGeom.x, visibleGeom.y);
        resizePanel(panel.id, startW, startH);
      }
      setDrag({
        type: "resize",
        pointerStartX: event.clientX,
        pointerStartY: event.clientY,
        panelStartW: startW,
        panelStartH: startH,
      });
      event.preventDefault();
      event.stopPropagation();
    },
    [
      bringPanelFront,
      movePanel,
      panel.id,
      panel.maximized,
      panel.snap,
      panel.width,
      panel.height,
      resizePanel,
      visibleGeom.height,
      visibleGeom.width,
      visibleGeom.x,
      visibleGeom.y,
    ]
  );

  const kindLabel = node?.data.kind ?? "unknown";
  const formattedKind =
    kindLabel === "pdf"
      ? "PDF"
      : kindLabel.charAt(0).toUpperCase() + kindLabel.slice(1);

  // Pre-compute the preview rectangle for whichever snap zone is currently
  // hovered, so we can render a translucent overlay showing the user
  // exactly where the panel will land on release.
  const snapPreviewGeom: Geom | null = useMemo(() => {
    if (!snapPreview) return null;
    const g = snapGeom(
      snapPreview.layout,
      snapPreview.slot,
      viewport.vw,
      viewport.vh
    );
    if (!g) return null;
    return {
      x: g.x,
      y: g.y,
      width: Math.max(PANEL_MIN_WIDTH, g.width),
      height: Math.max(PANEL_MIN_HEIGHT, g.height),
    };
  }, [snapPreview, viewport.vw, viewport.vh]);

  return (
    <>
      {snapPreviewGeom ? (
        <div
          aria-hidden
          className="pg-snap-preview"
          style={{
            top: snapPreviewGeom.y,
            left: snapPreviewGeom.x,
            width: snapPreviewGeom.width,
            height: snapPreviewGeom.height,
            // Float just under the dragged panel itself so the panel header
            // stays visible on top of the indicator while the user is
            // sweeping it across the viewport.
            zIndex: 59 + panel.z,
          }}
        />
      ) : null}
      <div
        className={clsx(
          // `[-webkit-app-region:no-drag]` keeps Electron's title-bar drag
          // region (defined on the app header above) from swallowing clicks
          // on panel buttons that geometrically overlap the header strip.
          // Without it, the close / maximize / snap buttons in the upper
          // right of a snapped or maximized panel become impossible to hit
          // in the desktop build.
          "fixed flex flex-col overflow-hidden rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg)] shadow-[var(--pg-shadow-lg)] [-webkit-app-region:no-drag]",
          drag.type !== "idle" && "select-none"
        )}
        style={{
          top: visibleGeom.y,
          left: visibleGeom.x,
          width: visibleGeom.width,
          height: visibleGeom.height,
          zIndex: 60 + panel.z,
        }}
        onMouseDown={() => bringPanelFront(panel.id)}
      >
      <header
        onMouseDown={onHeaderMouseDown}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest("[data-panel-control]")) return;
          togglePanelMaximize(panel.id);
        }}
        className={clsx(
          "h-10 shrink-0 border-b border-[var(--pg-border)] px-2.5 flex items-center justify-between",
          panel.maximized ? "cursor-default" : "cursor-grab active:cursor-grabbing"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="pg-section-label">
            {formattedKind}
          </span>
          {title ? (
            <>
              <span className="text-[var(--pg-muted-soft)]">·</span>
              <span className="pg-serif truncate text-[13px] text-[var(--pg-fg)]">
                {title}
              </span>
            </>
          ) : null}
          {workspaceName ? (
            <span className="truncate text-[11px] text-[var(--pg-muted)]">
              · {workspaceName}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5">
          {totalPanels > 1 ? (
            <span
              className="hidden text-[11px] text-[var(--pg-muted)] mr-1 sm:inline"
              title={`${totalPanels} panels open`}
            >
              {totalPanels} open
            </span>
          ) : null}
          <div className="relative" data-panel-control>
            <button
              data-panel-control
              type="button"
              onClick={() => setSnapChooserOpen((v) => !v)}
              className={clsx(
                "inline-flex h-7 w-7 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]",
                (panel.snap || snapChooserOpen) &&
                  "bg-[var(--pg-bg-elevated)] text-[var(--pg-fg)]"
              )}
              title="Snap layout"
            >
              <LayoutGrid size={13} />
            </button>
            {snapChooserOpen ? (
              <SnapChooserPopover
                activeSnap={panel.snap ?? null}
                otherSnaps={otherSnaps.map((key) => {
                  const [layout, slot] = key.split(":");
                  return {
                    layout: layout as SnapLayoutId,
                    slot: Number(slot),
                  };
                })}
                onPick={(layout, slot) => {
                  snapPanel(panel.id, layout, slot);
                  setSnapChooserOpen(false);
                }}
                onUnsnap={() => {
                  unsnapPanel(panel.id);
                  setSnapChooserOpen(false);
                }}
                onClose={() => setSnapChooserOpen(false)}
              />
            ) : null}
          </div>
          <button
            data-panel-control
            type="button"
            onClick={() => {
              if (panel.snap) {
                unsnapPanel(panel.id);
                return;
              }
              togglePanelMaximize(panel.id);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            title={
              panel.snap ? "Unsnap" : panel.maximized ? "Restore" : "Maximize"
            }
          >
            {panel.maximized || panel.snap ? (
              <Minimize2 size={13} />
            ) : (
              <Maximize2 size={13} />
            )}
          </button>
          <button
            data-panel-control
            type="button"
            onClick={() => closePanel(panel.id)}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-red-500/10 hover:text-red-500"
            title="Close panel"
          >
            <span className="pg-serif text-[17px] leading-none">×</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>

      {!panel.maximized && !panel.snap ? (
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          title="Drag to resize"
          aria-label="Resize panel"
          data-panel-control
        >
          <span
            className="absolute bottom-0.5 right-0.5 block h-3 w-3 text-[var(--pg-muted-soft)]"
            aria-hidden
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 3px)",
            }}
          />
        </div>
      ) : null}
    </div>
    </>
  );
}

// Windows-11-style snap layout picker. Each layout renders as a thumbnail
// grid: hover a slot to preview, click to snap. The chooser closes after
// any pick or when the user clicks outside it.
type SnapPickHandler = (layout: SnapLayoutId, slot: number) => void;

function SnapChooserPopover({
  activeSnap,
  otherSnaps,
  onPick,
  onUnsnap,
  onClose,
}: {
  activeSnap: { layout: SnapLayoutId; slot: number } | null;
  otherSnaps: Array<{ layout: SnapLayoutId; slot: number }>;
  onPick: SnapPickHandler;
  onUnsnap: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (ref.current && !ref.current.contains(target)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

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
