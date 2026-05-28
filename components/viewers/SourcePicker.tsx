"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, Search } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  buildSourceRows,
  groupSourceRows,
  sourceRowKey,
  type SourceGroup,
  type SourceRow,
} from "@/lib/source-rows";
import {
  CitationRow,
  GroupIcon,
  NodeRow,
} from "./source-picker/SourcePickerRows";

type SourcePickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (row: SourceRow) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  workspaceId: string | null;
  excludeNodeId: string | null;
  excludeKeys?: Set<string>;
  // When set, the picker skips the node-list step and goes straight to
  // that node's citation list. Used by the per-chip "swap mode" flow.
  restrictToNodeId?: string | null;
  placeholder?: string;
  emptyMessage?: React.ReactNode;
};

export function SourcePicker({
  open,
  onClose,
  onSelect,
  anchorRef,
  workspaceId,
  excludeNodeId,
  excludeKeys,
  restrictToNodeId,
  placeholder = "Search sources…",
  emptyMessage,
}: SourcePickerProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  // Drill-down state: when set, the picker shows only that group's
  // citations. Cleared by the back button or by Backspace on an empty
  // search field.
  const [drillNodeId, setDrillNodeId] = useState<string | null>(
    restrictToNodeId ?? null
  );
  const [position, setPosition] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 360,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Reset drill state to match `restrictToNodeId` whenever it changes.
  // Important for the per-chip swap flow, where each chip's picker is
  // re-keyed; the initial useState above handles the first mount but
  // we also defensively re-sync on prop change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrillNodeId(restrictToNodeId ?? null);
  }, [restrictToNodeId]);

  // Live subscription to nodes — when the user adds a highlight in another
  // open panel, the picker updates without re-opening.
  const nodes = useStore((s) => s.nodes);

  const rows = useMemo(() => {
    let all = buildSourceRows(nodes, { workspaceId, excludeNodeId });
    if (restrictToNodeId) {
      all = all.filter((row) => row.sourceNodeId === restrictToNodeId);
    }
    if (!excludeKeys || excludeKeys.size === 0) return all;
    return all.filter((row) => !excludeKeys.has(sourceRowKey(row)));
  }, [nodes, workspaceId, excludeNodeId, excludeKeys, restrictToNodeId]);

  const groups = useMemo(() => groupSourceRows(rows), [rows]);
  const drillGroup = useMemo(
    () =>
      drillNodeId ? groups.find((g) => g.nodeId === drillNodeId) ?? null : null,
    [groups, drillNodeId]
  );

  // What the user is currently looking at — either the list of source
  // nodes, or the citation list inside one drilled-in node.
  const view: "nodes" | "citations" = drillNodeId ? "citations" : "nodes";

  // Filtering: searches operate on whichever view is active. At node
  // level we match group titles; at citation level we match within the
  // drilled group's rows (title + excerpt + locator).
  const filteredGroups = useMemo(() => {
    if (view !== "nodes") return groups;
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      if (g.title.toLowerCase().includes(q)) return true;
      // Also match if any row inside the group matches — surfaces a node
      // whose title doesn't include the query but whose contents do.
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

  const clampedActiveIndex = Math.min(
    activeIndex,
    Math.max(0, itemCount - 1)
  );

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(420, Math.max(320, rect.width));
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - width - 8
    );
    const top = Math.min(rect.bottom + 6, window.innerHeight - 320);
    setPosition({ top, left, width });
  }, [anchorRef]);

  useEffect(() => {
    if (!open) return;
    reposition();
    requestAnimationFrame(() => inputRef.current?.focus());
    const onResize = () => reposition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, reposition, restrictToNodeId]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (event: MouseEvent) => {
      const root = rootRef.current;
      const anchor = anchorRef.current;
      const target = event.target as Node | null;
      if (!target) return;
      if (root?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open, onClose, anchorRef]);

  // Window-level Escape handler. The input's onKeyDown also catches Esc,
  // but only when the input has focus; this listener guarantees Esc
  // closes the picker even if the user clicked a row button or chevron
  // and focus has drifted off the input. Captured at the bubble phase
  // and `stopPropagation`ed so PanelManager's panel-closing Esc handler
  // doesn't also fire and close the surrounding panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  // Reset the active index whenever the visible list shape changes —
  // covers typing into the search box, drilling in, drilling back out,
  // and rows shifting under us (new highlight added in another panel).
  // This is the documented escape hatch for the "setState in effect"
  // lint rule: resetting internal UI state when an input changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex(0);
  }, [view, drillNodeId, query]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const child = list.children[clampedActiveIndex] as HTMLElement | undefined;
    if (!child) return;
    const top = child.offsetTop;
    const bottom = top + child.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [clampedActiveIndex]);

  const enterGroup = (group: SourceGroup) => {
    // If a group has exactly one row, attach it directly instead of
    // forcing the user through a one-item citations view — same effect,
    // one fewer click. Multi-row groups drill in normally.
    if (group.rows.length === 1) {
      onSelect(group.rows[0]);
      onClose();
      return;
    }
    setDrillNodeId(group.nodeId);
    setQuery("");
  };

  const exitGroup = () => {
    if (restrictToNodeId) {
      // Caller pinned the picker to one node — nothing to go back to.
      onClose();
      return;
    }
    setDrillNodeId(null);
    setQuery("");
  };

  const commitCurrent = () => {
    if (view === "nodes") {
      const group = filteredGroups[clampedActiveIndex];
      if (group) enterGroup(group);
      return;
    }
    const row = filteredRows[clampedActiveIndex];
    if (row) {
      onSelect(row);
      onClose();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) =>
        itemCount ? (Math.min(i, itemCount - 1) + 1) % itemCount : 0
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) =>
        itemCount
          ? (Math.min(i, itemCount - 1) - 1 + itemCount) % itemCount
          : 0
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commitCurrent();
      return;
    }
    // Backspace on an empty search field steps back to the node list
    // when we're inside a drilled view — keeps the keyboard-only
    // experience snappy without forcing a reach for the back button.
    // Esc itself is handled at the window level (see effect above) so
    // it always closes the picker regardless of focus.
    if (
      event.key === "Backspace" &&
      view === "citations" &&
      query.length === 0 &&
      !restrictToNodeId
    ) {
      event.preventDefault();
      exitGroup();
      return;
    }
  };

  if (!open) return null;

  const showBack = view === "citations" && !restrictToNodeId;

  return (
    <div
      ref={rootRef}
      className="fixed z-[80] rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg)] shadow-[var(--pg-shadow-lg)] overflow-hidden"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
      }}
      role="dialog"
      aria-label={view === "nodes" ? "Pick a source" : "Pick a citation"}
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2 py-1.5">
        {showBack ? (
          <button
            type="button"
            onClick={exitGroup}
            title="Back to sources (Esc)"
            className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-bg)] hover:text-[var(--pg-fg)]"
          >
            <ChevronLeft size={12} />
          </button>
        ) : (
          <Search size={12} className="text-[var(--pg-muted)]" aria-hidden />
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            view === "citations" && drillGroup
              ? `Search in ${drillGroup.title}…`
              : placeholder
          }
          spellCheck={false}
          className="flex-1 bg-transparent text-[12px] text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)]"
        />
        <span className="text-[10.5px] text-[var(--pg-muted)]">
          {itemCount}
          {itemCount !== totalCount ? `/${totalCount}` : ""}
        </span>
      </div>

      {view === "citations" && drillGroup ? (
        <div className="border-b border-[var(--pg-border)] bg-[var(--pg-bg)] px-3 py-1.5 text-[10.5px] uppercase tracking-[0.14em] text-[var(--pg-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <GroupIcon
              kind={drillGroup.kind}
              size={11}
              className="text-[var(--pg-muted)]"
            />
            <span className="truncate text-[var(--pg-fg-soft)] normal-case tracking-normal">
              {drillGroup.title}
            </span>
          </span>
        </div>
      ) : null}

      {itemCount === 0 ? (
        <div className="px-3 py-4 text-[12px] text-[var(--pg-muted)]">
          {totalCount === 0 ? (
            emptyMessage ?? (
              <>
                Nothing to cite in this workspace yet.
                <div className="mt-1 text-[11px] text-[var(--pg-muted-soft)]">
                  Add a Page, drop a Note, or highlight a passage in a PDF or
                  article first.
                </div>
              </>
            )
          ) : (
            <>No matches for &ldquo;{query}&rdquo;</>
          )}
        </div>
      ) : view === "nodes" ? (
        <div ref={listRef} className="max-h-[280px] overflow-y-auto py-1">
          {filteredGroups.map((group, i) => (
            <NodeRow
              key={group.nodeId}
              group={group}
              active={i === clampedActiveIndex}
              onHover={() => setActiveIndex(i)}
              onPick={() => enterGroup(group)}
            />
          ))}
        </div>
      ) : (
        <div ref={listRef} className="max-h-[280px] overflow-y-auto py-1">
          {filteredRows.map((row, i) => (
            <CitationRow
              key={sourceRowKey(row)}
              row={row}
              active={i === clampedActiveIndex}
              onHover={() => setActiveIndex(i)}
              onPick={() => {
                onSelect(row);
                onClose();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
