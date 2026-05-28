"use client";

import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "@/lib/store";
import type { CanvasNode, FloatingPanel } from "@/lib/types";
import { Panel } from "./Panel";
import { ImagePanelBody } from "./ImagePanelBody";
import { NotePanelBody } from "./NotePanelBody";
import {
  LazyAiAnswerPanelBody,
  LazyLinkPanelBody,
  LazyPagePanelBody,
  LazyPdfPanelBody,
} from "./lazyBodies";

function nodeTitle(node: CanvasNode | undefined): string {
  if (!node) return "";
  const data = node.data;
  if ("title" in data && typeof data.title === "string") return data.title;
  if (data.kind === "note") return data.text.slice(0, 60).trim();
  if (data.kind === "image") return data.caption ?? data.url;
  return "";
}

function PanelBody({ node }: { node: CanvasNode }) {
  switch (node.data.kind) {
    case "link":
      return <LazyLinkPanelBody node={node} />;
    case "image":
      return <ImagePanelBody node={node} />;
    case "note":
      return <NotePanelBody node={node} />;
    case "page":
    case "blog":
      return <LazyPagePanelBody node={node} />;
    case "pdf":
      return <LazyPdfPanelBody node={node} />;
    case "ai":
      return <LazyAiAnswerPanelBody node={node} />;
    default:
      return (
        <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--pg-muted)]">
          Unsupported node kind
        </div>
      );
  }
}

function topPanelId(panels: FloatingPanel[]): string | null {
  if (panels.length === 0) return null;
  let top = panels[0];
  for (let i = 1; i < panels.length; i++) {
    if (panels[i].z > top.z) top = panels[i];
  }
  return top.id;
}

export function PanelManager() {
  // Subscribe to only the slices PanelManager actually needs to render.
  // Critically, do NOT subscribe to `s.nodes` directly — that would
  // re-render the manager (and every open panel) on every keystroke.
  // Instead, useShallow returns a stable list of node IDs that only
  // changes when nodes are added/removed/reordered. The per-panel `node`
  // lookup happens inside PanelHost via its own narrow subscription.
  const panels = useStore(useShallow((s) => s.panels));
  const knownNodeIds = useStore(
    useShallow((s) => s.nodes.map((n) => n.id))
  );
  const workspaces = useStore(useShallow((s) => s.workspaces));
  const closePanel = useStore((s) => s.closePanel);
  const closeAllPanels = useStore((s) => s.closeAllPanels);
  const snapPanel = useStore((s) => s.snapPanel);
  const unsnapPanel = useStore((s) => s.unsnapPanel);
  const togglePanelMaximize = useStore((s) => s.togglePanelMaximize);

  const visiblePanels = useMemo(() => {
    const knownIds = new Set(knownNodeIds);
    return panels.filter((p) => knownIds.has(p.nodeId));
  }, [panels, knownNodeIds]);

  useEffect(() => {
    if (visiblePanels.length === 0) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (event.key === "Escape" && !typing) {
        if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          closeAllPanels();
          return;
        }
        const topId = topPanelId(visiblePanels);
        if (topId) {
          event.preventDefault();
          closePanel(topId);
        }
      }

      // Windows-style snap shortcuts on the top (focused) panel.
      //   Cmd/Ctrl + Alt + ArrowLeft   → snap to left half
      //   Cmd/Ctrl + Alt + ArrowRight  → snap to right half
      //   Cmd/Ctrl + Alt + ArrowUp     → maximize (fullscreen snap)
      //   Cmd/Ctrl + Alt + ArrowDown   → unsnap / restore
      // Skip when the user is typing so they don't fight with editor undo,
      // selection, etc.
      const isArrow =
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown";
      if (!typing && isArrow && (event.metaKey || event.ctrlKey) && event.altKey) {
        const topId = topPanelId(visiblePanels);
        if (!topId) return;
        event.preventDefault();
        if (event.key === "ArrowLeft") {
          snapPanel(topId, "halves-h", 0);
        } else if (event.key === "ArrowRight") {
          snapPanel(topId, "halves-h", 1);
        } else if (event.key === "ArrowUp") {
          const target = visiblePanels.find((p) => p.id === topId);
          if (target?.snap?.layout === "full") {
            unsnapPanel(topId);
          } else if (target?.maximized) {
            togglePanelMaximize(topId);
          } else {
            snapPanel(topId, "full", 0);
          }
        } else if (event.key === "ArrowDown") {
          const target = visiblePanels.find((p) => p.id === topId);
          if (target?.snap) {
            unsnapPanel(topId);
          } else if (target?.maximized) {
            togglePanelMaximize(topId);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    visiblePanels,
    closePanel,
    closeAllPanels,
    snapPanel,
    unsnapPanel,
    togglePanelMaximize,
  ]);

  if (visiblePanels.length === 0) return null;

  return (
    <>
      {visiblePanels.map((panel) => (
        <PanelHost key={panel.id} panel={panel} workspaces={workspaces} />
      ))}
    </>
  );
}

// Per-panel host: owns the narrow subscription for *just this panel's*
// node, so an edit to node A doesn't re-render the panel hosting node B.
// PanelManager doesn't touch `s.nodes` for content; it only sees the
// stable ID list.
function PanelHost({
  panel,
  workspaces,
}: {
  panel: FloatingPanel;
  workspaces: Array<{ id: string; name: string }>;
}) {
  const node = useStore((s) => s.nodes.find((n) => n.id === panel.nodeId));
  const workspace = node
    ? workspaces.find((w) => w.id === node.workspaceId)
    : undefined;
  return (
    <Panel
      panel={panel}
      node={node}
      title={nodeTitle(node)}
      workspaceName={workspace?.name}
    >
      {node ? (
        <PanelBody node={node} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--pg-muted)]">
          Node no longer exists
        </div>
      )}
    </Panel>
  );
}
