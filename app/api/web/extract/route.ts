import { NextResponse } from "next/server";
import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import sanitizeHtml from "sanitize-html";
import katex from "katex";
import { getCurrentUser } from "@/lib/server/auth";
import { getPersistenceMode } from "@/lib/persistence";

export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB ceiling for reader-view extraction
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 personalGit-Reader/1.0";

type ExtractResponse = {
  finalUrl: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  contentHtml: string;
  fetchedAt: number;
};

// IPv4 ranges that must never be reachable from the extract route. Keeps a
// malicious URL from pointing the server at metadata services, RFC1918
// networks, or our own loopback.
function isPrivateIpv4(addr: string): boolean {
  const parts = addr.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. AWS metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0/24
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(addr: string): boolean {
  const norm = addr.toLowerCase();
  if (norm === "::1" || norm === "::") return true;
  if (norm.startsWith("fc") || norm.startsWith("fd")) return true; // unique-local
  if (norm.startsWith("fe80")) return true; // link-local
  if (norm.startsWith("ff")) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4 address.
  const v4 = norm.match(/::ffff:([\d.]+)$/);
  if (v4 && isPrivateIpv4(v4[1])) return true;
  return false;
}

function isPrivateHost(host: string): boolean {
  const family = isIP(host);
  if (family === 4) return isPrivateIpv4(host);
  if (family === 6) return isPrivateIpv6(host);
  return false;
}

async function assertPublicHostname(hostname: string): Promise<void> {
  // Refuse obviously local names even before DNS resolution; some resolvers
  // happily map them to 127.0.0.1.
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    throw new Error("hostname is not publicly routable");
  }
  if (isPrivateHost(lower)) {
    throw new Error("hostname is not publicly routable");
  }

  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0) {
    throw new Error("hostname did not resolve");
  }
  for (const r of records) {
    if (isPrivateHost(r.address)) {
      throw new Error("hostname resolves to a private address");
    }
  }
}

function validateUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("only http(s) URLs are supported");
  }
  if (!parsed.hostname) {
    throw new Error("URL has no hostname");
  }
  return parsed;
}

async function fetchHtml(target: URL): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      throw new Error(`upstream returned ${res.status}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error(`unsupported content-type: ${contentType || "unknown"}`);
    }

    // Manual size cap — `res.text()` would buffer the entire body before we
    // could check the length.
    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("response body unreadable");
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        try {
          await reader.cancel();
        } catch {}
        throw new Error("response too large");
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const charset =
      /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase() ?? "utf-8";
    const decoder = new TextDecoder(charset.replace(/^"|"$/g, ""), {
      fatal: false,
    });
    return { html: decoder.decode(buf), finalUrl: res.url || target.toString() };
  } finally {
    clearTimeout(timer);
  }
}

// -- math rendering ----------------------------------------------------
//
// Many articles (especially blog posts about ML / math) embed LaTeX using
// the standard delimiters $$..$$, \[..\], \(..\), and sometimes $..$. We
// pre-render them with KaTeX server-side so the reader view sees real
// math without any client-side work. The site already imports
// `katex/dist/katex.min.css` globally, so the rendered HTML lands styled.
type MathSegment =
  | { type: "text"; value: string }
  | { type: "inline"; value: string }
  | { type: "block"; value: string };

// Inner text of a $..$ inline match qualifies as math only if it contains
// at least one backslash-command, a sub/superscript, or braces — keeps the
// route from clobbering prose like "it costs $5 vs $20".
function looksLikeMath(inner: string): boolean {
  return /\\[a-zA-Z]+|[\^_]|[{}]/.test(inner);
}

function splitTextWithMath(text: string): MathSegment[] {
  // Block delimiters first (greedy match across newlines), then inline.
  // The leading "no backslash" lookbehind on $$ and $ avoids matching
  // escaped \$\$ / \$ inside code-like prose.
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
    // Surface the raw LaTeX so the reader still sees something rather than
    // a silent drop.
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<span class="pg-math-error">${escaped}</span>`;
  }
}

const MATH_SKIP_TAGS = new Set([
  "code",
  "pre",
  "script",
  "style",
  "noscript",
  "kbd",
  "samp",
]);

