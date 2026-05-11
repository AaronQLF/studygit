// Lightweight HTML scanners for the citation feature. Run only on the client
// (uses DOMParser); on the server they no-op so SSR / hydration stays clean.

// Parsing each page's HTML on every store mutation is expensive — DOMParser
// + querySelectorAll over 50 KB of TipTap output runs every time the
// canvas re-derives its citation edges. Cache by string identity (TipTap
// returns the same serialized HTML when content is unchanged) so the
// canvas effect can call this freely.
const CITATION_CACHE = new Map<string, string[]>();
const CITATION_CACHE_MAX = 256;

/**
 * Returns the set of source-node ids referenced by `<citation>` pills
 * inside the given TipTap HTML. The pill itself is source-agnostic —
 * could point at a PDF highlight or a web-article highlight — so this
 * scanner just returns node ids without caring what kind they are.
 */
export function extractCitedNodeIds(html: string): string[] {
  if (!html || typeof DOMParser === "undefined") return [];
  const cached = CITATION_CACHE.get(html);
  if (cached) return cached;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return [];
  }
  const nodes = doc.querySelectorAll("span[data-type='citation'][data-node-id]");
  let result: string[];
  if (nodes.length === 0) {
    result = [];
  } else {
    const seen = new Set<string>();
    for (const el of Array.from(nodes)) {
      const id = el.getAttribute("data-node-id");
      if (id) seen.add(id);
    }
    result = Array.from(seen);
  }

  if (CITATION_CACHE.size >= CITATION_CACHE_MAX) {
    const oldest = CITATION_CACHE.keys().next().value;
    if (oldest !== undefined) CITATION_CACHE.delete(oldest);
  }
  CITATION_CACHE.set(html, result);
  return result;
}
