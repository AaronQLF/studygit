"use client";

import { useStore } from "@/lib/store";
import type { CanvasNode, PageNodeData } from "@/lib/types";
import { PageEditor } from "../PageEditor";
import { EditableTitle } from "../nodes/EditableTitle";

export function PagePanelBody({ node }: { node: CanvasNode }) {
  const updateNodeData = useStore((s) => s.updateNodeData);
  const data = node.data as PageNodeData;

  return (
    <section className="flex-1 min-h-0 flex flex-col">
      <div className="mx-auto w-full max-w-3xl px-8 pt-6 pb-2 shrink-0">
        <EditableTitle
          value={data.title}
          onChange={(next) =>
            updateNodeData(node.id, {
              title: next,
            } as Partial<PageNodeData>)
          }
          placeholder="Untitled page"
          className="text-3xl font-semibold leading-tight text-[var(--pg-fg)]"
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
            placeholder="Press / for commands. Just start writing…"
            showToolbar
          />
        </div>
      </div>
    </section>
  );
}
