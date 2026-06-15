"use client";

import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useStore } from "@/lib/store";
import { usePageZoom } from "@/lib/page-zoom";
import type { CanvasNode, PageNodeData } from "@/lib/types";
import {
  PageEditor,
  OutlineButton,
  type PageEditorHandle,
} from "@/components/editors/PageEditor";
import { EditableTitle } from "@/components/ui/EditableTitle";

export function PagePanelBody({ node }: { node: CanvasNode }) {
  const updateNodeData = useStore((s) => s.updateNodeData);
  const data = node.data as PageNodeData;

  // Focus the editor body on open only when the page was just created via
  // instant-capture. Reading + clearing the transient flag keeps the
  // autofocus from re-firing when the panel is reopened later.
  const autoFocus = useStore((s) => s.autoEditNodeId === node.id);
  const setAutoEditNode = useStore((s) => s.setAutoEditNode);
  useEffect(() => {
    if (autoFocus) setAutoEditNode(null);
  }, [autoFocus, setAutoEditNode]);

  // Page zoom is global to the device (persisted in localStorage by
  // `lib/page-zoom.ts`). PagePanelBody is the canonical "scope" that
  // applies the resulting CSS variable so both the title and the
  // editor body scale together — matches how Notion zooms the whole
  // page, not just the editor area. The −/+/% buttons are gone with the
  // toolbar; the Cmd +/− shortcut (in PageEditor) still drives this.
  const hydratePageZoom = usePageZoom((s) => s.hydrate);
  const zoom = usePageZoom((s) => s.zoom);
  useEffect(() => {
    hydratePageZoom();
  }, [hydratePageZoom]);

  // Capture the editor instance so the lone surviving toolbar control —
  // the heading outline / table-of-contents — can sit unobtrusively in the
  // page corner. It's the one action with no slash-menu equivalent, so it
  // stays; everything else moved to `/` and the selection toolbar.
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorRef = useCallback((handle: PageEditorHandle | null) => {
    setEditor(handle?.editor ?? null);
  }, []);

  return (
    <section
      className="pg-page-scope relative flex-1 min-h-0 flex flex-col"
      style={{ ["--pg-page-zoom" as string]: zoom }}
    >
      {/* No pinned formatting toolbar: `/` opens the full block menu,
          markdown shortcuts cover the rest, and the SelectionToolbar
          (rendered inside PageEditor) handles inline formatting on
          selection. The page is just title + text. */}
      {editor ? (
        <div className="absolute right-3 top-2 z-10">
          <OutlineButton editor={editor} />
        </div>
      ) : null}
      <div className="mx-auto w-full max-w-[46rem] px-8 pt-6 pb-1 shrink-0">
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
        <div className="mx-auto h-full max-w-[46rem]">
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
            showStats={false}
            autoFocus={autoFocus}
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
