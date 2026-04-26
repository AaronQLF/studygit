"use client";

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";

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
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) requestAnimationFrame(() => ref.current?.focus());
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(latex);
  }, [latex, editing]);

  const html = useMemo(() => {
    if (!latex.trim()) return "";
    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: true,
        output: "html",
      });
    } catch {
      return `<span style="color:#f87171">${latex}</span>`;
    }
  }, [latex]);

  const commit = () => {
    updateAttributes({ latex: draft });
    setEditing(false);
    editor.commands.focus();
  };

  return (
    <NodeViewWrapper
      className={`pg-math-block${selected ? " is-selected" : ""}${
        editing ? " is-editing" : ""
      }`}
    >
      {editing ? (
        <div className="pg-math-block-edit">
          <textarea
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft(latex);
                setEditing(false);
                editor.commands.focus();
              }
            }}
            placeholder="\\sum_{i=0}^n i = \\frac{n(n+1)}{2}"
            className="pg-math-block-input"
            rows={Math.max(2, draft.split("\n").length)}
          />
          <div className="pg-math-block-actions">
            <span>⌘↵ to render · esc to cancel</span>
            <button type="button" onClick={commit}>
              done
            </button>
          </div>
        </div>
      ) : (
        <div
          className="pg-math-block-rendered"
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{
            __html:
              html ||
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
