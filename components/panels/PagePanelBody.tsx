"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { usePageZoom } from "@/lib/page-zoom";
import type { CanvasNode, PageNodeData } from "@/lib/types";
import { PageEditor } from "../PageEditor";
import { EditableTitle } from "../nodes/EditableTitle";

export function PagePanelBody({ node }: { node: CanvasNode }) {
  const updateNodeData = useStore((s) => s.updateNodeData);
  const data = node.data as PageNodeData;

  // Page zoom is global to the device (persisted in localStorage by
  // `lib/page-zoom.ts`). PagePanelBody is the canonical "scope" that
  // applies the resulting CSS variable so both the title and the
  // editor body scale together — matches how Notion zooms the whole
  // page, not just the editor area.
  const hydratePageZoom = usePageZoom((s) => s.hydrate);
  const zoom = usePageZoom((s) => s.zoom);
  useEffect(() => {
    hydratePageZoom();
  }, [hydratePageZoom]);

  return (
    <section
      className="pg-page-scope flex-1 min-h-0 flex flex-col"
      style={{ ["--pg-page-zoom" as string]: zoom }}
    >
      <div className="mx-auto w-full max-w-3xl px-8 pt-6 pb-2 shrink-0">
        <EditableTitle
          value={data.title}
          onChange={(next) =>
            updateNodeData(node.id, {
              title: next,
            } as Partial<PageNodeData>)
          }
          placeholder="Untitled page"
          className="pg-page-title font-semibold text-[var(--pg-fg)]"
        />
      </div>
      <div className="flex-1 min-h-0">
        <div className="mx-auto h-full max-w-3xl">
          <PageEditor
            value={data.content}
            onChange={(html) =>
              updateNodeData(node.id, {
                content: html,
              } as Partial<PageNodeData>)
            }
            placeholder="Press / for commands. Try /cite to reference a PDF highlight…"
            showToolbar
            citationContext={{
              sourceNodeId: node.id,
              workspaceId: node.workspaceId,
            }}
          />
        </div>
      </div>
    </section>
  );
}
