"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { Highlighter } from "lucide-react";
import { HIGHLIGHT_COLORS } from "@/lib/defaults";
import type { WebHighlight } from "@/lib/types";

const ANCHOR_CONTEXT = 32;

export type WebSelectionEvent = {
  text: string;
  prefix: string;
  suffix: string;
};

export type WebViewerHandle = {
  jumpToHighlight: (highlightId: string) => void;
};

type WebArticleViewerProps = {
  html: string;
  highlights: WebHighlight[];
  activeHighlightId: string | null;
  onSelectionHighlight: (selection: WebSelectionEvent, color: string) => void;
  onHighlightClick: (id: string) => void;
};

type TextIndexEntry = {
  node: Text;
  start: number;
  end: number;
};

function collectTextNodes(root: HTMLElement): TextIndexEntry[] {
  const out: TextIndexEntry[] = [];
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    const len = text.nodeValue?.length ?? 0;
    if (len === 0) continue;
    out.push({ node: text, start: offset, end: offset + len });
    offset += len;
  }
  return out;
}

function flatText(index: TextIndexEntry[]): string {
  let s = "";
  for (const e of index) s += e.node.nodeValue ?? "";
  return s;
}

function nodeOffsetInIndex(
  index: TextIndexEntry[],
  node: Node,
  offset: number
): number | null {
  for (const e of index) {
    if (e.node === node) {
      return e.start + Math.min(offset, e.end - e.start);
    }
  }
  // The selection may end at a non-text node (e.g. the end of an element
  // after triple-clicking a paragraph). In that case, find the last text
  // node that's a descendant of `node` up to `offset` children.
  if (node.nodeType === 1) {
    const el = node as Element;
    const children =
      offset >= el.childNodes.length
        ? Array.from(el.childNodes)
        : Array.from(el.childNodes).slice(0, offset);
    const lastDescendantText = (() => {
      for (let i = children.length - 1; i >= 0; i--) {
        const c = children[i];
        if (c.nodeType === 3) return c as Text;
        if (c.nodeType === 1) {
          const sub = (c as Element).querySelector(":scope *");
          // Fall back to direct DFS so we hit nested text nodes too.
          const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
          let last: Text | null = null;
          for (let t = walker.nextNode(); t; t = walker.nextNode()) {
            last = t as Text;
          }
          if (last) return last;
          void sub;
        }
      }
      return null;
    })();
    if (lastDescendantText) {
      for (const e of index) {
        if (e.node === lastDescendantText) return e.end;
      }
    }
  }
  return null;
}

// Locate a highlight's char range within `full`. Tries (prefix + text + suffix)
// first; falls back to a unique occurrence of `text` alone. Returns null if
// the anchor can't be resolved confidently.
function findAnchor(
  full: string,
  h: WebHighlight
): { start: number; end: number } | null {
  const text = h.text;
  if (!text) return null;
  const prefix = h.prefix ?? "";
  const suffix = h.suffix ?? "";
  if (prefix || suffix) {
    const composite = `${prefix}${text}${suffix}`;
    const idx = full.indexOf(composite);
    if (idx !== -1) {
      return { start: idx + prefix.length, end: idx + prefix.length + text.length };
    }
  }
  // Fall back to a unique match of just the text. If it appears more than
  // once and we don't have disambiguating context, refuse rather than
  // highlighting the wrong span.
  const first = full.indexOf(text);
  if (first === -1) return null;
  const second = full.indexOf(text, first + 1);
  if (second !== -1) return null;
  return { start: first, end: first + text.length };
}

