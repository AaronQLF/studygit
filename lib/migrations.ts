import { marked } from "marked";
import type {
  AnyNodeData,
  BlogNodeData,
  CanvasNode,
  PageNodeData,
} from "./types";

marked.setOptions({
  gfm: true,
  breaks: false,
});

export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return "";
  try {
    const html = marked.parse(markdown, { async: false }) as string;
    return html.trim();
  } catch {
    const escaped = markdown
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<p>${escaped.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`;
  }
}

export function blogDataToPageData(blog: BlogNodeData): PageNodeData {
  return {
    kind: "page",
    title: blog.title,
    content: markdownToHtml(blog.markdown),
  };
}

export function migrateNodeData(data: AnyNodeData): AnyNodeData {
  if (data.kind === "blog") {
    return blogDataToPageData(data);
  }
  return data;
}

export function migrateNode(node: CanvasNode): {
  node: CanvasNode;
  changed: boolean;
} {
  if (node.data.kind !== "blog") return { node, changed: false };
  return {
    node: {
      ...node,
      data: blogDataToPageData(node.data),
    },
    changed: true,
  };
}
