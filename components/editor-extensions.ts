"use client";

import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Typography from "@tiptap/extension-typography";
import Image from "@tiptap/extension-image";
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
    }),
    Placeholder.configure({
      placeholder,
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
    }),
    DetailsSummary,
    DetailsContent,
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
