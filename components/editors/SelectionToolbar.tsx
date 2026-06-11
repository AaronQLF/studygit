"use client";

// Notion-style floating toolbar over the current text selection. Owns:
//   - "Turn into" block-type menu (paragraph/headings/lists/quote/callout/code)
//   - Inline marks: bold / italic / underline / strike / code
//   - Text + highlight color pickers
//   - Link editing via an inline popover (no window.prompt)
//   - Inline AI rewrites (improve / grammar / shorter / longer / simplify)
//   - "Flashcard" — turn the selection into spaced-repetition cards
//   - Table controls when the caret sits inside a table
//
// Rendered by PageEditor and RichTextEditor through TipTap's BubbleMenu
// (floating-ui under the hood). All state is local; document mutations go
// through editor commands so undo history stays clean.

import { useCallback, useEffect, useRef, useState } from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import {
  ArrowDownToLine,
  ArrowRightToLine,
  Bold,
  Check,
  ChevronDown,
  Code,
  GalleryVertical,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Layers,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Pilcrow,
  Quote,
  Sparkles,
  SquareCheck,
  Strikethrough,
  Trash2,
  TriangleAlert,
  Underline as UnderlineIcon,
  type LucideIcon,
} from "lucide-react";
import { ColorPickerButton } from "@/components/ui/ColorPickerButton";
import { ToolbarButton } from "@/components/ui/ToolbarButton";
import { useToastStore } from "@/components/ui/Toast";
import { useStore } from "@/lib/store";
import {
  AI_SETTINGS_DIALOG_EVENT,
  hasAiCredentials,
} from "@/lib/ai-settings";
import { REWRITE_ACTIONS, rewriteText, type RewriteAction } from "@/lib/ai-rewrite";
import { addFlashcardsFromSelection } from "@/lib/flashcards-from-selection";
import type { CitationContext } from "./extensions";

type TurnIntoOption = {
  label: string;
  icon: LucideIcon;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
};

const TURN_INTO: TurnIntoOption[] = [
  {
    label: "Text",
    icon: Pilcrow,
    isActive: (e) => e.isActive("paragraph"),
    run: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    label: "Heading 1",
    icon: Heading1,
    isActive: (e) => e.isActive("heading", { level: 1 }),
    run: (e) => e.chain().focus().setNode("heading", { level: 1 }).run(),
  },
  {
    label: "Heading 2",
    icon: Heading2,
    isActive: (e) => e.isActive("heading", { level: 2 }),
    run: (e) => e.chain().focus().setNode("heading", { level: 2 }).run(),
  },
  {
    label: "Heading 3",
    icon: Heading3,
    isActive: (e) => e.isActive("heading", { level: 3 }),
    run: (e) => e.chain().focus().setNode("heading", { level: 3 }).run(),
  },
  {
    label: "Bulleted list",
    icon: List,
    isActive: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: "Numbered list",
    icon: ListOrdered,
    isActive: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "Task list",
    icon: SquareCheck,
    isActive: (e) => e.isActive("taskList"),
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    label: "Quote",
    icon: Quote,
    isActive: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    label: "Code block",
    icon: Code,
    isActive: (e) => e.isActive("codeBlock"),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
];

function selectionText(editor: Editor): string {
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, "\n");
}

