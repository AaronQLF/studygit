"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  CheckSquare,
  ChevronDown,
  Code,
  FileImage,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Sigma,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { type CalloutVariant } from "./CalloutBlock";

export const CITATION_PICKER_EVENT = "pg:open-citation-picker";

export type SlashItem = {
  title: string;
  description: string;
  icon: LucideIcon;
  keywords?: string[];
  command: (props: { editor: Editor; range: Range }) => void;
};

const ALL_ITEMS: SlashItem[] = [
  {
    title: "Heading 1",
    description: "Big section heading",
    icon: Heading1,
    keywords: ["h1", "title"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1 })
        .run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: Heading2,
    keywords: ["h2"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2 })
        .run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: Heading3,
    keywords: ["h3"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3 })
        .run(),
  },
  {
    title: "Bulleted list",
    description: "Simple bulleted list",
    icon: List,
    keywords: ["bullet", "ul", "list", "unordered"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    description: "Ordered list",
    icon: ListOrdered,
    keywords: ["ordered", "ol"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "Task list",
    description: "Checkable todos",
    icon: CheckSquare,
    keywords: ["todo", "task", "checkbox"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: "Toggle",
    description: "Collapsible block",
    icon: ChevronDown,
    keywords: ["details", "collapse", "expand", "fold"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setDetails().run(),
  },
  {
    title: "Callout — info",
    description: "Highlighted info box",
    icon: Sparkles,
    keywords: ["callout", "info", "note", "admonition"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertCallout("info" as CalloutVariant)
        .run(),
  },
  {
    title: "Callout — warning",
    description: "Highlighted warning box",
    icon: Sparkles,
    keywords: ["callout", "warning", "warn", "alert"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertCallout("warn" as CalloutVariant)
        .run(),
  },
  {
    title: "Callout — tip",
    description: "Highlighted tip box",
    icon: Sparkles,
    keywords: ["callout", "tip", "good"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertCallout("tip" as CalloutVariant)
        .run(),
  },
  {
    title: "Callout — quote",
    description: "Highlighted quote box",
    icon: Quote,
    keywords: ["callout", "quote", "blockquote"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertCallout("quote" as CalloutVariant)
        .run(),
  },
  {
    title: "Quote",
    description: "Block quote",
    icon: Quote,
    keywords: ["blockquote"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "Citation",
    description: "Cite a PDF highlight from this workspace",
    icon: Link2,
    keywords: ["cite", "citation", "ref", "reference", "pdf", "quote", "source"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      // Defer one frame so the editor selection has settled after the
      // deleteRange before the picker computes caret coords.
      requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent(CITATION_PICKER_EVENT, {
            detail: { editor },
          })
        );
      });
    },
  },
  {
    title: "Code block",
    description: "Code with syntax highlighting",
    icon: Code,
    keywords: ["code", "snippet", "fence"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Divider",
    description: "Horizontal line",
    icon: Minus,
    keywords: ["hr", "horizontal", "rule", "separator"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "Math (inline)",
    description: "KaTeX inline math",
    icon: Sigma,
    keywords: ["latex", "katex", "equation", "$"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertMathInline("").run(),
  },
  {
    title: "Math (block)",
    description: "Display-mode KaTeX equation",
    icon: Sigma,
    keywords: ["latex", "katex", "equation", "display"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertMathBlock("").run(),
  },
  {
    title: "Mermaid diagram",
    description: "Flowchart, sequence, etc.",
    icon: Sparkles,
    keywords: ["diagram", "flowchart", "graph", "mermaid"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertMermaidBlock().run(),
  },
  {
    title: "Image",
    description: "Embed an image by URL",
    icon: FileImage,
    keywords: ["picture", "img", "embed"],
    command: ({ editor, range }) => {
      const src = window.prompt("Image URL");
      if (!src) return;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setImage({ src })
        .run();
    },
  },
];

function filterItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_ITEMS;
  return ALL_ITEMS.filter((item) => {
    if (item.title.toLowerCase().includes(q)) return true;
    if (item.description.toLowerCase().includes(q)) return true;
    return (item.keywords ?? []).some((kw) => kw.toLowerCase().includes(q));
  });
}

type SlashListProps = {
  items: SlashItem[];
  command: (item: SlashItem) => void;
};

type SlashListHandle = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

const SlashMenuList = forwardRef<SlashListHandle, SlashListProps>(
  function SlashMenuList({ items, command }, ref) {
    const [index, setIndex] = useState(0);

    useEffect(() => {
      setIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowDown") {
          setIndex((i) => (items.length ? (i + 1) % items.length : 0));
          return true;
        }
        if (event.key === "ArrowUp") {
          setIndex((i) =>
            items.length ? (i - 1 + items.length) % items.length : 0
          );
          return true;
        }
        if (event.key === "Enter") {
          const item = items[index];
          if (item) command(item);
          return true;
        }
        if (event.key === "Escape") {
          return true;
        }
        return false;
      },
    }));

    if (!items.length) {
      return (
        <div className="pg-slash-menu">
          <div className="pg-slash-empty">no matches</div>
        </div>
      );
    }

    return (
      <div className="pg-slash-menu">
        <div className="pg-slash-list">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.title}
                type="button"
                className={`pg-slash-item${i === index ? " is-active" : ""}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => command(item)}
              >
                <span className="pg-slash-item-icon">
                  <Icon size={14} />
                </span>
                <span className="pg-slash-item-text">
                  <span className="pg-slash-item-title">{item.title}</span>
                  <span className="pg-slash-item-desc">{item.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);

export const SlashMenu = Extension.create({
  name: "slashMenu",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        allowSpaces: false,
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: SlashItem;
        }) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    type Renderer = ReactRenderer<SlashListHandle, SlashListProps>;

    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }) => filterItems(query).slice(0, 10),
        render: () => {
          let component: Renderer | null = null;
          let popup: TippyInstance[] = [];

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenuList, {
                props: {
                  items: props.items,
                  command: (item: SlashItem) => props.command(item),
                },
                editor: props.editor,
              }) as Renderer;

              if (!props.clientRect) return;

              popup = tippy("body", {
                getReferenceClientRect: () =>
                  props.clientRect?.() ?? new DOMRect(),
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
                theme: "pg-slash",
                offset: [0, 6],
                maxWidth: "none",
              });
            },
            onUpdate(props: SuggestionProps<SlashItem, SlashItem>) {
              component?.updateProps({
                items: props.items,
                command: (item: SlashItem) => props.command(item),
              });
              if (!props.clientRect) return;
              popup[0]?.setProps({
                getReferenceClientRect: () =>
                  props.clientRect?.() ?? new DOMRect(),
              });
            },
            onKeyDown(props) {
              if (props.event.key === "Escape") {
                popup[0]?.hide();
                return true;
              }
              return component?.ref?.onKeyDown({ event: props.event }) ?? false;
            },
            onExit() {
              popup[0]?.destroy();
              component?.destroy();
              popup = [];
              component = null;
            },
          };
        },
      }),
    ];
  },
});

export default SlashMenu;
