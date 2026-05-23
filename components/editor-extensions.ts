"use client";

import { Extension, findChildren, InputRule, type Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Typography from "@tiptap/extension-typography";
import Image from "@tiptap/extension-image";
import Blockquote from "@tiptap/extension-blockquote";
import {
  TextStyle,
  Color,
  BackgroundColor,
} from "@tiptap/extension-text-style";
import {
  Details,
  DetailsContent,
  DetailsSummary,
} from "@tiptap/extension-details";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight } from "lowlight";

// Blockquote with no input rules — keeps the node available for the
// slash menu's "Quote" command but frees up the `> ` markdown shortcut
// for the Toggle (Details) block. See ToggleShortcut below.
const QuoteOnlyBlockquote = Blockquote.extend({
  addInputRules() {
    return [];
  },
});
// Curated language set. `lowlight`'s `common` bundle pulls ~190 grammars
// (~150 KB minzipped); the list below covers the languages students
// actually paste into code blocks. Add more here as needed.
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import markdown from "highlight.js/lib/languages/markdown";
import sql from "highlight.js/lib/languages/sql";
import rust from "highlight.js/lib/languages/rust";
import type { AnyExtension } from "@tiptap/core";

import { MathInline } from "./extensions/MathInline";
import { MathBlock } from "./extensions/MathBlock";
import { MermaidBlock } from "./extensions/MermaidBlock";
import { CalloutBlock } from "./extensions/CalloutBlock";
import { SlashMenu } from "./extensions/SlashMenu";
import { Citation } from "./extensions/Citation";
import { CitationMention } from "./extensions/CitationMention";
import { PageLink } from "./extensions/PageLink";
import { PageLinkCreator } from "./extensions/PageLinkCreator";

const lowlight = createLowlight({
  javascript,
  typescript,
  python,
  bash,
  json,
  xml,
  css,
  markdown,
  sql,
  rust,
});

export type CitationContext = {
  sourceNodeId: string | null;
  workspaceId: string | null;
};

export type EditorBaseOptions = {
  placeholder?: string;
  withSlashMenu?: boolean;
  citationContext?: CitationContext | null;
};

