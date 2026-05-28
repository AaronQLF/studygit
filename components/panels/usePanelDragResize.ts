"use client";

// Drag + resize state machine for a floating panel. Owns:
//   - DragState (idle | move | resize)
//   - pending pixel geometry while a drag is in progress (committed on
//     mouseup so we don't write through every mousemove)
//   - snap-zone preview while moving (so the user sees where it will
//     land)
//   - document-level mousemove/mouseup/Escape listeners
//
// Lives in its own file because the 90-line drag effect dominated
// Panel.tsx visually and made the actual panel chrome hard to find.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  findSnapZoneAtPointer,
  type SnapLayoutId,
} from "@/lib/snap-layouts";
import type { FloatingPanel } from "@/lib/types";

export const PANEL_MIN_WIDTH = 360;
export const PANEL_MIN_HEIGHT = 280;
export const VIEWPORT_MARGIN = 12;

export type PanelGeom = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PanelSnapZone = { layout: SnapLayoutId; slot: number };

export type DragState =
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

export type UsePanelDragResizeOptions = {
  panel: FloatingPanel;
  /** Pixel geometry currently shown on screen (snapped/maximized/free). */
  visibleGeom: PanelGeom;
  /** Bring the panel to the front when its header is clicked. */
  bringPanelFront: (id: string) => void;
  movePanel: (id: string, x: number, y: number) => void;
  resizePanel: (id: string, w: number, h: number) => void;
  snapPanel: (id: string, layout: SnapLayoutId, slot: number) => void;
};

export type UsePanelDragResize = {
  /** Pixel geometry while a drag is in progress; null otherwise. */
  pendingGeom: PanelGeom | null;
  /** Snap-zone the cursor is hovering during a move drag. */
  snapPreview: PanelSnapZone | null;
  onHeaderMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onResizeMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

export function usePanelDragResize({
  panel,
  visibleGeom,
  bringPanelFront,
  movePanel,
  resizePanel,
  snapPanel,
}: UsePanelDragResizeOptions): UsePanelDragResize {
  const [drag, setDrag] = useState<DragState>({ type: "idle" });
  const [pendingGeom, setPendingGeom] = useState<PanelGeom | null>(null);
  const [snapPreview, setSnapPreview] = useState<PanelSnapZone | null>(null);

  const stateRef = useRef({ drag, pendingGeom, panel, snapPreview });
  useEffect(() => {
    stateRef.current = { drag, pendingGeom, panel, snapPreview };
  });

  useEffect(() => {
    if (drag.type === "idle") return;
    document.documentElement.dataset.panelDragging = "true";
    const onMove = (event: globalThis.MouseEvent) => {
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
        const nextY = Math.max(0, Math.min(vh - 32, cur.panelStartY + dy));
        setPendingGeom({ x: nextX, y: nextY, width: w, height: h });
        // Snap-zone preview tracks the pointer (not the panel header)
        // because the header has moved off-screen by the time the user
        // pushes against the bottom or right edge of the viewport.
        //
        // Default behavior is edge-snap only (see findSnapZoneAtPointer
        // — the pointer must be within SNAP_EDGE_THRESHOLD of a
        // viewport edge to arm the preview). Holding Shift while
        // dragging force-snaps from anywhere on the screen.
        const zone = findSnapZoneAtPointer(
          event.clientX,
          event.clientY,
          vw,
          vh,
          { force: event.shiftKey }
        );
        const prev = stateRef.current.snapPreview;
        if (zone?.layout !== prev?.layout || zone?.slot !== prev?.slot) {
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
        // Drag ended inside a snap zone — commit the snap and discard
        // the free-floating pending geometry so movePanel doesn't fight
        // it.
        snapPanel(stateRef.current.panel.id, zone.layout, zone.slot);
      } else if (pending) {
        if (cur.type === "move") {
          movePanel(stateRef.current.panel.id, pending.x, pending.y);
        } else if (cur.type === "resize") {
          resizePanel(
            stateRef.current.panel.id,
            pending.width,
            pending.height
          );
        }
      }
      setDrag({ type: "idle" });
      setPendingGeom(null);
      setSnapPreview(null);
    };
    const onCancel = () => {
      // Esc while dragging cancels the move — drop pending geometry and
      // the snap preview without persisting anything.
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
      delete document.documentElement.dataset.panelDragging;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keydown", onKey);
    };
  }, [drag.type, movePanel, resizePanel, snapPanel]);

  const onHeaderMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
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
    (event: ReactMouseEvent<HTMLDivElement>) => {
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

  return { pendingGeom, snapPreview, onHeaderMouseDown, onResizeMouseDown };
}
