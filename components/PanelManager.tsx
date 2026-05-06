"use client";

import { useEffect, useMemo } from "react";
import { useStore } from "@/lib/store";
import type { CanvasNode, FloatingPanel } from "@/lib/types";
import { Panel } from "./Panel";
import { LinkPanelBody } from "./panels/LinkPanelBody";
import { ImagePanelBody } from "./panels/ImagePanelBody";
import { NotePanelBody } from "./panels/NotePanelBody";
import { PagePanelBody } from "./panels/PagePanelBody";
import { PdfPanelBody } from "./panels/PdfPanelBody";

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
      return <LinkPanelBody node={node} />;
    case "image":
      return <ImagePanelBody node={node} />;
    case "note":
      return <NotePanelBody node={node} />;
    case "page":
    case "blog":
      return <PagePanelBody node={node} />;
    case "pdf":
      return <PdfPanelBody node={node} />;
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
  const panels = useStore((s) => s.panels);
  const nodes = useStore((s) => s.nodes);
  const workspaces = useStore((s) => s.workspaces);
  const closePanel = useStore((s) => s.closePanel);
  const closeAllPanels = useStore((s) => s.closeAllPanels);

  const visiblePanels = useMemo(() => {
    const knownIds = new Set(nodes.map((n) => n.id));
    return panels.filter((p) => knownIds.has(p.nodeId));
  }, [panels, nodes]);

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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visiblePanels, closePanel, closeAllPanels]);

  if (visiblePanels.length === 0) return null;

  return (
    <>
      {visiblePanels.map((panel) => {
        const node = nodes.find((n) => n.id === panel.nodeId);
        const workspace = node
          ? workspaces.find((w) => w.id === node.workspaceId)
          : undefined;
        return (
          <Panel
            key={panel.id}
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
      })}
    </>
  );
}
