"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import {
  Bold,
  CheckSquare,
  Code,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  ListTree,
  Minus,
  Plus,
  Quote,
  Redo2,
  Sigma,
  Sparkles,
  Strikethrough,
  Undo2,
} from "lucide-react";
import {
  createBaseExtensions,
  type CitationContext,
} from "./extensions";
import { ColorPickerButton } from "@/components/ui/ColorPickerButton";
import { SelectionToolbar } from "./SelectionToolbar";
import { SUBPAGE_CREATE_EVENT } from "./extensions/PageLinkCreator";
import {
  PAGE_ZOOM_DEFAULT,
  PAGE_ZOOM_MAX,
  PAGE_ZOOM_MIN,
  usePageZoom,
} from "@/lib/page-zoom";
import { ToolbarButton } from "@/components/ui/ToolbarButton";

export function PageEditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 px-3 py-1">
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
      <span className="mx-1 h-4 w-px bg-[var(--pg-border)]/60" />
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
      <ColorPickerButton editor={editor} mode="text" />
      <ColorPickerButton editor={editor} mode="highlight" />
      <ToolbarButton
        title="Inline code"
        icon={Code}
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
      <span className="mx-1 h-4 w-px bg-[var(--pg-border)]/60" />
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
        title="Code block"
        icon={Code}
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <span className="mx-1 h-4 w-px bg-[var(--pg-border)]/60" />
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
      <ToolbarButton
        title="Insert subpage (/page)"
        icon={FileText}
        onClick={() => {
          // Same hook the slash menu uses — keeps the canvas wiring in one
          // place (see PageLinkCreator).
          window.dispatchEvent(
            new CustomEvent(SUBPAGE_CREATE_EVENT, { detail: { editor } })
          );
        }}
      />
      <ToolbarButton
        title="Math (inline)"
        icon={Sigma}
        onClick={() => editor.chain().focus().insertMathInline("").run()}
      />
      <ToolbarButton
        title="Mermaid diagram"
        icon={Sparkles}
        onClick={() => editor.chain().focus().insertMermaidBlock().run()}
      />
      {/* Push undo/redo + zoom to the right edge of the strip so the
          left half stays a clean "create / format" cluster. The spacer
          gets `ml-auto` so flex-wrap still degrades gracefully on
          narrow panels (the right cluster just flows onto the next
          line instead of clipping). */}
      <span className="ml-auto" aria-hidden />
      <OutlineButton editor={editor} />
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
      <ZoomControls />
    </div>
  );
}

