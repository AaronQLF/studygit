"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import type { CanvasNode, FloatingPanel } from "@/lib/types";

const PANEL_MIN_WIDTH = 360;
const PANEL_MIN_HEIGHT = 280;
const VIEWPORT_MARGIN = 12;

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
  const bringPanelFront = useStore((s) => s.bringPanelFront);
  const totalPanels = useStore((s) => s.panels.length);

  const [drag, setDrag] = useState<DragState>({ type: "idle" });
  const [pendingGeom, setPendingGeom] = useState<Geom | null>(null);

  const stateRef = useRef({ drag, pendingGeom, panel });
  stateRef.current = { drag, pendingGeom, panel };

  const visibleGeom: Geom = useMemo(() => {
    if (panel.maximized) {
      const vw =
        typeof window !== "undefined" ? window.innerWidth : panel.width;
      const vh =
        typeof window !== "undefined" ? window.innerHeight : panel.height;
      return {
        x: VIEWPORT_MARGIN,
        y: VIEWPORT_MARGIN,
        width: Math.max(PANEL_MIN_WIDTH, vw - 2 * VIEWPORT_MARGIN),
        height: Math.max(PANEL_MIN_HEIGHT, vh - 2 * VIEWPORT_MARGIN),
      };
    }
    if (pendingGeom) return pendingGeom;
    return {
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
    };
  }, [panel, pendingGeom]);

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
      if (pending) {
        if (cur.type === "move") {
          movePanel(stateRef.current.panel.id, pending.x, pending.y);
        } else if (cur.type === "resize") {
          resizePanel(stateRef.current.panel.id, pending.width, pending.height);
        }
      }
      setDrag({ type: "idle" });
      setPendingGeom(null);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [drag.type, movePanel, resizePanel]);

  const onHeaderMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest("[data-panel-control]")) return;
      bringPanelFront(panel.id);
      if (panel.maximized) return;
      setDrag({
        type: "move",
        pointerStartX: event.clientX,
        pointerStartY: event.clientY,
        panelStartX: panel.x,
        panelStartY: panel.y,
      });
      event.preventDefault();
    },
    [bringPanelFront, panel.id, panel.maximized, panel.x, panel.y]
  );

  const onResizeMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      bringPanelFront(panel.id);
      if (panel.maximized) return;
      setDrag({
        type: "resize",
        pointerStartX: event.clientX,
        pointerStartY: event.clientY,
        panelStartW: panel.width,
        panelStartH: panel.height,
      });
      event.preventDefault();
      event.stopPropagation();
    },
    [bringPanelFront, panel.id, panel.maximized, panel.width, panel.height]
  );

  const kindLabel = node?.data.kind ?? "unknown";

  return (
    <div
      className={clsx(
        "fixed flex flex-col overflow-hidden rounded-xl border border-[var(--pg-border)] bg-[var(--pg-bg)] shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
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
          "h-11 shrink-0 border-b border-[var(--pg-border)] px-3 flex items-center justify-between",
          panel.maximized ? "cursor-default" : "cursor-grab active:cursor-grabbing"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
            {kindLabel}
          </span>
          {title ? (
            <span className="truncate text-[12px] text-zinc-200">{title}</span>
          ) : null}
          {workspaceName ? (
            <span className="truncate text-[11px] font-mono text-zinc-600">
              · {workspaceName}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {totalPanels > 1 ? (
            <span
              className="hidden text-[10px] font-mono text-zinc-600 sm:inline"
              title={`${totalPanels} panels open`}
            >
              {totalPanels} open
            </span>
          ) : null}
          <button
            data-panel-control
            type="button"
            onClick={() => togglePanelMaximize(panel.id)}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-[var(--pg-bg-elevated)] hover:text-zinc-100"
            title={panel.maximized ? "Restore" : "Maximize"}
          >
            {panel.maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            data-panel-control
            type="button"
            onClick={() => closePanel(panel.id)}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-red-500/15 hover:text-red-300"
            title="Close panel"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>

      {!panel.maximized ? (
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          title="Drag to resize"
          aria-label="Resize panel"
          data-panel-control
        >
          <svg
            className="h-full w-full text-zinc-600"
            viewBox="0 0 16 16"
            aria-hidden
          >
            <path d="M16 16H10L16 10ZM16 16H6L16 6Z" fill="currentColor" />
          </svg>
        </div>
      ) : null}
    </div>
  );
}
