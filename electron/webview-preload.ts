// Preload that runs inside every <webview> the in-app Browser opens.
//
// It is intentionally tiny and dependency-free: it only talks to the host
// renderer through `ipcRenderer.sendToHost` (and `ipcRenderer.on` for the
// reverse direction). The host owns all UI; this script just turns the
// embedded page into something the host can drive:
//
//   host -> webview
//     pg-apply-highlight   { id, color }   wrap the current selection
//     pg-clear-highlights                  remove every <mark> we've added
//     pg-page-info                         echo back current url + title
//
//   webview -> host
//     pg-selection         { text, prefix, suffix, rect } | null
//     pg-page-info         { url, title }
//     pg-highlight-applied { id, color, text, prefix, suffix }
//
// We never touch the page's own JS context — selection state is read via
// the standard `window.getSelection()` API and highlights are wrapped
// using ordinary <mark> elements, so anything the page does to its own
// DOM keeps working.

import { ipcRenderer } from "electron";

const ANCHOR_CONTEXT = 32;

// ---------------------------------------------------------------------------
// Per-site stylesheets
// ---------------------------------------------------------------------------
// Some sites render with a lot of chrome (sidebars, banners, edit toolbars)
// that make them painful to read inside the small in-app browser. We inject
// a tiny stylesheet for known offenders to bring them closer to a reader-mode
// experience while keeping the live DOM intact (so highlights still anchor
// against the page's own text). Anything we don't have a rule for is left
// untouched.
const WIKIPEDIA_READER_CSS = `
  /* Strip the desktop Vector skin's interactive chrome. We keep the article
     body and section nav (table of contents) but hide the global header,
     left rail, footer, tabs, and edit links that the user can't act on
     from the in-app browser anyway. */
  #mw-head, #mw-page-base, #mw-head-base,
  #mw-navigation, #mw-panel, #mw-sidebar-button,
  .mw-header, .vector-header-container,
  .vector-page-toolbar, .vector-sticky-header,
  .vector-menu-tabs, .vector-page-titlebar-toc,
  .mw-jump-link, .mw-editsection,
  #siteNotice, #localNotice, .mw-notification-area,
  #mw-indicator-good-star, .printfooter,
  #footer, #mw-navigation-heading,
  .vector-column-end, .vector-column-start,
  .vector-page-tools-container,
  .vector-toc-collapsed-button,
  .navbox, .sister-wikipedia, .sistersitebox,
  .reference-accessdate { display: none !important; }

  /* Pull the article up to fill the freed space and centre the column
     at a comfortable reading width. */
  html, body { background: #fff !important; }
  #content, .mw-body, .mw-page-container {
    margin: 0 auto !important;
    padding: 24px 28px 64px !important;
    max-width: 760px !important;
    border: none !important;
    box-shadow: none !important;
    background: #fff !important;
  }
  .mw-body-content {
    font-family: Georgia, "Iowan Old Style", "Charter", serif !important;
    font-size: 16.5px !important;
    line-height: 1.6 !important;
    color: #1c1c1f !important;
  }
  .mw-body-content p { margin: 0.85em 0 !important; }
  .mw-body-content h1,
  .mw-body-content h2,
  .mw-body-content h3 {
    font-family: Georgia, "Iowan Old Style", serif !important;
    border: none !important;
    letter-spacing: -0.01em !important;
    margin-top: 1.4em !important;
    margin-bottom: 0.4em !important;
  }
  .mw-body-content h1 { font-size: 1.85em !important; }
  .mw-body-content h2 { font-size: 1.35em !important; }
  .mw-body-content h3 { font-size: 1.1em !important; }
  .mw-body-content a {
    color: #1755b8 !important;
    text-decoration: none !important;
  }
  .mw-body-content a:hover { text-decoration: underline !important; }
  /* Calm down infoboxes and floats so they don't eat the whole column. */
  .infobox, .infobox_v2 {
    float: right !important;
    width: 280px !important;
    max-width: 40% !important;
    margin: 0.2em 0 1em 1.4em !important;
    font-size: 12.5px !important;
    border: 1px solid #d7d7d9 !important;
    background: #fafafa !important;
  }
  .thumb { margin: 1em 0 !important; }
  .thumbinner {
    background: transparent !important;
    border: none !important;
    padding: 0 !important;
  }
  .thumbcaption {
    font-style: italic !important;
    color: #555 !important;
    font-size: 13px !important;
    text-align: left !important;
  }
  /* Tighter table styling for refs/references lists. */
  .reflist, .references {
    font-size: 12.5px !important;
    line-height: 1.45 !important;
  }
`;

function injectStylesheet(css: string, id: string): void {
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  // Append at end of <head> so it overrides the page's own rules without
  // having to inflate selector specificity beyond `!important`.
  (document.head || document.documentElement).appendChild(style);
}

