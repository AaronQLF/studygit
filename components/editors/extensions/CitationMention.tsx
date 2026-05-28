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
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Link2,
  NotebookPen,
  Search,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  buildSourceRows,
  groupSourceRows,
  isWholeNodeRow,
  type SourceGroup,
  type SourceGroupKind,
  type SourceRow,
} from "@/lib/source-rows";
import type { CitationAttrs } from "./Citation";
import { CITATION_PICKER_EVENT } from "./SlashMenu";

// Row shape was inlined here historically; it now lives in lib/source-rows
// so the AI Answer panel's source picker uses the exact same logic.
type Row = SourceRow;

// Inline icon renderers — switching on kind inside JSX rather than
// `const Icon = iconFor(kind)` so we don't trip React 19's
// `react-hooks/static-components` lint rule.
function RowIcon({
  kind,
  size,
  className,
}: {
  kind: SourceRow["kind"];
  size: number;
  className?: string;
}) {
  if (kind === "pdf" || kind === "pdf-whole") {
    return <FileText size={size} className={className} aria-hidden />;
  }
  if (kind === "page") {
    return <NotebookPen size={size} className={className} aria-hidden />;
  }
  if (kind === "note") {
    return <StickyNote size={size} className={className} aria-hidden />;
  }
  if (kind === "ai") {
    return <Sparkles size={size} className={className} aria-hidden />;
  }
  return <Link2 size={size} className={className} aria-hidden />;
}

function GroupIcon({
  kind,
  size,
  className,
}: {
  kind: SourceGroupKind;
  size: number;
  className?: string;
}) {
  if (kind === "pdf") {
    return <FileText size={size} className={className} aria-hidden />;
  }
  if (kind === "page") {
    return <NotebookPen size={size} className={className} aria-hidden />;
  }
  if (kind === "note") {
    return <StickyNote size={size} className={className} aria-hidden />;
  }
  if (kind === "ai") {
    return <Sparkles size={size} className={className} aria-hidden />;
  }
  return <Link2 size={size} className={className} aria-hidden />;
}

