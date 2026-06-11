"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { LayoutGrid, Maximize2, Minimize2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "@/lib/store";
import type { CanvasNode, FloatingPanel } from "@/lib/types";
import { snapGeom, type SnapLayoutId } from "@/lib/snap-layouts";
import { SnapChooserPopover } from "./SnapChooserPopover";
import {
  usePanelDragResize,
  PANEL_MIN_HEIGHT,
  PANEL_MIN_WIDTH,
  VIEWPORT_MARGIN,
  type PanelGeom,
} from "./usePanelDragResize";

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

  const [snapChooserOpen, setSnapChooserOpen] = useState(false);

  // Track the viewport size so snapped panels recompute their geometry
  // on window resize. We only need this when the panel is
  // snapped/maximized; for free panels we skip the listener.
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

  const baseGeom: PanelGeom = useMemo(() => {
    if (panel.snap) {
      const g = snapGeom(
        panel.snap.layout,
        panel.snap.slot,
        viewport.vw,
        viewport.vh
      );
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
    return {
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
    };
  }, [panel, viewport.vw, viewport.vh]);

  const { pendingGeom, snapPreview, onHeaderMouseDown, onResizeMouseDown } =
    usePanelDragResize({
      panel,
      visibleGeom: baseGeom,
      bringPanelFront,
      movePanel,
      resizePanel,
      snapPanel,
    });

  const visibleGeom: PanelGeom =
    !panel.maximized && !panel.snap && pendingGeom ? pendingGeom : baseGeom;

  const kindLabel = node?.data.kind ?? "unknown";
  const formattedKind =
    kindLabel === "pdf"
      ? "PDF"
      : kindLabel.charAt(0).toUpperCase() + kindLabel.slice(1);

  // Pre-compute the preview rectangle for whichever snap zone is
  // currently hovered, so we can render a translucent overlay showing
  // the user exactly where the panel will land on release.
  const snapPreviewGeom: PanelGeom | null = useMemo(() => {
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

  const dragging = !!pendingGeom;

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
            // Same z as the dragged panel: DOM order keeps the preview
            // under its own panel while still floating over the others.
            zIndex: panel.z,
          }}
        />
      ) : null}
      <div
        className={clsx(
          // Positioned `absolute` inside PanelManager's fixed inset-0
          // `.pg-panel-layer` — the layer pins the whole panel stack at
          // one app-level z-index, so the ever-growing per-panel z only
          // competes with sibling panels and can never climb over
          // dialogs/menus (it used to: `60 + panel.z` overtook the
          // theme dialog's z-70 after ten focus clicks).
          //
          // `[-webkit-app-region:no-drag]` keeps Electron's title-bar
          // drag region (defined on the app header above) from
          // swallowing clicks on panel buttons that geometrically
          // overlap the header strip. Without it, the close / maximize
          // / snap buttons in the upper right of a snapped or
          // maximized panel become impossible to hit in the desktop
          // build.
          "absolute pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg)] shadow-[var(--pg-shadow-lg)] [-webkit-app-region:no-drag]",
          dragging && "select-none"
        )}
        style={{
          top: visibleGeom.y,
          left: visibleGeom.x,
          width: visibleGeom.width,
          height: visibleGeom.height,
          zIndex: panel.z,
        }}
        onMouseDown={() => bringPanelFront(panel.id)}
      >
        <header
          onMouseDown={onHeaderMouseDown}
          onDoubleClick={(event) => {
            if ((event.target as HTMLElement).closest("[data-panel-control]"))
              return;
            togglePanelMaximize(panel.id);
          }}
          className={clsx(
            "h-10 shrink-0 border-b border-[var(--pg-border)] px-2.5 flex items-center justify-between",
            panel.maximized
              ? "cursor-default"
              : "cursor-grab active:cursor-grabbing"
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="pg-section-label">{formattedKind}</span>
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
                panel.snap
                  ? "Unsnap"
                  : panel.maximized
                    ? "Restore"
                    : "Maximize"
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