function renderMathInHtml(html: string): string {
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
          if (MATH_SKIP_TAGS.has(tag)) return NodeFilter.FILTER_REJECT;
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
    // Cheap pre-filter: avoid running the regex on text nodes that can't
    // possibly contain a math delimiter.
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
      const span = doc.createElement("span");
      span.setAttribute(
        "class",
        seg.type === "block" ? "pg-math-block-rendered" : "pg-math-inline-rendered"
      );
      span.innerHTML = renderKatex(seg.value, seg.type === "block");
      parent.insertBefore(span, node);
    }
    parent.removeChild(node);
  }

  return body.innerHTML;
}

function sanitize(html: string, baseUrl: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "hr",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li",
      "blockquote", "pre", "code",
      "em", "strong", "i", "b", "u", "s", "sub", "sup", "mark", "small",
      "a", "img", "figure", "figcaption",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
      "span", "div",
    ],
    allowedAttributes: {
      a: ["href", "title", "name"],
      img: ["src", "alt", "title", "width", "height", "srcset"],
      "*": ["id"],
    },
    // Drop anything not on the allow-list of schemes outright.
    allowedSchemes: ["http", "https", "data", "mailto"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    // Resolve relative URLs against the article's final URL so images and
    // any (visually rendered) links point at the right origin.
    transformTags: {
      a: (tagName, attribs) => {
        const next: Record<string, string> = { ...attribs };
        if (next.href) {
          try {
            next.href = new URL(next.href, baseUrl).toString();
          } catch {
            delete next.href;
          }
        }
        next.rel = "noopener noreferrer nofollow";
        next.target = "_blank";
        return { tagName, attribs: next };
      },
      img: (tagName, attribs) => {
        const next: Record<string, string> = { ...attribs };
        if (next.src) {
          try {
            next.src = new URL(next.src, baseUrl).toString();
          } catch {
            delete next.src;
          }
        }
        delete next.srcset;
        next.loading = "lazy";
        next.referrerpolicy = "no-referrer";
        return { tagName, attribs: next };
      },
    },
    // sanitize-html strips on* handlers by default.
    disallowedTagsMode: "discard",
  });
}

export async function POST(request: Request) {
  if (getPersistenceMode() === "supabase") {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const raw = (body as { url?: unknown }).url;
  if (typeof raw !== "string" || !raw.trim()) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = validateUrl(raw.trim());
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }

  try {
    await assertPublicHostname(target.hostname);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }

  let html: string;
  let finalUrl: string;
  try {
    ({ html, finalUrl } = await fetchHtml(target));
  } catch (err) {
    const message =
      (err as Error).name === "AbortError"
        ? "upstream timed out"
        : (err as Error).message || "fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // If redirects landed us on a private host (e.g. `bit.ly` → intranet),
  // refuse the result. Best-effort: parse the final URL and re-check.
  try {
    const finalParsed = new URL(finalUrl);
    await assertPublicHostname(finalParsed.hostname);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }

  // Silence jsdom CSS / network warnings — Readability only needs the DOM.
  const virtualConsole = new VirtualConsole();
  let dom: JSDOM;
  try {
    dom = new JSDOM(html, { url: finalUrl, virtualConsole });
  } catch (err) {
    return NextResponse.json(
      { error: `failed to parse: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article || !article.content) {
    return NextResponse.json(
      { error: "could not extract a readable article from this page" },
      { status: 422 }
    );
  }

  // Sanitize first (drops scripts/iframes/event handlers), THEN render math.
  // KaTeX output uses dozens of class names and inline styles that
  // sanitize-html would strip; running it after sanitize lets us trust the
  // KaTeX HTML directly since the upstream LaTeX has been escaped by KaTeX
  // itself.
  const sanitized = sanitize(article.content, finalUrl);
  const contentHtml = renderMathInHtml(sanitized);

  const payload: ExtractResponse = {
    finalUrl,
    title:
      (article.title && article.title.trim()) ||
      dom.window.document.title ||
      target.hostname,
    byline: article.byline?.trim() || null,
    siteName: article.siteName?.trim() || null,
    excerpt: article.excerpt?.trim() || null,
    contentHtml,
    fetchedAt: Date.now(),
  };

  return NextResponse.json(payload);
}
