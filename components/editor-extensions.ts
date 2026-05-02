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
  Details,
  DetailsContent,
  DetailsSummary,
} from "@tiptap/extension-details";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";
import type { AnyExtension } from "@tiptap/core";

import { MathInline } from "./extensions/MathInline";
import { MathBlock } from "./extensions/MathBlock";
import { MermaidBlock } from "./extensions/MermaidBlock";
import { CalloutBlock } from "./extensions/CalloutBlock";
import { SlashMenu } from "./extensions/SlashMenu";

const lowlight = createLowlight(common);

export type EditorBaseOptions = {
  placeholder?: string;
  withSlashMenu?: boolean;
};

export function createBaseExtensions({
  placeholder = "Start writing... (press / for commands)",
  withSlashMenu = true,
}: EditorBaseOptions = {}): AnyExtension[] {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
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
    Highlight.configure({ multicolor: false }),
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
  ];

  if (withSlashMenu) {
    extensions.push(SlashMenu);
  }

  return extensions;
}