function maybeInjectReaderStyles(): void {
  try {
    const host = location.hostname;
    if (/(?:^|\.)wikipedia\.org$/i.test(host)) {
      injectStylesheet(WIKIPEDIA_READER_CSS, "pg-wikipedia-reader-css");
    }
  } catch {
    // location is unavailable on the rare opaque-origin pages; nothing to do.
  }
}

type SelectionPayload = {
  text: string;
  prefix: string;
  suffix: string;
  // Bounding rect of the live selection in webview-local coordinates so
  // the host can position its color picker against the same surface.
  rect: { top: number; left: number; width: number; height: number };
} | null;

type TextIndexEntry = {
  node: Text;
  start: number;
  end: number;
};

function collectTextNodes(root: Node): TextIndexEntry[] {
  const out: TextIndexEntry[] = [];
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const len = t.nodeValue?.length ?? 0;
    if (len === 0) continue;
    out.push({ node: t, start: offset, end: offset + len });
    offset += len;
  }
  return out;
}

function flatText(index: TextIndexEntry[]): string {
  let out = "";
  for (const e of index) out += e.node.nodeValue ?? "";
  return out;
}

function nodeOffsetInIndex(
  index: TextIndexEntry[],
  node: Node,
  offset: number
): number | null {
  for (const e of index) {
    if (e.node === node) {
      return e.start + Math.min(offset, e.end - e.start);
    }
  }
  if (node.nodeType === 1) {
    const el = node as Element;
    const children =
      offset >= el.childNodes.length
        ? Array.from(el.childNodes)
        : Array.from(el.childNodes).slice(0, offset);
    for (let i = children.length - 1; i >= 0; i--) {
      const c = children[i];
      const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
      let last: Text | null = null;
      for (let t = w.nextNode(); t; t = w.nextNode()) last = t as Text;
      if (last) {
        for (const e of index) {
          if (e.node === last) return e.end;
        }
      }
    }
  }
  return null;
}

let lastSelection: SelectionPayload = null;

function describeSelection(): SelectionPayload {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);

  const root = document.body;
  if (!root.contains(range.commonAncestorContainer)) return null;

  const index = collectTextNodes(root);
  if (index.length === 0) return null;
  const full = flatText(index);

  const startGlobal = nodeOffsetInIndex(
    index,
    range.startContainer,
    range.startOffset
  );
  const endGlobal = nodeOffsetInIndex(
    index,
    range.endContainer,
    range.endOffset
  );
  if (startGlobal == null || endGlobal == null || endGlobal <= startGlobal) {
    return null;
  }

  const rawText = full.slice(startGlobal, endGlobal);
  const text = rawText.replace(/^\s+|\s+$/g, "");
  if (!text) return null;

  const leading = rawText.length - rawText.trimStart().length;
  const trailing = rawText.length - rawText.trimEnd().length;
  const realStart = startGlobal + leading;
  const realEnd = endGlobal - trailing;

  const prefix = full.slice(Math.max(0, realStart - ANCHOR_CONTEXT), realStart);
  const suffix = full.slice(realEnd, realEnd + ANCHOR_CONTEXT);

  const rect = range.getBoundingClientRect();
  return {
    text,
    prefix,
    suffix,
    rect: {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    },
  };
}

function pushSelection(): void {
  const payload = describeSelection();
  lastSelection = payload;
  ipcRenderer.sendToHost("pg-selection", payload);
}

document.addEventListener("mouseup", () => {
  // Wait one frame so the selection settles after the mouseup ends.
  requestAnimationFrame(pushSelection);
});

document.addEventListener("keyup", (event) => {
  if (event.shiftKey || event.key.startsWith("Arrow")) {
    requestAnimationFrame(pushSelection);
  }
});

document.addEventListener("selectionchange", () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    if (lastSelection) {
      lastSelection = null;
      ipcRenderer.sendToHost("pg-selection", null);
    }
  }
});

// -- highlight application --------------------------------------------

