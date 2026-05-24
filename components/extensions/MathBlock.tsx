"use client";

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import { Check, Sigma, TriangleAlert, X } from "lucide-react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mathBlock: {
      insertMathBlock: (latex?: string) => ReturnType;
    };
  }
}

function MathBlockView({
  node,
  updateAttributes,
  selected,
  editor,
}: NodeViewProps) {
  const latex = (node.attrs.latex as string) ?? "";
  const [editing, setEditing] = useState(latex.length === 0);
  const [draft, setDraft] = useState(latex);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(latex);
  }, [latex, editing]);

  // Live preview while editing — re-renders on every keystroke. KaTeX is
  // fast enough (sub-millisecond for typical formulas) that debouncing
  // would just add visible lag. `throwOnError: true` lets us catch
  // syntax errors and surface them inline instead of rendering broken
  // red HTML.
  const livePreview = useMemo(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return { html: "", error: null as string | null };
    }
    try {
      const html = katex.renderToString(trimmed, {
        throwOnError: true,
        displayMode: true,
        output: "html",
      });
      return { html, error: null };
    } catch (err) {
      const message = (err as Error).message || "Couldn't render LaTeX";
      // KaTeX prefixes errors with "ParseError: KaTeX parse error:" — strip
      // that for a tidier inline message.
      const cleaned = message
        .replace(/^ParseError:\s*/, "")
        .replace(/^KaTeX parse error:\s*/, "");
      return { html: "", error: cleaned };
    }
  }, [draft]);

  // Static render for view mode. Tolerant of errors so a previously-saved
  // formula that has gone stale still shows *something* (red highlight)
  // rather than nothing.
  const renderedHtml = useMemo(() => {
    if (!latex.trim()) return "";
    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: true,
        output: "html",
      });
    } catch {
      return `<span class="pg-math-error">${latex}</span>`;
    }
  }, [latex]);

  const commit = () => {
    updateAttributes({ latex: draft });
    setEditing(false);
    editor.commands.focus();
  };
  const cancel = () => {
    setDraft(latex);
    setEditing(false);
    editor.commands.focus();
  };

  // Auto-grow the textarea up to a generous cap so multi-line formulas
  // (matrices, aligned environments) don't get squished into a 2-row box.
  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(96, Math.min(360, el.scrollHeight))}px`;
  }, [draft, editing]);

  return (
    <NodeViewWrapper
      className={`pg-math-block${selected ? " is-selected" : ""}${
        editing ? " is-editing" : ""
      }`}
    >
      {editing ? (
        <div className="pg-math-block-card">
          <div className="pg-math-block-header">
            <span className="pg-math-block-label">
              <Sigma size={11} />
              LaTeX
            </span>
            <span className="pg-math-block-hint">
              <kbd>⌘</kbd>
              <kbd>↵</kbd>
              <span> render</span>
              <span className="pg-math-block-hint-sep">·</span>
              <kbd>esc</kbd>
              <span> cancel</span>
            </span>
          </div>
          <div className="pg-math-block-split">
            <div className="pg-math-block-pane pg-math-block-pane-edit">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    commit();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancel();
                  }
                }}
                placeholder={"\\sum_{i=0}^n i = \\frac{n(n+1)}{2}"}
                className="pg-math-block-input"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>
            <div className="pg-math-block-pane pg-math-block-pane-preview">
              <div className="pg-math-block-pane-label">Preview</div>
              {livePreview.html ? (
                <div
                  className="pg-math-block-live"
                  dangerouslySetInnerHTML={{ __html: livePreview.html }}
                />
              ) : livePreview.error ? (
                <div className="pg-math-block-error-state">
                  <TriangleAlert
                    size={12}
                    className="pg-math-block-error-icon"
                  />
                  <span className="pg-math-block-error-msg">
                    {livePreview.error}
                  </span>
                </div>
              ) : (
                <div className="pg-math-block-placeholder">
                  Start typing LaTeX — the rendered output will appear
                  here as you go.
                </div>
              )}
            </div>
          </div>
          <div className="pg-math-block-footer">
            <button
              type="button"
              onClick={cancel}
              className="pg-math-block-btn pg-math-block-btn-secondary"
              title="Cancel (esc)"
            >
              <X size={11} />
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              className="pg-math-block-btn pg-math-block-btn-primary"
              title="Render (⌘↵)"
              disabled={!!livePreview.error && !!draft.trim()}
            >
              <Check size={11} />
              Done
            </button>
          </div>
        </div>
      ) : (
        <div
          className="pg-math-block-rendered"
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{
            __html:
              renderedHtml ||
              `<span class="pg-math-empty">empty block math \u2014 click to edit</span>`,
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

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
    return [{ tag: "div[data-type='math-block']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "math-block" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },

  addCommands() {
    return {
      insertMathBlock:
        (latex = "") =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { latex },
          }),
    } as Partial<RawCommands>;
  },
});

export default MathBlock;
