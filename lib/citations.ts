// Lightweight HTML scanners for the citation feature. Run only on the client
// (uses DOMParser); on the server they no-op so SSR / hydration stays clean.

export function extractCitedPdfIds(html: string): string[] {
  if (!html || typeof DOMParser === "undefined") return [];
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return [];
  }
  const nodes = doc.querySelectorAll("span[data-type='citation'][data-node-id]");
  if (nodes.length === 0) return [];
  const seen = new Set<string>();
  for (const el of Array.from(nodes)) {
    const id = el.getAttribute("data-node-id");
    if (id) seen.add(id);
  }
  return Array.from(seen);
}
