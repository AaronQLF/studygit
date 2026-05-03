"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { Extension, type Editor } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { Search } from "lucide-react";
import { useStore } from "@/lib/store";
import type { PdfHighlight, PdfNodeData } from "@/lib/types";
import type { CitationAttrs } from "./Citation";
import { CITATION_PICKER_EVENT } from "./SlashMenu";

type Row = {
  pdfNodeId: string;
  pdfTitle: string;
  highlight: PdfHighlight;
};

type PickerProps = {
  rows: Row[];
  onSelect: (row: Row) => void;
  onClose: () => void;
};

type PickerHandle = {
  focus: () => void;
};

function clampExcerpt(text: string): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > 220 ? `${single.slice(0, 220)}…` : single;
}

const CitationPicker = forwardRef<PickerHandle, PickerProps>(
  function CitationPicker({ rows, onSelect, onClose }, ref) {
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => inputRef.current?.focus(),
      }),
      []
    );

    useEffect(() => {
      requestAnimationFrame(() => inputRef.current?.focus());
    }, []);

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return rows;
      return rows.filter((row) => {
        if (row.pdfTitle.toLowerCase().includes(q)) return true;
        if (row.highlight.text.toLowerCase().includes(q)) return true;
        if (`p${row.highlight.page}`.includes(q)) return true;
        return false;
      });
    }, [rows, query]);

    useEffect(() => {
      setActiveIndex(0);
    }, [query, rows]);

    useEffect(() => {
      const list = listRef.current;
      if (!list) return;
      const child = list.children[activeIndex] as HTMLElement | undefined;
      if (!child) return;
      const top = child.offsetTop;
      const bottom = top + child.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = bottom - list.clientHeight;
      }
    }, [activeIndex]);

    const commit = (idx: number) => {
      const row = filtered[idx];
      if (row) onSelect(row);
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) =>
          filtered.length ? (i + 1) % filtered.length : 0
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) =>
          filtered.length
            ? (i - 1 + filtered.length) % filtered.length
            : 0
        );
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        commit(activeIndex);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
    };

    return (
      <div className="pg-citation-menu" onMouseDown={(e) => e.preventDefault()}>
        <div className="pg-citation-menu-search">
          <Search
            size={13}
            className="pg-citation-menu-search-icon"
            aria-hidden
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cite a PDF highlight…"
            spellCheck={false}
            className="pg-citation-menu-input"
          />
          <span className="pg-citation-menu-count">
            {filtered.length}
            {filtered.length !== rows.length ? `/${rows.length}` : ""}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="pg-citation-empty">
            {rows.length === 0 ? (
              <>
                No PDF highlights in this workspace yet
                <span className="pg-citation-empty-hint">
                  Highlight a passage in any PDF to cite it here
                </span>
              </>
            ) : (
              <>
                No matches for{" "}
                <span style={{ color: "var(--pg-fg-soft)" }}>
                  &ldquo;{query}&rdquo;
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="pg-citation-list" ref={listRef}>
            {filtered.map((row, i) => (
              <button
                key={`${row.pdfNodeId}:${row.highlight.id}`}
                type="button"
                className={clsx(
                  "pg-citation-row",
                  i === activeIndex && "is-active"
                )}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(i)}
              >
                <span
                  className="pg-citation-row-bar"
                  style={{ backgroundColor: row.highlight.color }}
                  aria-hidden
                />
                <span className="pg-citation-row-body">
                  <span className="pg-citation-row-meta">
                    <span className="pg-citation-row-doc">{row.pdfTitle}</span>
                    <span className="pg-citation-row-page">
                      p{row.highlight.page}
                    </span>
                  </span>
                  <span className="pg-citation-row-text">
                    {clampExcerpt(row.highlight.text) || <em>(no text)</em>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="pg-citation-menu-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> insert
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    );
  }
);

type CitationMentionOptions = {
  sourceNodeId: string | null;
  workspaceId: string | null;
};

export type CitationPickerEventDetail = {
  editor: Editor;
};

function buildRows(workspaceId: string | null, sourceNodeId: string | null): Row[] {
  const state = useStore.getState();
  const rows: Row[] = [];
  for (const node of state.nodes) {
    if (workspaceId && node.workspaceId !== workspaceId) continue;
    if (node.data.kind !== "pdf") continue;
    if (sourceNodeId && node.id === sourceNodeId) continue;
    const data = node.data as PdfNodeData;
    const title = data.title || "Untitled PDF";
    for (const highlight of data.highlights) {
      rows.push({
        pdfNodeId: node.id,
        pdfTitle: title,
        highlight,
      });
    }
  }
  rows.sort((a, b) => b.highlight.createdAt - a.highlight.createdAt);
  return rows;
}

export const CitationMention = Extension.create<CitationMentionOptions>({
  name: "citationMention",

  addOptions() {
    return {
      sourceNodeId: null,
      workspaceId: null,
    };
  },

  onCreate() {
    const editor = this.editor;
    const options = this.options;

    type Renderer = ReactRenderer<PickerHandle, PickerProps>;
    let renderer: Renderer | null = null;
    let popup: TippyInstance | null = null;
    let unsubscribe: (() => void) | null = null;

    const close = () => {
      popup?.hide();
      popup?.destroy();
      popup = null;
      renderer?.destroy();
      renderer = null;
      unsubscribe?.();
      unsubscribe = null;
      // Refocus the editor so the user can keep typing.
      requestAnimationFrame(() => editor.commands.focus());
    };

    const refresh = () => {
      if (!renderer) return;
      const rows = buildRows(options.workspaceId, options.sourceNodeId);
      renderer.updateProps({
        rows,
        onSelect: handleSelect,
        onClose: close,
      });
    };

    const handleSelect = (row: Row) => {
      const attrs: CitationAttrs = {
        nodeId: row.pdfNodeId,
        highlightId: row.highlight.id,
        label: row.pdfTitle,
        page: row.highlight.page,
        excerpt: row.highlight.text,
      };
      editor.chain().focus().insertCitation(attrs).run();
      close();
    };

    const open = () => {
      if (popup) {
        refresh();
        return;
      }
      const rows = buildRows(options.workspaceId, options.sourceNodeId);

      renderer = new ReactRenderer(CitationPicker, {
        props: {
          rows,
          onSelect: handleSelect,
          onClose: close,
        },
        editor,
      }) as Renderer;

      const getRect = () => {
        try {
          const { from } = editor.state.selection;
          const start = editor.view.coordsAtPos(from);
          // Tippy expects a DOMRect-like object describing the reference
          // (the caret). Width 1, height = line height inferred from coords.
          const rect: DOMRect = {
            top: start.top,
            bottom: start.bottom,
            left: start.left,
            right: start.left + 1,
            width: 1,
            height: start.bottom - start.top,
            x: start.left,
            y: start.top,
            toJSON() {
              return this;
            },
          };
          return rect;
        } catch {
          return new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 1, 1);
        }
      };

      popup = tippy(document.body, {
        getReferenceClientRect: getRect,
        appendTo: () => document.body,
        content: renderer.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
        theme: "pg-citation",
        offset: [0, 8],
        maxWidth: "none",
        hideOnClick: false,
        onClickOutside: () => close(),
      });

      // Reposition while the popup is open in case the caret moves or the
      // editor scrolls.
      const onScrollOrResize = () => popup?.setProps({ getReferenceClientRect: getRect });
      window.addEventListener("resize", onScrollOrResize);
      window.addEventListener("scroll", onScrollOrResize, true);

      // Live refresh of the row list when the store changes (e.g. new
      // highlights added in another panel while the picker is open).
      const storeUnsub = useStore.subscribe((s, prev) => {
        if (s.nodes !== prev.nodes) refresh();
      });

      unsubscribe = () => {
        window.removeEventListener("resize", onScrollOrResize);
        window.removeEventListener("scroll", onScrollOrResize, true);
        storeUnsub();
      };
    };

    const onWindowEvent = (event: Event) => {
      const detail = (event as CustomEvent<CitationPickerEventDetail>).detail;
      if (!detail || detail.editor !== editor) return;
      open();
    };

    window.addEventListener(CITATION_PICKER_EVENT, onWindowEvent);

    // Stash teardown on the extension instance so onDestroy can reach it.
    const storage = this.storage as { cleanup?: () => void };
    storage.cleanup = () => {
      window.removeEventListener(CITATION_PICKER_EVENT, onWindowEvent);
      close();
    };
  },

  onDestroy() {
    const storage = this.storage as { cleanup?: () => void };
    storage.cleanup?.();
  },
});

export default CitationMention;
