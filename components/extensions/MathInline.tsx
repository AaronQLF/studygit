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
    mathInline: {
      insertMathInline: (latex?: string) => ReturnType;
    };
  }
}

function MathInlineView({
  node,
  updateAttributes,
  selected,
  editor,
}: NodeViewProps) {
  const latex = (node.attrs.latex as string) ?? "";
  const [editing, setEditing] = useState(latex.length === 0);
  const [draft, setDraft] = useState(latex);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(latex);
  }, [latex, editing]);

  const html = useMemo(() => {
    if (!latex.trim()) return "";
    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: false,
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
      as="span"
      className={`pg-math-inline${selected ? " is-selected" : ""}${
        editing ? " is-editing" : ""
      }`}
    >
      {editing ? (
        <span className="pg-math-edit">
          <span className="pg-math-edit-prefix">$</span>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft(latex);
                setEditing(false);
                editor.commands.focus();
              }
            }}
            onBlur={commit}
            placeholder="latex"
            className="pg-math-edit-input"
          />
          <span className="pg-math-edit-prefix">$</span>
        </span>
      ) : (
        <span
          className="pg-math-rendered"
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{
            __html: html || `<span class="pg-math-empty">empty math</span>`,
          }}
        />
      )}
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