// Notion-style ergonomics for the Details (toggle) block. Owns:
//   - `> ` input rule that creates a toggle.
//   - Enter / Tab in the summary expand the toggle and drop the cursor
//     into its body (creates an empty paragraph if the body's empty).
//   - Shift-Tab from inside the body moves the cursor back to the
//     summary.
// Priority 1000 puts these shortcuts ahead of the Details extension's
// default Enter handler (which would otherwise create a sibling block).
const ToggleShortcut = Extension.create({
  name: "toggleShortcut",
  priority: 1000,

  addInputRules() {
    return [
      new InputRule({
        find: /^>\s$/,
        handler: ({ chain, range }) => {
          chain().deleteRange(range).setDetails().focus().run();
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    // Open the parent details (if closed) and drop the cursor at the
    // start of its body. Returns false when the cursor isn't currently
    // inside a detailsSummary so the default keymap can keep working
    // for ordinary paragraphs / lists.
    const enterBody = (editor: Editor) => {
      if (!editor) return false;
      const { schema, selection, doc } = editor.state;
      const detailsType = schema.nodes.details;
      const summaryType = schema.nodes.detailsSummary;
      if (!detailsType || !summaryType) return false;
      const { $from } = selection;
      if ($from.parent.type !== summaryType) return false;

      // Walk up to find the enclosing details node.
      let detailsPos = -1;
      for (let d = $from.depth; d > 0; d -= 1) {
        if ($from.node(d).type === detailsType) {
          detailsPos = $from.before(d);
          break;
        }
      }
      if (detailsPos < 0) return false;
      const detailsNode = doc.nodeAt(detailsPos);
      if (!detailsNode || detailsNode.type !== detailsType) return false;

      const contentType = schema.nodes.detailsContent;
      if (!contentType) return false;
      const contentBlocks = findChildren(
        detailsNode,
        (node) => node.type === contentType
      );
      if (!contentBlocks.length) return false;

      // Resolve a text position inside the first block of detailsContent.
      // `contentBlock.pos` is the offset within the details node; +1 enters
      // detailsContent, +1 again enters its first child block (paragraph).
      const contentStart = detailsPos + 1 + contentBlocks[0].pos;
      const bodyEntryPos = contentStart + 2;

      const { tr } = editor.state;
      if (!detailsNode.attrs.open) {
        tr.setNodeMarkup(detailsPos, undefined, {
          ...detailsNode.attrs,
          open: true,
        });
      }
      const $body = tr.doc.resolve(bodyEntryPos);
      const target = TextSelection.near($body, 1);
      tr.setSelection(target).scrollIntoView();
      editor.view.dispatch(tr);
      return true;
    };

    // Move the cursor from inside the body back up to the summary.
    // Doesn't close the toggle — leaves the body visible so the user
    // can see what they were just editing.
    const exitToSummary = (editor: Editor) => {
      if (!editor) return false;
      const { schema, selection, doc } = editor.state;
      const detailsType = schema.nodes.details;
      const summaryType = schema.nodes.detailsSummary;
      const contentType = schema.nodes.detailsContent;
      if (!detailsType || !summaryType || !contentType) return false;
      const { $from } = selection;

      // Walk up to find an enclosing detailsContent.
      let inContent = false;
      let detailsPos = -1;
      for (let d = $from.depth; d > 0; d -= 1) {
        if ($from.node(d).type === contentType) inContent = true;
        if ($from.node(d).type === detailsType) {
          detailsPos = $from.before(d);
          break;
        }
      }
      if (!inContent || detailsPos < 0) return false;
      const detailsNode = doc.nodeAt(detailsPos);
      if (!detailsNode || detailsNode.type !== detailsType) return false;

      // Inline summary text starts one position inside the details node.
      const summaryEntryPos = detailsPos + 1;
      const { tr } = editor.state;
      const target = TextSelection.near(tr.doc.resolve(summaryEntryPos), 1);
      tr.setSelection(target).scrollIntoView();
      editor.view.dispatch(tr);
      return true;
    };

    return {
      Enter: ({ editor }) => enterBody(editor),
      Tab: ({ editor }) => enterBody(editor),
      "Shift-Tab": ({ editor }) => exitToSummary(editor),
    };
  },
});

export function createBaseExtensions({
  placeholder = "Start writing... (press / for commands)",
  withSlashMenu = true,
  citationContext = null,
}: EditorBaseOptions = {}): AnyExtension[] {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      // StarterKit ships its own Link extension since v3 — disable it so
      // our explicit `Link.configure(...)` below wins (otherwise both run
      // and Tiptap warns: "Duplicate extension names found: ['link']").
      link: false,
      // Disable StarterKit's Blockquote so its `> ` markdown shortcut
      // doesn't conflict with our Toggle shortcut. We re-add a stripped
      // version (`QuoteOnlyBlockquote`) below so the slash menu's
      // "Quote" entry keeps working.
      blockquote: false,
    }),
    QuoteOnlyBlockquote,
    Placeholder.configure({
      // Per-node placeholder. We use a function so the detailsSummary
      // node gets its own hint ("Toggle title") instead of inheriting
      // the editor's main placeholder. `includeChildren: true` lets the
      // Placeholder extension descend into Details / Callout blocks to
      // see their inner textblocks.
      placeholder: ({ node }) => {
        if (node.type.name === "detailsSummary") return "Toggle title";
        return placeholder;
      },
      includeChildren: true,
      emptyEditorClass:
        "before:content-[attr(data-placeholder)] before:text-[var(--pg-muted)] before:float-left before:h-0 before:pointer-events-none",
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: {
        class: "text-[var(--pg-accent)] underline underline-offset-2",
        rel: "noopener noreferrer",
        target: "_blank",
      },
    }),
    // multicolor:true lets `setHighlight({ color })` round-trip an explicit
    // CSS color, which is what the toolbar background-color picker needs.
    Highlight.configure({ multicolor: true }),
    // TextStyle is the mark Color/BackgroundColor sit on top of. Listed
    // explicitly so the extension dependency is obvious; both Color and
    // BackgroundColor still register it themselves if missing.
    TextStyle,
    Color,
    BackgroundColor,
    Typography,
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: { class: "pg-image" },
    }),
    Details.configure({
      persist: true,
      HTMLAttributes: { class: "pg-details" },
      openClassName: "is-open",
      // Stamp the toggle button so our CSS can style the chevron via
      // `.pg-details > .pg-details-toggle::before`. Without this the
      // button renders as a default browser button and the user sees
      // no chevron at all.
      renderToggleButton: ({ element, isOpen }) => {
        element.setAttribute("class", "pg-details-toggle");
        element.setAttribute(
          "aria-label",
          isOpen ? "Collapse toggle" : "Expand toggle"
        );
      },
    }),
    DetailsSummary,
    DetailsContent,
    ToggleShortcut,
    CodeBlockLowlight.configure({ lowlight }),
    MathInline,
    MathBlock,
    MermaidBlock,
    CalloutBlock,
    Citation,
    PageLink,
  ];

  if (withSlashMenu) {
    extensions.push(SlashMenu);
  }

  if (citationContext) {
    extensions.push(
      CitationMention.configure({
        sourceNodeId: citationContext.sourceNodeId,
        workspaceId: citationContext.workspaceId,
      })
    );
    // Subpage creation reuses the same source context — we need the parent
    // node id so the new page lands beside it and gets a logical edge.
    extensions.push(
      PageLinkCreator.configure({
        sourceNodeId: citationContext.sourceNodeId,
        workspaceId: citationContext.workspaceId,
      })
    );
  }

  return extensions;
}
