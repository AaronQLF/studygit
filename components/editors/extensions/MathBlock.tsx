"use client";

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useEffect, useMemo, useState } from "react";
import katex from "katex";
import { MathEditorCard } from "./MathEditorCard";

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
  deleteNode,
}: NodeViewProps) {
  const latex = (node.attrs.latex as string) ?? "";
  const [editing, setEditing] = useState(latex.length === 0);
  const [draft, setDraft] = useState(latex);

  useEffect(() => {
    if (!editing) setDraft(latex);
  }, [latex, editing]);

  // Static render for view mode. KaTeX renders its own error HTML when
  // `throwOnError` is false, but we still wrap in try/catch defensively
  // in case the library ever changes behaviour.
  const renderedHtml = useMemo(() => {
    if (!latex.trim()) return "";
    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: true,
        output: "html",
      });
    } catch {
      const escaped = latex.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<span class="pg-math-error">${escaped}</span>`;
    }
  }, [latex]);

  const commit = () => {
    const next = draft;
    if (!next.trim()) {
      // Empty Done collapses the block instead of leaving a ghost
      // "click to edit" placeholder in the document. Matches the way
      // Notion drops an empty equation card on confirm.
      deleteNode();
      return;
    }
    updateAttributes({ latex: next });
    setEditing(false);
    editor.commands.focus();
  };

  const cancel = () => {
    if (!latex.trim()) {
      // The block was inserted blank and the user backed out — remove it
      // entirely rather than leaving an empty atom in the document.
      deleteNode();
      return;
    }
    setDraft(latex);
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
        <MathEditorCard
          mode="block"
          draft={draft}
          onChange={setDraft}
          onCommit={commit}
          onCancel={cancel}
        />
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
