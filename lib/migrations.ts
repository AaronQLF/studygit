import { marked } from "marked";
import type {
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

/** Plain-text document bodies → minimal TipTap-friendly HTML. */
export function plainTextToPageHtml(text: string): string {
  if (!text.trim()) return "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`;
}

export function blogDataToPageData(blog: BlogNodeData): PageNodeData {
  return {
    kind: "page",
    title: blog.title,
    content: markdownToHtml(blog.markdown),
  };
}

/** Persisted shape before document nodes were removed (highlights/comments dropped). */
type LegacyDocumentNodeData = {
  kind: "document";
  title: string;
  content: string;
};

function documentLegacyToPageData(d: LegacyDocumentNodeData): PageNodeData {
  return {
    kind: "page",
    title: d.title?.trim() ? d.title : "Migrated page",
    content: plainTextToPageHtml(d.content ?? ""),
  };
}

export function migrateNode(node: CanvasNode): {
  node: CanvasNode;
  changed: boolean;
} {
  const kind = (node.data as { kind: string }).kind;

  if (kind === "blog") {
    return {
      node: {
        ...node,
        data: blogDataToPageData(node.data as BlogNodeData),
      },
      changed: true,
    };
  }

  if (kind === "document") {
    const nextData = documentLegacyToPageData(
      node.data as unknown as LegacyDocumentNodeData
    );
    return {
      node: {
        ...node,
        data: nextData,
        width:
          node.width === 360 || node.width === undefined ? 440 : node.width,
      },
      changed: true,
    };
  }

  return { node, changed: false };
}
