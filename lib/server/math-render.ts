// Server-side LaTeX -> HTML rendering using KaTeX. Walks a snippet of
// already-sanitized HTML, finds math delimiters in text nodes, and
// replaces them with KaTeX-rendered spans. The page-wide stylesheet
// (`katex/dist/katex.min.css`, imported globally in AppShell) styles
// the result on the client without any extra JS work.
//
// Two callers today:
//   - app/api/web/extract/route.ts (reader-view article extraction)
//   - lib/ai-citations.ts (AI chat response rendering)
//
// IMPORTANT ordering note: callers should sanitize the HTML *before*
// running this function. KaTeX emits dozens of class names and inline
// styles that sanitize-html would otherwise strip; running it after
// sanitization lets us trust the KaTeX output (it's our code, and the
// LaTeX input itself can't escape KaTeX's parser into raw HTML).

import katex from "katex";
import { JSDOM } from "jsdom";

type MathSegment =
  | { type: "text"; value: string }
  | { type: "inline"; value: string }
  | { type: "block"; value: string };

// A bare $..$ qualifies as math only if the inner content shows a real
// LaTeX signal — backslash command, sub/superscript, or braces. Without
// this, prose like "it costs $5 vs $20" would get parsed as math and
// surface as a render error.
function looksLikeMath(inner: string): boolean {
  return /\\[a-zA-Z]+|[\^_]|[{}]/.test(inner);
}

function splitTextWithMath(text: string): MathSegment[] {
  // Block delimiters first (greedy match across newlines), then inline.
  // Leading "no backslash" lookbehinds on $$ and $ skip escaped \$\$ /
  // \$ that occasionally appear in prose.
  const re =
    /\\\[([\s\S]+?)\\\]|(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$|\\\(([\s\S]+?)\\\)|(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g;
  const out: MathSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ type: "text", value: text.slice(last, m.index) });
    }
    if (m[1] != null) out.push({ type: "block", value: m[1].trim() });
    else if (m[2] != null) out.push({ type: "block", value: m[2].trim() });
    else if (m[3] != null) out.push({ type: "inline", value: m[3].trim() });
    else if (m[4] != null) {
      const inner = m[4];
      if (looksLikeMath(inner)) {
        out.push({ type: "inline", value: inner.trim() });
      } else {
        out.push({ type: "text", value: m[0] });
      }
    }
    last = re.lastIndex;
  }
  if (last < text.length) {
    out.push({ type: "text", value: text.slice(last) });
  }
  return out;
}

function renderKatex(value: string, displayMode: boolean): string {
  try {
    return katex.renderToString(value, {
      throwOnError: false,
      displayMode,
      output: "html",
    });
  } catch {
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<span class="pg-math-error">${escaped}</span>`;
  }
}

const DEFAULT_SKIP_TAGS = new Set([
  "code",
  "pre",
  "script",
  "style",
  "noscript",
  "kbd",
  "samp",
  // Don't try to re-render math inside something that already is math
  // (defensive — relevant if the caller chains multiple passes).
  "math",
]);

export type RenderMathInHtmlOptions = {
  // Optional class to wrap each block-math span with. When omitted, the
  // KaTeX output is inserted as-is, which already includes
  // `<span class="katex-display">`. The reader-view route opts into
  // a wrapper so its own CSS can apply page-specific tweaks.
  blockWrapperClass?: string;
  inlineWrapperClass?: string;
};

export function renderMathInHtml(
  html: string,
  options: RenderMathInHtmlOptions = {}
): string {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  const doc = dom.window.document;
  const body = doc.body;
  const NodeFilter = dom.window.NodeFilter;

  const candidates: Text[] = [];
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent: Node | null = node.parentNode;
      while (parent) {
        if (parent.nodeType === 1) {
          const tag = (parent as Element).tagName.toLowerCase();
          if (DEFAULT_SKIP_TAGS.has(tag)) return NodeFilter.FILTER_REJECT;
        }
        parent = parent.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    candidates.push(n as Text);
  }

  for (const node of candidates) {
    const text = node.nodeValue ?? "";
    if (!text) continue;
    // Cheap pre-filter: avoid running the regex on text nodes that
    // can't possibly contain a math delimiter.
    if (
      !text.includes("$") &&
      !text.includes("\\[") &&
      !text.includes("\\(")
    ) {
      continue;
    }
    const segments = splitTextWithMath(text);
    const hasMath = segments.some((s) => s.type !== "text");
    if (!hasMath) continue;

    const parent = node.parentNode;
    if (!parent) continue;
    for (const seg of segments) {
      if (seg.type === "text") {
        if (seg.value) parent.insertBefore(doc.createTextNode(seg.value), node);
        continue;
      }
      const rendered = renderKatex(seg.value, seg.type === "block");
      const wrapperClass =
        seg.type === "block"
          ? options.blockWrapperClass
          : options.inlineWrapperClass;
      if (wrapperClass) {
        const span = doc.createElement("span");
        span.setAttribute("class", wrapperClass);
        span.innerHTML = rendered;
        parent.insertBefore(span, node);
      } else {
        // Insert KaTeX's HTML directly. It already wraps display math
        // in <span class="katex-display"> and inline in
        // <span class="katex"> with all required styling.
        const fragment = doc.createElement("template");
        fragment.innerHTML = rendered;
        const inserted = (fragment as HTMLTemplateElement).content.cloneNode(
          true
        );
        parent.insertBefore(inserted, node);
      }
    }
    parent.removeChild(node);
  }

  return body.innerHTML;
}