function rangeFromIndex(
  index: TextIndexEntry[],
  start: number,
  end: number
): Range | null {
  if (start >= end) return null;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  for (const e of index) {
    if (!startNode && start >= e.start && start < e.end) {
      startNode = e.node;
      startOffset = start - e.start;
    }
    if (end > e.start && end <= e.end) {
      endNode = e.node;
      endOffset = end - e.start;
    }
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function findAnchor(
  full: string,
  text: string,
  prefix: string,
  suffix: string
): { start: number; end: number } | null {
  if (!text) return null;
  if (prefix || suffix) {
    const composite = `${prefix}${text}${suffix}`;
    const idx = full.indexOf(composite);
    if (idx !== -1) {
      return {
        start: idx + prefix.length,
        end: idx + prefix.length + text.length,
      };
    }
  }
  const first = full.indexOf(text);
  if (first === -1) return null;
  const second = full.indexOf(text, first + 1);
  if (second !== -1) return null;
  return { start: first, end: first + text.length };
}

function wrapRange(
  root: Node,
  range: Range,
  id: string,
  color: string
): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const t = node as Text;
      const r = document.createRange();
      r.selectNodeContents(t);
      const intersects =
        range.compareBoundaryPoints(Range.END_TO_START, r) < 0 &&
        range.compareBoundaryPoints(Range.START_TO_END, r) > 0;
      return intersects
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const pieces: Array<{ node: Text; start: number; end: number }> = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const len = t.nodeValue?.length ?? 0;
    if (len === 0) continue;
    let pieceStart = 0;
    let pieceEnd = len;
    if (t === range.startContainer) pieceStart = range.startOffset;
    if (t === range.endContainer) pieceEnd = range.endOffset;
    if (pieceEnd > pieceStart) {
      pieces.push({ node: t, start: pieceStart, end: pieceEnd });
    }
  }

  for (const piece of pieces) {
    const { node, start, end } = piece;
    const value = node.nodeValue ?? "";
    const before = value.slice(0, start);
    const middle = value.slice(start, end);
    const after = value.slice(end);
    const parent = node.parentNode;
    if (!parent) continue;
    const mark = document.createElement("mark");
    mark.dataset.pgHighlightId = id;
    mark.style.backgroundColor = color;
    mark.style.color = "inherit";
    mark.style.padding = "0";
    mark.style.borderRadius = "2px";
    mark.appendChild(document.createTextNode(middle));
    const next = node.nextSibling;
    parent.removeChild(node);
    if (before) {
      const t = document.createTextNode(before);
      if (next) parent.insertBefore(t, next);
      else parent.appendChild(t);
    }
    if (next) parent.insertBefore(mark, next);
    else parent.appendChild(mark);
    if (after) {
      const t = document.createTextNode(after);
      if (next) parent.insertBefore(t, next);
      else parent.appendChild(t);
    }
  }
}

function applyHighlight(id: string, color: string): boolean {
  const snapshot = lastSelection;
  if (!snapshot) return false;
  const root = document.body;
  const index = collectTextNodes(root);
  const full = flatText(index);
  const anchor = findAnchor(full, snapshot.text, snapshot.prefix, snapshot.suffix);
  if (!anchor) return false;
  const range = rangeFromIndex(index, anchor.start, anchor.end);
  if (!range) return false;
  wrapRange(root, range, id, color);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  lastSelection = null;
  ipcRenderer.sendToHost("pg-highlight-applied", {
    id,
    color,
    text: snapshot.text,
    prefix: snapshot.prefix,
    suffix: snapshot.suffix,
  });
  ipcRenderer.sendToHost("pg-selection", null);
  return true;
}

ipcRenderer.on("pg-apply-highlight", (_evt, payload: { id: string; color: string }) => {
  const ok = applyHighlight(payload.id, payload.color);
  if (!ok) {
    ipcRenderer.sendToHost("pg-highlight-failed", { id: payload.id });
  }
});

ipcRenderer.on("pg-clear-highlights", () => {
  const marks = document.querySelectorAll<HTMLElement>("mark[data-pg-highlight-id]");
  marks.forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
  });
  document.body.normalize();
});

ipcRenderer.on("pg-page-info", () => {
  ipcRenderer.sendToHost("pg-page-info", {
    url: location.href,
    title: document.title,
  });
});

// Notify the host once the page is interactive so it can request an
// initial page-info exchange and reset its selection toolbar.
window.addEventListener("DOMContentLoaded", () => {
  // Inject reader styles as early as we can — DOMContentLoaded fires
  // before subresources finish, so the user sees the cleaned-up layout
  // immediately instead of a flash of the page's own chrome.
  maybeInjectReaderStyles();
  ipcRenderer.sendToHost("pg-page-info", {
    url: location.href,
    title: document.title,
  });
});

// Some single-page-app pages on Wikipedia (e.g. when the user clicks a
// section link that triggers history.pushState) replace large chunks of
// the DOM after our stylesheet would normally have run. Re-assert on
// every soft-nav so the rules stay applied.
window.addEventListener("popstate", maybeInjectReaderStyles);
window.addEventListener("pageshow", maybeInjectReaderStyles);

// And one belt-and-braces call at script-load time for the case where
// the preload runs after DOMContentLoaded has already fired (Chromium
// occasionally orders things this way for cached pages).
if (document.readyState !== "loading") {
  maybeInjectReaderStyles();
}
