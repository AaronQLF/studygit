"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import {
  Bold,
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Sigma,
  Strikethrough,
  Undo2,
} from "lucide-react";
import { createBaseExtensions } from "./editor-extensions";

type ToolbarButtonProps = {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  icon: React.ComponentType<{ size?: number }>;
};

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  icon: Icon,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--pg-muted)] transition-colors",
        active
          ? "bg-[var(--pg-bg-elevated)] text-[var(--pg-fg)]"
          : "hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      <Icon size={14} />
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-1.5 py-1">
      <ToolbarButton
        title="Heading 1"
        icon={Heading1}
        active={editor.isActive("heading", { level: 1 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
      />
      <ToolbarButton
        title="Heading 2"
        icon={Heading2}
        active={editor.isActive("heading", { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      />
      <ToolbarButton
        title="Heading 3"
        icon={Heading3}
        active={editor.isActive("heading", { level: 3 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
      />
      <span className="mx-1 h-5 w-px bg-[var(--pg-border)]" />
      <ToolbarButton
        title="Bold (⌘B)"
        icon={Bold}
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        title="Italic (⌘I)"
        icon={Italic}
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        title="Strikethrough"
        icon={Strikethrough}
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <ToolbarButton
        title="Highlight"
        icon={Highlighter}
        active={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      />
      <ToolbarButton
        title="Inline code"
        icon={Code}
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
      <span className="mx-1 h-5 w-px bg-[var(--pg-border)]" />
      <ToolbarButton
        title="Bulleted list"
        icon={List}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        title="Numbered list"
        icon={ListOrdered}
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        title="Task list"
        icon={CheckSquare}
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      />
      <ToolbarButton
        title="Quote"
        icon={Quote}
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        title="Math (inline)"
        icon={Sigma}
        onClick={() => editor.chain().focus().insertMathInline("").run()}
      />
      <span className="mx-1 h-5 w-px bg-[var(--pg-border)]" />
      <ToolbarButton
        title="Add / edit link"
        icon={LinkIcon}
        active={editor.isActive("link")}
        onClick={() => {
          const previous = editor.getAttributes("link").href as
            | string
            | undefined;
          const url = window.prompt("URL", previous ?? "https://");
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
          }
          editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href: url })
            .run();
        }}
      />
      <span className="mx-1 h-5 w-px bg-[var(--pg-border)]" />
      <ToolbarButton
        title="Undo (⌘Z)"
        icon={Undo2}
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <ToolbarButton
        title="Redo (⌘⇧Z)"
        icon={Redo2}
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      />
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start writing...",
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: createBaseExtensions({ placeholder, withSlashMenu: true }),
    content: value || "",
    editorProps: {
      attributes: {
        class: clsx(
          "pg-prose focus:outline-none min-h-full px-5 py-4 text-[14px] leading-relaxed text-[var(--pg-fg)]",
          className
        ),
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChangeRef.current(html === "<p></p>" ? "" : html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || "";
    const normalizedCurrent = current === "<p></p>" ? "" : current;
    if (normalizedCurrent === incoming) return;
    editor.commands.setContent(incoming || "", { emitUpdate: false });
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--pg-muted)]">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar editor={editor} />
      <div className="flex-1 min-h-0 overflow-y-auto bg-[var(--pg-bg)]">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}