export function SelectionToolbar({
  editor,
  citationContext = null,
}: {
  editor: Editor;
  citationContext?: CitationContext | null;
}) {
  const [menu, setMenu] = useState<"none" | "turninto" | "ai" | "link">("none");
  const [linkDraft, setLinkDraft] = useState("");
  const [aiBusy, setAiBusy] = useState<RewriteAction | null>(null);
  const [cardsBusy, setCardsBusy] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const pushToast = useToastStore((s) => s.push);

  // Close any open sub-menu whenever the selection moves — the bubble is
  // re-anchored and a stale dropdown floating mid-air feels broken.
  useEffect(() => {
    const onSelection = () => setMenu("none");
    editor.on("selectionUpdate", onSelection);
    return () => {
      editor.off("selectionUpdate", onSelection);
    };
  }, [editor]);

  useEffect(() => {
    if (menu !== "link") return;
    // Deferred to a microtask — same pattern the rest of the codebase
    // uses to avoid synchronous setState inside an effect body.
    queueMicrotask(() => {
      setLinkDraft((editor.getAttributes("link").href as string) ?? "");
    });
    requestAnimationFrame(() => linkInputRef.current?.focus());
  }, [menu, editor]);

  const applyLink = useCallback(() => {
    const url = linkDraft.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const href = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setMenu("none");
  }, [editor, linkDraft]);

  const runRewrite = useCallback(
    async (action: RewriteAction) => {
      if (aiBusy) return;
      if (!hasAiCredentials()) {
        window.dispatchEvent(new CustomEvent(AI_SETTINGS_DIALOG_EVENT));
        return;
      }
      const { from, to } = editor.state.selection;
      const text = selectionText(editor);
      if (!text.trim()) return;
      setAiBusy(action);
      const result = await rewriteText(action, text);
      setAiBusy(null);
      setMenu("none");
      if (!result.ok) {
        pushToast({ message: `AI rewrite failed: ${result.error}` }, 6000);
        return;
      }
      // Replace the selection in one transaction so ⌘Z restores the
      // original in a single step. insertContentAt with plain text keeps
      // the surrounding block structure; newlines become paragraph splits.
      editor
        .chain()
        .focus()
        .insertContentAt({ from, to }, result.text)
        .run();
    },
    [editor, aiBusy, pushToast]
  );

  const makeFlashcards = useCallback(async () => {
    if (cardsBusy) return;
    const pageNodeId = citationContext?.sourceNodeId;
    const workspaceId = citationContext?.workspaceId;
    if (!pageNodeId || !workspaceId) return;
    const text = selectionText(editor);
    if (!text.trim()) return;
    setCardsBusy(true);
    const pageNode = useStore
      .getState()
      .nodes.find((n) => n.id === pageNodeId);
    const pageTitle =
      pageNode && "title" in pageNode.data
        ? ((pageNode.data as { title?: string }).title ?? "")
        : "";
    const result = await addFlashcardsFromSelection({
      pageNodeId,
      workspaceId,
      selectionText: text,
      pageTitle,
    });
    setCardsBusy(false);
    pushToast({ message: result.message }, 5000);
  }, [editor, citationContext, cardsBusy, pushToast]);

  const inTable = editor.isActive("table");
  const canFlashcard = Boolean(
    citationContext?.sourceNodeId && citationContext?.workspaceId
  );

  const activeTurnInto =
    TURN_INTO.find((o) => o.isActive(editor)) ?? TURN_INTO[0];

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="pg-selection-toolbar"
      updateDelay={150}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: e }) => {
        if (!e.isEditable) return false;
        // Inside code blocks formatting marks don't apply — stay out of
        // the way (Notion does the same).
        if (e.isActive("codeBlock")) return false;
        const { from, to, empty } = e.state.selection;
        if (empty || to - from === 0) return false;
        return e.state.doc.textBetween(from, to).trim().length > 0;
      }}
    >
      <div className="pg-selection-toolbar relative flex items-center gap-0.5 rounded-[var(--pg-radius-md)] border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] px-1 py-0.5 shadow-[var(--pg-shadow)]">
        {/* Turn into */}
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1 rounded-[5px] px-1.5 text-[11.5px] font-medium text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
          onClick={() => setMenu(menu === "turninto" ? "none" : "turninto")}
          title="Turn into"
        >
          <activeTurnInto.icon size={12} />
          <ChevronDown size={10} className="text-[var(--pg-muted)]" />
        </button>

        <span className="mx-0.5 h-4 w-px bg-[var(--pg-border)]/70" />

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
          title="Underline (⌘U)"
          icon={UnderlineIcon}
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          title="Strikethrough"
          icon={Strikethrough}
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton
          title="Inline code"
          icon={Code}
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
        <ColorPickerButton editor={editor} mode="text" />
        <ColorPickerButton editor={editor} mode="highlight" />
        <ToolbarButton
          title="Link"
          icon={LinkIcon}
          active={editor.isActive("link")}
          onClick={() => setMenu(menu === "link" ? "none" : "link")}
        />

        <span className="mx-0.5 h-4 w-px bg-[var(--pg-border)]/70" />

        {/* AI rewrite */}
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1 rounded-[5px] px-1.5 text-[11.5px] font-medium text-[var(--pg-accent)] hover:bg-[var(--pg-accent-soft)]"
          onClick={() => setMenu(menu === "ai" ? "none" : "ai")}
          title="Rewrite with AI"
          disabled={aiBusy != null}
        >
          {aiBusy ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Sparkles size={12} />
          )}
          AI
          <ChevronDown size={10} className="opacity-70" />
        </button>

        {/* Flashcard from selection */}
        {canFlashcard ? (
          <button
            type="button"
            className="inline-flex h-6 items-center gap-1 rounded-[5px] px-1.5 text-[11.5px] font-medium text-[var(--pg-study)] hover:bg-[var(--pg-study-soft)] "
            onClick={makeFlashcards}
            disabled={cardsBusy}
            title="Turn this selection into flashcards"
          >
            {cardsBusy ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Layers size={12} />
            )}
            Card
          </button>
        ) : null}

        {/* Table controls — shown while the selection sits in a table */}
        {inTable ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-[var(--pg-border)]/70" />
            <ToolbarButton
              title="Add row below"
              icon={ArrowDownToLine}
              onClick={() => editor.chain().focus().addRowAfter().run()}
            />
            <ToolbarButton
              title="Add column right"
              icon={ArrowRightToLine}
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            />
            <ToolbarButton
              title="Toggle header row"
              icon={GalleryVertical}
              onClick={() => editor.chain().focus().toggleHeaderRow().run()}
            />
            <ToolbarButton
              title="Delete row"
              icon={TriangleAlert}
              onClick={() => editor.chain().focus().deleteRow().run()}
            />
            <ToolbarButton
              title="Delete table"
              icon={Trash2}
              onClick={() => editor.chain().focus().deleteTable().run()}
            />
          </>
        ) : null}

        {/* ---- sub-menus ---- */}
        {menu === "turninto" ? (
          <div className="absolute left-0 top-8 z-40 min-w-[180px] rounded-[var(--pg-radius-md)] border border-[var(--pg-border)] bg-[var(--pg-bg)] p-1 shadow-[var(--pg-shadow)]">
            {TURN_INTO.map((option) => {
              const active = option.isActive(editor);
              return (
                <button
                  key={option.label}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
                  onClick={() => {
                    option.run(editor);
                    setMenu("none");
                  }}
                >
                  <option.icon size={12} className="text-[var(--pg-muted)]" />
                  {option.label}
                  {active ? (
                    <Check size={12} className="ml-auto text-[var(--pg-accent)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {menu === "ai" ? (
          <div className="absolute left-0 top-8 z-40 min-w-[200px] rounded-[var(--pg-radius-md)] border border-[var(--pg-border)] bg-[var(--pg-bg)] p-1 shadow-[var(--pg-shadow)]">
            {REWRITE_ACTIONS.map(({ action, label }) => (
              <button
                key={action}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)] disabled:opacity-50"
                disabled={aiBusy != null}
                onClick={() => void runRewrite(action)}
              >
                {aiBusy === action ? (
                  <Loader2 size={12} className="animate-spin text-[var(--pg-accent)]" />
                ) : (
                  <Sparkles size={12} className="text-[var(--pg-accent)]" />
                )}
                {label}
              </button>
            ))}
            <div className="mt-1 border-t border-[var(--pg-border)] px-2 pb-0.5 pt-1 text-[10.5px] text-[var(--pg-muted)]">
              Replaces the selection · ⌘Z undoes
            </div>
          </div>
        ) : null}

        {menu === "link" ? (
          <div className="absolute left-0 top-8 z-40 flex w-[260px] items-center gap-1 rounded-[var(--pg-radius-md)] border border-[var(--pg-border)] bg-[var(--pg-bg)] p-1.5 shadow-[var(--pg-shadow)]">
            <input
              ref={linkInputRef}
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setMenu("none");
                }
              }}
              placeholder="Paste a link… (empty removes)"
              className="min-w-0 flex-1 rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2 py-1 text-[12px] text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)] focus:border-[var(--pg-border-strong)]"
            />
            <button
              type="button"
              onClick={applyLink}
              className="inline-flex h-6 items-center rounded-md bg-[var(--pg-accent)] px-2 text-[11.5px] font-medium text-white hover:opacity-90"
            >
              Set
            </button>
          </div>
        ) : null}
      </div>
    </BubbleMenu>
  );
}
