"use client";

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import katex from "katex";
import { MathEditorCard } from "./MathEditorCard";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mathInline: {
      insertMathInline: (latex?: string) => ReturnType;
    };
  }
}

// Same horizontal gap we use to keep the popover from kissing the anchor.
const POPOVER_GAP = 8;
// Hard cap so the card never bleeds past the viewport on narrow panels.
const POPOVER_MAX_WIDTH = 520;
// Side margin we try to keep between the popover and the viewport edges.
const POPOVER_VIEWPORT_MARGIN = 12;

interface PopoverPos {
  top: number;
  left: number;
  width: number;
  // `flipped` means we couldn't fit below the anchor and rendered above it.
  flipped: boolean;
}

function MathInlineView({
  node,
  updateAttributes,
  selected,
  editor,
  deleteNode,
}: NodeViewProps) {
  const latex = (node.attrs.latex as string) ?? "";
  const [editing, setEditing] = useState(latex.length === 0);
  const [draft, setDraft] = useState(latex);
  const [pos, setPos] = useState<PopoverPos | null>(null);

  const anchorRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) setDraft(latex);
  }, [latex, editing]);

  // Rendered (view-mode) HTML. Inline mode → KaTeX renders as flow text.
  const html = useMemo(() => {
    if (!latex.trim()) return "";
    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: false,
        output: "html",
      });
    } catch {
      const escaped = latex.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<span class="pg-math-error">${escaped}</span>`;
    }
  }, [latex]);

  // Position the popover relative to the inline anchor. We do this in a
  // layout effect so the popover doesn't paint at (0,0) for one frame
  // before snapping into place. The handler also re-runs on scroll/resize
  // so the popover follows the editor as the user scrolls.
  useLayoutEffect(() => {
    // When `editing` is false the popover isn't rendered, so leaving a
    // stale `pos` here is harmless — the next time editing flips true,
    // computePos() runs and overwrites it before paint.
    if (!editing) return;
    const computePos = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      const width = Math.min(POPOVER_MAX_WIDTH, viewportW - POPOVER_VIEWPORT_MARGIN * 2);

      // Try to align the popover's left edge with the anchor's left edge,
      // then clamp into the viewport so it never escapes off-screen.
      let left = rect.left;
      if (left + width > viewportW - POPOVER_VIEWPORT_MARGIN) {
        left = viewportW - POPOVER_VIEWPORT_MARGIN - width;
      }
      if (left < POPOVER_VIEWPORT_MARGIN) left = POPOVER_VIEWPORT_MARGIN;

      // Below-then-flip-above placement. We use the *measured* popover
      // height when available; before first paint we assume a sane
      // default so we still position reasonably on the first tick.
      const popH = popoverRef.current?.offsetHeight ?? 280;
      const spaceBelow = viewportH - rect.bottom - POPOVER_VIEWPORT_MARGIN;
      const flipped = spaceBelow < popH + POPOVER_GAP && rect.top > popH + POPOVER_GAP;
      const top = flipped
        ? Math.max(POPOVER_VIEWPORT_MARGIN, rect.top - POPOVER_GAP - popH)
        : rect.bottom + POPOVER_GAP;

      setPos({ top, left, width, flipped });
    };

    computePos();
    // Re-measure after first paint so we can flip if the popover ended up
    // taller than we assumed.
    const raf = requestAnimationFrame(computePos);
    window.addEventListener("scroll", computePos, true);
    window.addEventListener("resize", computePos);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", computePos, true);
      window.removeEventListener("resize", computePos);
    };
  }, [editing]);

  const commit = (opts?: { keepFocus?: boolean }) => {
    const next = draft;
    if (!next.trim()) {
      // Same behaviour as the block: an empty commit drops the atom so
      // the document doesn't fill up with invisible empties.
      deleteNode();
      return;
    }
    updateAttributes({ latex: next });
    setEditing(false);
    if (!opts?.keepFocus) editor.commands.focus();
  };

  const cancel = () => {
    if (!latex.trim()) {
      deleteNode();
      return;
    }
    setDraft(latex);
    setEditing(false);
    editor.commands.focus();
  };

  // Click-outside → commit. Uses capture phase so we run before the click
  // gets a chance to land on (and re-open) a sibling math node. We allow
  // clicks inside the anchor itself so the user can re-focus the rendered
  // formula without dismissing the popover.
  useEffect(() => {
    if (!editing) return;
    const onPointerDown = (e: PointerEvent) => {
      // `Node` is shadowed by the tiptap import at the top of this file,
      // so we lean on `Element` (which extends DOM Node and carries the
      // `.contains` signature we need) for the type assertion.
      const target = e.target as Element | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      commit({ keepFocus: true });
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
    // We intentionally depend on `draft` so the closure captures the
    // latest text when the user clicks outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft]);

  return (
    <NodeViewWrapper
      as="span"
      className={`pg-math-inline${selected ? " is-selected" : ""}${
        editing ? " is-editing" : ""
      }`}
    >
      <span
        ref={anchorRef}
        className="pg-math-rendered"
        onClick={() => setEditing(true)}
        dangerouslySetInnerHTML={{
          __html: html || `<span class="pg-math-empty">empty math</span>`,
        }}
      />
      {editing && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              className={`pg-math-inline-popover${
                pos?.flipped ? " is-flipped" : ""
              }`}
              style={
                pos
                  ? {
                      top: pos.top,
                      left: pos.left,
                      width: pos.width,
                    }
                  : { opacity: 0, pointerEvents: "none" }
              }
              // The portal lives outside ProseMirror's DOM, so we don't
              // need contentEditable=false to keep PM from treating it
              // as content — but we set it anyway as a belt-and-braces
              // signal for any selection-walking helpers.
              contentEditable={false}
              suppressContentEditableWarning
              role="presentation"
            >
              <MathEditorCard
                mode="inline"
                draft={draft}
                onChange={setDraft}
                onCommit={() => commit()}
                onCancel={cancel}
              />
            </div>,
            document.body
          )
        : null}
    </NodeViewWrapper>
  );
}

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-latex") ?? element.textContent ?? "",
        renderHTML: (attrs) => ({ "data-latex": attrs.latex as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-type='math-inline']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "math-inline" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  },

  addCommands() {
    return {
      insertMathInline:
        (latex = "") =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { latex },
          }),
    } as Partial<RawCommands>;
  },
});

export default MathInline;
