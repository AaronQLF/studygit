"use client";

import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useStore } from "@/lib/store";
import { usePageZoom } from "@/lib/page-zoom";
import type { CanvasNode, PageNodeData } from "@/lib/types";
import {
  PageEditor,
  PageEditorToolbar,
  type PageEditorHandle,
} from "@/components/editors/PageEditor";
import { EditableTitle } from "@/components/ui/EditableTitle";

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

  // The formatting toolbar now lives at the top of the panel (full
  // width, directly under the panel header) instead of inline above the
  // editor body. We capture the editor instance via a callback ref —
  // React invokes it whenever PageEditor's imperative handle changes
  // (mount, editor-ready, unmount), so we re-render the toolbar in step
  // with the editor's lifecycle.
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorRef = useCallback((handle: PageEditorHandle | null) => {
    setEditor(handle?.editor ?? null);
  }, []);

  return (
    <section
      className="pg-page-scope flex-1 min-h-0 flex flex-col"
      style={{ ["--pg-page-zoom" as string]: zoom }}
    >
      {/* Formatting toolbar — pinned directly under the panel header,
          full width, before the page title (Notion-style doc chrome). */}
      <div className="shrink-0 border-b border-[var(--pg-border)]/50 bg-[var(--pg-bg)]">
        {editor ? (
          <PageEditorToolbar editor={editor} />
        ) : (
          <div className="h-8" aria-hidden />
        )}
      </div>

      <div className="mx-auto w-full max-w-3xl px-8 pt-8 pb-1 shrink-0">
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
            ref={editorRef}
            value={data.content}
            onChange={(html) =>
              updateNodeData(node.id, {
                content: html,
              } as Partial<PageNodeData>)
            }
            placeholder="Press / for commands  ·  > for toggle  ·  /cite to reference a source"
            showToolbar={false}
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
