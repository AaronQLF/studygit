"use client";

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";

export type CalloutVariant = "info" | "warn" | "tip" | "quote";

const VARIANT_ICONS: Record<CalloutVariant, string> = {
  info: "i",
  warn: "!",
  tip: "★",
  quote: "“",
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    calloutBlock: {
      insertCallout: (variant?: CalloutVariant) => ReturnType;
      setCalloutVariant: (variant: CalloutVariant) => ReturnType;
    };
  }
}

export const CalloutBlock = Node.create({
  name: "calloutBlock",
  group: "block",
  content: "block+",
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      variant: {
        default: "info" as CalloutVariant,
        parseHTML: (element) =>
          (element.getAttribute("data-variant") as CalloutVariant) ?? "info",
        renderHTML: (attrs) => ({
          "data-variant": attrs.variant as CalloutVariant,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='callout']" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const variant = (node.attrs.variant as CalloutVariant) ?? "info";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "callout",
        class: `pg-callout pg-callout-${variant}`,
      }),
      [
        "div",
        {
          class: "pg-callout-icon",
          contenteditable: "false",
        },
        VARIANT_ICONS[variant],
      ],
      ["div", { class: "pg-callout-body" }, 0],
    ];
  },

  addCommands() {
    return {
      insertCallout:
        (variant = "info") =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { variant },
            content: [
              {
                type: "paragraph",
                content: [],
              },
            ],
          }),
      setCalloutVariant:
        (variant) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { variant }),
    } as Partial<RawCommands>;
  },
});

export default CalloutBlock;
