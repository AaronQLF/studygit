"use client";

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mermaidBlock: {
      insertMermaidBlock: (code?: string) => ReturnType;
    };
  }
}

const DEFAULT_CODE = `flowchart LR
    A[Read] --> B[Highlight]
    B --> C[Note]
    C --> D[Review]`;

let mermaidLoader: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidLoader) {
    mermaidLoader = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
        fontFamily: "var(--font-sans, ui-sans-serif, system-ui)",
      });
      return mermaid;
    });
  }
  return mermaidLoader;
}

function MermaidBlockView({
  node,
  updateAttributes,
  selected,
  editor,
}: NodeViewProps) {
  const code = (node.attrs.code as string) ?? "";
  const [editing, setEditing] = useState(code.length === 0);
  const [draft, setDraft] = useState(code);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>("");
  const idRef = useRef(`pg-mermaid-${Math.random().toString(36).slice(2)}`);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(code);
  }, [code, editing]);

  useEffect(() => {
    if (editing) return;
    if (!code.trim()) {
      setSvg("");
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const mermaid = await loadMermaid();
        const result = await mermaid.render(idRef.current, code);
        if (!cancelled) {
          setSvg(result.svg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message ?? "diagram error");
          setSvg("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, editing]);

  const commit = () => {
    updateAttributes({ code: draft });
    setEditing(false);
    editor.commands.focus();
  };

  return (
    <NodeViewWrapper
      className={`pg-mermaid${selected ? " is-selected" : ""}${
        editing ? " is-editing" : ""
      }`}
    >
      {editing ? (
        <div className="pg-mermaid-edit">
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
                setDraft(code);
                setEditing(false);
                editor.commands.focus();
              }
            }}
            placeholder={DEFAULT_CODE}
            className="pg-mermaid-input"
            rows={Math.max(4, draft.split("\n").length)}
            spellCheck={false}
          />
          <div className="pg-mermaid-actions">
            <span>⌘↵ to render · esc to cancel</span>
            <button type="button" onClick={commit}>
              done
            </button>
          </div>
        </div>
      ) : (
        <div
          className="pg-mermaid-rendered"
          onClick={() => setEditing(true)}
          role="button"
          tabIndex={0}
        >
          {error ? (
            <div className="pg-mermaid-error">
              <div className="pg-mermaid-error-title">diagram error</div>
              <pre>{error}</pre>
            </div>
          ) : svg ? (
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <div className="pg-mermaid-empty">
              empty diagram — click to edit
            </div>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const MermaidBlock = Node.create({
  name: "mermaidBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      code: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-code") ?? element.textContent ?? "",
        renderHTML: (attrs) => ({ "data-code": attrs.code as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='mermaid-block']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "mermaid-block" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidBlockView);
  },

  addCommands() {
    return {
      insertMermaidBlock:
        (code) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { code: code ?? DEFAULT_CODE },
          }),
    } as Partial<RawCommands>;
  },
});

export default MermaidBlock;