function rangeFromIndex(
  index: TextIndexEntry[],
  start: number,
  end: number
): Range | null {
  if (start >= end) return null;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  for (const e of index) {
    if (!startNode && start >= e.start && start < e.end) {
      startNode = e.node;
      startOffset = start - e.start;
    }
    if (end > e.start && end <= e.end) {
      endNode = e.node;
      endOffset = end - e.start;
    }
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function unwrapMark(mark: HTMLElement): void {
  const parent = mark.parentNode;
  if (!parent) return;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
}

function clearExistingMarks(root: HTMLElement): void {
  const marks = Array.from(
    root.querySelectorAll<HTMLElement>("mark[data-pg-highlight='true']")
  );
  for (const m of marks) unwrapMark(m);
  root.normalize();
}

// Wrap [start, end) characters of the article in <mark> spans. The range can
// cross element boundaries, so we walk the text nodes inside the range and
// wrap each piece individually. Returns the list of created mark elements.
function wrapRange(
  root: HTMLElement,
  range: Range,
  id: string,
  color: string,
  isActive: boolean
): HTMLElement[] {
  const created: HTMLElement[] = [];
  // Collect text nodes fully or partially covered by `range`.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const t = node as Text;
      const r = document.createRange();
      r.selectNodeContents(t);
      const intersects =
        range.compareBoundaryPoints(Range.END_TO_START, r) < 0 &&
        range.compareBoundaryPoints(Range.START_TO_END, r) > 0;
      return intersects
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const pieces: Array<{ node: Text; start: number; end: number }> = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const len = t.nodeValue?.length ?? 0;
    if (len === 0) continue;
    let pieceStart = 0;
    let pieceEnd = len;
    if (t === range.startContainer) pieceStart = range.startOffset;
    if (t === range.endContainer) pieceEnd = range.endOffset;
    if (pieceEnd > pieceStart) {
      pieces.push({ node: t, start: pieceStart, end: pieceEnd });
    }
  }

  for (const piece of pieces) {
    const { node, start, end } = piece;
    const value = node.nodeValue ?? "";
    const before = value.slice(0, start);
    const middle = value.slice(start, end);
    const after = value.slice(end);
    const parent = node.parentNode;
    if (!parent) continue;
    const mark = document.createElement("mark");
    mark.dataset.pgHighlight = "true";
    mark.dataset.highlightId = id;
    mark.style.backgroundColor = color;
    if (isActive) mark.classList.add("is-active");
    mark.appendChild(document.createTextNode(middle));
    const fragments: Node[] = [];
    if (before) fragments.push(document.createTextNode(before));
    fragments.push(mark);
    if (after) fragments.push(document.createTextNode(after));
    const next = node.nextSibling;
    parent.removeChild(node);
    for (const frag of fragments) {
      if (next) parent.insertBefore(frag, next);
      else parent.appendChild(frag);
    }
    created.push(mark);
  }

  return created;
}

export const WebArticleViewer = forwardRef<
  WebViewerHandle,
  WebArticleViewerProps
>(function WebArticleViewer(
  {
    html,
    highlights,
    activeHighlightId,
    onSelectionHighlight,
    onHighlightClick,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Track marks created for each highlight so jumpToHighlight can scroll.
  const marksByHighlight = useRef<Map<string, HTMLElement[]>>(new Map());

  const [selectionToolbar, setSelectionToolbar] = useState<{
    event: WebSelectionEvent;
    x: number;
    y: number;
  } | null>(null);

  // Re-apply highlights after each html or highlights change.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    clearExistingMarks(root);
    marksByHighlight.current = new Map();
    if (highlights.length === 0) return;

    const index = collectTextNodes(root);
    const full = flatText(index);
    if (!full) return;

    for (const h of highlights) {
      const anchor = findAnchor(full, h);
      if (!anchor) continue;
      const range = rangeFromIndex(index, anchor.start, anchor.end);
      if (!range) continue;
      const created = wrapRange(
        root,
        range,
        h.id,
        h.color,
        h.id === activeHighlightId
      );
      if (created.length > 0) {
        marksByHighlight.current.set(h.id, created);
      }
    }
  }, [html, highlights, activeHighlightId]);

  useImperativeHandle(
    ref,
    () => ({
      jumpToHighlight: (highlightId: string) => {
        const marks = marksByHighlight.current.get(highlightId);
        const first = marks?.[0];
        const scroller = scrollRef.current;
        if (!first || !scroller) return;
        const firstRect = first.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const top =
          firstRect.top -
          scrollerRect.top +
          scroller.scrollTop -
          80;
        scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      },
    }),
    []
  );

  const evaluateSelection = useCallback(() => {
    const root = containerRef.current;
    const scroller = scrollRef.current;
    const selection = window.getSelection();
    if (
      !root ||
      !scroller ||
      !selection ||
      selection.isCollapsed ||
      selection.rangeCount === 0
    ) {
      setSelectionToolbar(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      setSelectionToolbar(null);
      return;
    }

    const index = collectTextNodes(root);
    if (index.length === 0) {
      setSelectionToolbar(null);
      return;
    }
    const full = flatText(index);

    const startGlobal = nodeOffsetInIndex(
      index,
      range.startContainer,
      range.startOffset
    );
    const endGlobal = nodeOffsetInIndex(
      index,
      range.endContainer,
      range.endOffset
    );
    if (startGlobal == null || endGlobal == null || endGlobal <= startGlobal) {
      setSelectionToolbar(null);
      return;
    }

    const rawText = full.slice(startGlobal, endGlobal);
    const text = rawText.replace(/^\s+|\s+$/g, "");
    if (!text) {
      setSelectionToolbar(null);
      return;
    }
    // Re-derive exact bounds after trimming so prefix/suffix line up with
    // the actual highlighted characters (not the leading/trailing
    // whitespace the browser sometimes includes in a selection).
    const leading = rawText.length - rawText.trimStart().length;
    const trailing = rawText.length - rawText.trimEnd().length;
    const realStart = startGlobal + leading;
    const realEnd = endGlobal - trailing;

    const prefix = full.slice(Math.max(0, realStart - ANCHOR_CONTEXT), realStart);
    const suffix = full.slice(realEnd, realEnd + ANCHOR_CONTEXT);

    const rect = range.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    setSelectionToolbar({
      event: { text, prefix, suffix },
      x: rect.left + rect.width / 2 - scrollerRect.left + scroller.scrollLeft,
      y: rect.top - scrollerRect.top + scroller.scrollTop,
    });
  }, []);

  useEffect(() => {
    const onMouseUp = () => {
      requestAnimationFrame(() => evaluateSelection());
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [evaluateSelection]);

  useEffect(() => {
    const onChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) setSelectionToolbar(null);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onScroll = () => setSelectionToolbar(null);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  // Delegated click — activate the highlight under the cursor, but only if
  // the user is not in the middle of selecting text.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const mark = target.closest<HTMLElement>("mark[data-pg-highlight='true']");
      if (!mark) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const id = mark.dataset.highlightId;
      if (id) {
        event.stopPropagation();
        onHighlightClick(id);
      }
    };
    root.addEventListener("click", handler);
    return () => root.removeEventListener("click", handler);
  }, [onHighlightClick]);

  // Memoize so React doesn't rebuild the article DOM on every render —
  // important because we mutate it directly to apply highlights.
  const articleMarkup = useMemo(() => ({ __html: html }), [html]);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="relative flex-1 min-h-0 overflow-auto bg-[var(--pg-bg)]"
      >
        <article
          ref={containerRef}
          className="pg-web-article mx-auto max-w-[720px] px-8 py-10"
          dangerouslySetInnerHTML={articleMarkup}
        />
        {selectionToolbar ? (
          <div
            className="pointer-events-auto absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-[var(--pg-border-strong)] bg-[var(--pg-bg-elevated)] px-1.5 py-1 shadow-[var(--pg-shadow)]"
            style={{
              top: selectionToolbar.y - 8,
              left: selectionToolbar.x,
            }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <div className="flex items-center gap-1">
              <Highlighter
                size={12}
                className="ml-1 text-[var(--pg-muted)]"
              />
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color}
                  className={clsx(
                    "h-5 w-5 rounded-full border border-white/20 transition-transform hover:scale-110"
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    onSelectionHighlight(selectionToolbar.event, color);
                    setSelectionToolbar(null);
                    window.getSelection()?.removeAllRanges();
                  }}
                  aria-label={`Highlight ${color}`}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});