// Heading outline ("table of contents") popover — scans the document for
// headings on open and jumps the editor to the one the user picks. Long
// study notes get navigable without scrolling blind.
function OutlineButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<
    Array<{ level: number; text: string; pos: number }>
  >([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const toggle = () => {
    if (!open) {
      const found: Array<{ level: number; text: string; pos: number }> = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          found.push({
            level: (node.attrs.level as number) ?? 1,
            text: node.textContent.trim() || "Untitled heading",
            pos,
          });
        }
      });
      setItems(found);
    }
    setOpen((v) => !v);
  };

  const jumpTo = (pos: number) => {
    setOpen(false);
    editor.chain().focus().setTextSelection(pos + 1).run();
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  };

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <ToolbarButton title="Outline" icon={ListTree} onClick={toggle} active={open} />
      {open ? (
        <div className="absolute right-0 top-7 z-40 max-h-[320px] min-w-[220px] overflow-y-auto rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg)] p-1 shadow-[var(--pg-shadow)]">
          {items.length === 0 ? (
            <div className="px-2 py-2 text-[11.5px] text-[var(--pg-muted)]">
              No headings yet — add one with <code>#</code> or the slash menu.
            </div>
          ) : (
            items.map((item, i) => (
              <button
                key={`${item.pos}-${i}`}
                type="button"
                onClick={() => jumpTo(item.pos)}
                className="block w-full truncate rounded-md px-2 py-1 text-left text-[12px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
                style={{ paddingLeft: 8 + (item.level - 1) * 14 }}
              >
                {item.text}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

// Live word count + reading time, debounced off the editor's update
// events so typing bursts don't recount a long doc per keystroke.
function EditorStats({ editor }: { editor: Editor }) {
  const [stats, setStats] = useState<{ words: number; minutes: number }>({
    words: 0,
    minutes: 0,
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const recount = () => {
      const doc = editor.state.doc;
      const text = doc.textBetween(0, doc.content.size, " ", " ");
      const words = (text.match(/\S+/g) ?? []).length;
      setStats({ words, minutes: Math.max(1, Math.ceil(words / 200)) });
    };
    const onUpdate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(recount, 300);
    };
    // Initial count deferred to a microtask (codebase rule: no sync
    // setState inside the effect body).
    queueMicrotask(recount);
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      if (timer) clearTimeout(timer);
    };
  }, [editor]);

  if (stats.words === 0) return null;
  return (
    <div className="pointer-events-none shrink-0 select-none border-t border-[var(--pg-border)]/60 px-4 py-1 text-right text-[10.5px] tabular-nums text-[var(--pg-muted)]">
      {stats.words.toLocaleString()} {stats.words === 1 ? "word" : "words"} ·{" "}
      {stats.minutes} min read
    </div>
  );
}

function ZoomControls() {
  const zoom = usePageZoom((s) => s.zoom);
  const zoomIn = usePageZoom((s) => s.zoomIn);
  const zoomOut = usePageZoom((s) => s.zoomOut);
  const reset = usePageZoom((s) => s.reset);
  const atDefault = zoom === PAGE_ZOOM_DEFAULT;
  const atMin = zoom <= PAGE_ZOOM_MIN + 1e-6;
  const atMax = zoom >= PAGE_ZOOM_MAX - 1e-6;
  return (
    <div className="ml-1 inline-flex items-center" data-page-zoom-controls>
      <span className="mx-1 h-4 w-px bg-[var(--pg-border)]/60" />
      <ToolbarButton
        title="Zoom out (⌘−)"
        icon={Minus}
        onClick={zoomOut}
        disabled={atMin}
      />
      <button
        type="button"
        onClick={reset}
        disabled={atDefault}
        title={atDefault ? "Page zoom (⌘0 to reset)" : "Reset zoom (⌘0)"}
        className={clsx(
          "inline-flex h-6 min-w-[32px] items-center justify-center rounded-[5px] px-1.5 text-[10px] font-medium tabular-nums tracking-tight transition-colors",
          atDefault
            ? "text-[var(--pg-muted)]"
            : "text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]",
          atDefault && "cursor-default"
        )}
      >
        {Math.round(zoom * 100)}%
      </button>
      <ToolbarButton
        title="Zoom in (⌘+)"
        icon={Plus}
        onClick={zoomIn}
        disabled={atMax}
      />
    </div>
  );
}

// Imperative handle exposed to callers (PagePanelBody) so they can render
// the formatting toolbar at panel level instead of inline. Only the
// `editor` reference is exposed — the debounce / zoom / autosave logic
// continues to live inside this component.
export type PageEditorHandle = {
  editor: Editor | null;
};

export const PageEditor = forwardRef<
  PageEditorHandle,
  {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    className?: string;
    showToolbar?: boolean;
    citationContext?: CitationContext | null;
  }
>(function PageEditor(
  {
    value,
    onChange,
    placeholder = "Start writing... (press / for commands)",
    className,
    showToolbar = true,
    citationContext = null,
  },
  ref
) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Page-zoom: read once for the CSS var; the toolbar's ZoomControls
  // sibling component subscribes to the store directly for its own
  // button states so we don't pay an extra render here on every tick.
  const hydratePageZoom = usePageZoom((s) => s.hydrate);
  const zoomIn = usePageZoom((s) => s.zoomIn);
  const zoomOut = usePageZoom((s) => s.zoomOut);
  const resetZoom = usePageZoom((s) => s.reset);
  useEffect(() => {
    hydratePageZoom();
  }, [hydratePageZoom]);

  // Debounce keystroke → store propagation so we don't trigger the
  // canvas/panel re-render cascade and full-state JSON.stringify on every
  // character. We flush on blur and on editor destroy so the last burst is
  // never dropped.
  const pendingRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    html: string;
    dirty: boolean;
  }>({ timer: null, html: "", dirty: false });

  const flushPending = () => {
    if (!pendingRef.current.dirty) return;
    if (pendingRef.current.timer) {
      clearTimeout(pendingRef.current.timer);
      pendingRef.current.timer = null;
    }
    pendingRef.current.dirty = false;
    onChangeRef.current(pendingRef.current.html);
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: createBaseExtensions({
      placeholder,
      withSlashMenu: true,
      citationContext,
    }),
    content: value || "",
    editorProps: {
      attributes: {
        // `pg-page-editor` is the high-specificity hook that lets the
        // `.pg-page-scope` ancestor drive font-size via `--pg-page-zoom`.
        // We intentionally drop `text-[15px]` here so the scope's
        // `calc(15px * var(--pg-page-zoom))` rule wins.
        class: clsx(
          "pg-prose pg-page-editor focus:outline-none min-h-full px-8 pt-2 pb-8 text-[var(--pg-fg)]",
          className
        ),
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      pendingRef.current.html = html === "<p></p>" ? "" : html;
      pendingRef.current.dirty = true;
      if (pendingRef.current.timer) clearTimeout(pendingRef.current.timer);
      pendingRef.current.timer = setTimeout(() => {
        pendingRef.current.timer = null;
        if (!pendingRef.current.dirty) return;
        pendingRef.current.dirty = false;
        onChangeRef.current(pendingRef.current.html);
      }, 180);
    },
    onBlur: () => {
      flushPending();
    },
  });

  useEffect(() => {
    if (!editor) return;
    return () => {
      // Flush any in-flight debounce before the editor instance goes away
      // (e.g. when the panel closes mid-typing-burst).
      flushPending();
    };
  }, [editor]);

  // Notion-style page-zoom shortcuts. Only intercept when the editor
  // owns focus so the browser's own Cmd-+ / Cmd-- still zoom the whole
  // UI when the user isn't inside a page. `=` is matched alongside `+`
  // because that's the character produced by the unshifted plus key on
  // most keyboards (Cmd+= is the natural "zoom in" gesture in Chrome).
  useEffect(() => {
    if (!editor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!editor.isFocused) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.shiftKey || event.altKey) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor, zoomIn, zoomOut, resetZoom]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || "";
    const normalizedCurrent = current === "<p></p>" ? "" : current;
    if (normalizedCurrent === incoming) return;
    // External value change (e.g. hydration / undo from another path) —
    // drop any pending debounced flush so we don't clobber the new content.
    if (pendingRef.current.timer) {
      clearTimeout(pendingRef.current.timer);
      pendingRef.current.timer = null;
    }
    pendingRef.current.dirty = false;
    editor.commands.setContent(incoming || "", { emitUpdate: false });
  }, [value, editor]);

  // Expose the editor instance to the imperative ref so callers can
  // render the formatting toolbar (or other editor-driven UI) outside
  // PageEditor's own DOM.
  useImperativeHandle(ref, () => ({ editor: editor ?? null }), [editor]);

  if (!editor) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--pg-muted)]">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showToolbar ? <PageEditorToolbar editor={editor} /> : null}
      <SelectionToolbar editor={editor} citationContext={citationContext} />
      <div className="flex-1 min-h-0 overflow-y-auto bg-[var(--pg-bg)]">
        <EditorContent editor={editor} className="h-full" />
      </div>
      <EditorStats editor={editor} />
    </div>
  );
});