function countLabel(group: SourceGroup): string {
  if (group.kind === "ai") {
    return group.count === 1 ? "1 reply" : `${group.count} replies`;
  }
  if (group.kind === "page") return "page";
  if (group.kind === "note") return "note";
  let whole = 0;
  let highlights = 0;
  for (const row of group.rows) {
    if (isWholeNodeRow(row)) whole += 1;
    else highlights += 1;
  }
  const parts: string[] = [];
  if (highlights > 0) {
    parts.push(`${highlights} ${highlights === 1 ? "highlight" : "highlights"}`);
  }
  if (whole > 0) parts.push("whole");
  return parts.join(" + ") || `${group.count} items`;
}

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
    // Two-step drill: when set, we're viewing one source node's
    // citations; when null, we're viewing the list of source nodes.
    const [drillNodeId, setDrillNodeId] = useState<string | null>(null);
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

    const groups = useMemo(() => groupSourceRows(rows), [rows]);
    const drillGroup = useMemo(
      () =>
        drillNodeId
          ? groups.find((g) => g.nodeId === drillNodeId) ?? null
          : null,
      [groups, drillNodeId]
    );
    const view: "nodes" | "citations" = drillNodeId ? "citations" : "nodes";

    // Search operates on whichever view is active. At the node level it
    // searches both group titles and the text of their child rows so a
    // PDF whose title doesn't include the query but whose highlights do
    // still surfaces as a hit.
    const filteredGroups = useMemo(() => {
      if (view !== "nodes") return groups;
      const q = query.trim().toLowerCase();
      if (!q) return groups;
      return groups.filter((g) => {
        if (g.title.toLowerCase().includes(q)) return true;
        return g.rows.some(
          (row) =>
            row.highlight.text.toLowerCase().includes(q) ||
            row.locator.toLowerCase().includes(q)
        );
      });
    }, [groups, query, view]);

    const filteredRows = useMemo(() => {
      if (view !== "citations" || !drillGroup) return [];
      const q = query.trim().toLowerCase();
      if (!q) return drillGroup.rows;
      return drillGroup.rows.filter((row) => {
        if (row.sourceTitle.toLowerCase().includes(q)) return true;
        if (row.highlight.text.toLowerCase().includes(q)) return true;
        if (row.locator.toLowerCase().includes(q)) return true;
        return false;
      });
    }, [drillGroup, query, view]);

    const itemCount =
      view === "nodes" ? filteredGroups.length : filteredRows.length;
    const totalCount =
      view === "nodes" ? groups.length : drillGroup?.rows.length ?? 0;

    // Whenever the visible list shape changes (drill in/out, typing),
    // snap selection back to the first row. This is the textbook
    // setState-in-effect exception (reset internal UI state when inputs
    // change), called out in the React docs themselves.
    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveIndex(0);
    }, [view, drillNodeId, query]);

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

    const enterGroup = (group: SourceGroup) => {
      // Single-citation groups attach directly — no need to force the
      // user through a one-item second view.
      if (group.rows.length === 1) {
        onSelect(group.rows[0]);
        return;
      }
      setDrillNodeId(group.nodeId);
      setQuery("");
    };

    const exitGroup = () => {
      setDrillNodeId(null);
      setQuery("");
    };

    const commitCurrent = () => {
      if (view === "nodes") {
        const group = filteredGroups[activeIndex];
        if (group) enterGroup(group);
        return;
      }
      const row = filteredRows[activeIndex];
      if (row) onSelect(row);
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) =>
          itemCount ? (i + 1) % itemCount : 0
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) =>
          itemCount ? (i - 1 + itemCount) % itemCount : 0
        );
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        commitCurrent();
        return;
      }
      // Backspace on an empty search field steps back to the node list
      // when we're inside a drilled view — keeps keyboard-only flow
      // snappy. Esc itself is handled by a window-level listener below
      // so it always closes the popover regardless of focus location.
      if (
        event.key === "Backspace" &&
        view === "citations" &&
        query.length === 0
      ) {
        event.preventDefault();
        exitGroup();
        return;
      }
    };

    // Window-level Escape handler that always closes the popover.
    // Without this, Esc only fires when the input has focus, which is
    // easy to lose by clicking a row button or chevron.
    useEffect(() => {
      const onKey = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }, [onClose]);

    const showBack = view === "citations";

    return (
      <div className="pg-citation-menu" onMouseDown={(e) => e.preventDefault()}>
        <div className="pg-citation-menu-search">
          {showBack ? (
            <button
              type="button"
              onClick={exitGroup}
              className="pg-citation-menu-back"
              title="Back to sources (Esc)"
            >
              <ChevronLeft size={13} aria-hidden />
            </button>
          ) : (
            <Search
              size={13}
              className="pg-citation-menu-search-icon"
              aria-hidden
            />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              view === "citations" && drillGroup
                ? `Search in ${drillGroup.title}…`
                : "Cite from…"
            }
            spellCheck={false}
            className="pg-citation-menu-input"
          />
          <span className="pg-citation-menu-count">
            {itemCount}
            {itemCount !== totalCount ? `/${totalCount}` : ""}
          </span>
        </div>

        {view === "citations" && drillGroup ? (
          <div className="pg-citation-menu-crumb">
            <GroupIcon
              kind={drillGroup.kind}
              size={12}
              className="pg-citation-row-kind"
            />
            <span className="pg-citation-menu-crumb-title">
              {drillGroup.title}
            </span>
          </div>
        ) : null}

        {itemCount === 0 ? (
          <div className="pg-citation-empty">
            {totalCount === 0 ? (
              <>
                Nothing to cite in this workspace yet
                <span className="pg-citation-empty-hint">
                  Highlight a PDF/article, write a page or note, or have an
                  AI reply — any of those become citable here.
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
        ) : view === "nodes" ? (
          <div className="pg-citation-list" ref={listRef}>
            {filteredGroups.map((group, i) => (
              <NodeRow
                key={group.nodeId}
                group={group}
                active={i === activeIndex}
                onHover={() => setActiveIndex(i)}
                onPick={() => enterGroup(group)}
              />
            ))}
          </div>
        ) : (
          <div className="pg-citation-list" ref={listRef}>
            {filteredRows.map((row, i) => (
              <button
                key={`${row.sourceNodeId}:${row.highlight.id}`}
                type="button"
                className={clsx(
                  "pg-citation-row",
                  i === activeIndex && "is-active"
                )}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => onSelect(row)}
              >
                <span
                  className="pg-citation-row-bar"
                  style={{ backgroundColor: row.highlight.color }}
                  aria-hidden
                />
                <span className="pg-citation-row-body">
                  <span className="pg-citation-row-meta">
                    <RowIcon
                      kind={row.kind}
                      size={11}
                      className="pg-citation-row-kind"
                    />
                    {isWholeNodeRow(row) ? (
                      <span className="pg-citation-row-whole">whole</span>
                    ) : null}
                    <span className="pg-citation-row-page">{row.locator}</span>
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
            <kbd>↵</kbd> {view === "nodes" ? "open" : "insert"}
          </span>
          {view === "citations" ? (
            <span>
              <kbd>⌫</kbd> back
            </span>
          ) : null}
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    );
  }
);

function NodeRow({
  group,
  active,
  onHover,
  onPick,
}: {
  group: SourceGroup;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const drillable = group.rows.length > 1;
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onPick}
      className={clsx(
        "pg-citation-row pg-citation-row-node",
        active && "is-active"
      )}
    >
      <GroupIcon
        kind={group.kind}
        size={13}
        className="pg-citation-row-kind"
      />
      <span className="pg-citation-row-body">
        <span className="pg-citation-row-doc pg-citation-row-doc-strong">
          {group.title}
        </span>
        <span className="pg-citation-row-text">{countLabel(group)}</span>
      </span>
      {drillable ? (
        <ChevronRight
          size={12}
          className="pg-citation-row-chevron"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

type CitationMentionOptions = {
  sourceNodeId: string | null;
  workspaceId: string | null;
};

export type CitationPickerEventDetail = {
  editor: Editor;
};

function buildRows(workspaceId: string | null, sourceNodeId: string | null): Row[] {
  return buildSourceRows(useStore.getState().nodes, {
    workspaceId,
    excludeNodeId: sourceNodeId,
  });
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
      // Whole-node citations carry no highlight id — the pill points at
      // the node itself and clicking it opens that node's panel rather
      // than trying to jump to a (non-existent) anchor.
      const whole = isWholeNodeRow(row);
      const attrs: CitationAttrs = {
        nodeId: row.sourceNodeId,
        highlightId: whole ? null : row.highlight.id,
        label: row.sourceTitle,
        // `page` is only meaningful for PDF highlight rows; everything
        // else leaves it null so the citation pill renders with whatever
        // locator chip the live node-view derives.
        page: row.kind === "pdf" ? row.highlight.page : null,
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
