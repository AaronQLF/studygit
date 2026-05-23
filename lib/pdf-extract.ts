"use client";

// Pull plain-text out of a PDF for use as an AI source. Runs entirely in
// the browser via the same pdfjs-dist module that powers the PDF viewer.
//
// Results are memoized in-memory by `src` URL for the lifetime of the tab
// so re-attaching the same PDF to another conversation is instant. We
// deliberately don't persist the extracted text to disk — for large PDFs
// it can easily reach hundreds of kilobytes and would bloat state.json
// (or the Supabase row) more than it's worth.

import { loadPdfJs } from "./pdfjs-loader";

// Hard ceiling on extracted text per PDF. Anything past this gets
// truncated with a sentinel — keeps a runaway 500-page reference manual
// from drowning the model's context window. The AI panel clamps source
// excerpts again at 24K chars when packing them into the request, so
// even this larger ceiling can't cause an effective overflow; it just
// means we'd rather have more of the PDF available for the search/select
// step inside the panel than less.
const MAX_EXTRACTED_CHARS = 200_000;

type CacheEntry =
  | { status: "pending"; promise: Promise<string> }
  | { status: "resolved"; text: string }
  | { status: "rejected"; error: Error };

const cache = new Map<string, CacheEntry>();

export function getCachedPdfText(src: string): string | null {
  const entry = cache.get(src);
  if (!entry) return null;
  if (entry.status === "resolved") return entry.text;
  return null;
}

export async function extractPdfText(src: string): Promise<string> {
  if (!src) throw new Error("Missing PDF src");

  const existing = cache.get(src);
  if (existing) {
    if (existing.status === "resolved") return existing.text;
    if (existing.status === "pending") return existing.promise;
    if (existing.status === "rejected") {
      // Allow a retry by clearing the failed entry before re-trying.
      cache.delete(src);
    }
  }

  const promise = (async () => {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ url: src }).promise;
    const pages: string[] = [];
    let total = 0;
    let truncated = false;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // pdf.js TextContent.items can be either TextItem (with `str`) or
      // TextMarkedContent (no `str`); narrow to the former.
      const pageText = content.items
        .map((item) =>
          "str" in item && typeof item.str === "string" ? item.str : ""
        )
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      // Best-effort page boundary marker so the model can refer to "page 4"
      // when it sees the citation marker we attach alongside.
      pages.push(`[page ${i}] ${pageText}`);
      total += pageText.length + 12;
      if (total >= MAX_EXTRACTED_CHARS) {
        truncated = true;
        break;
      }
      try {
        page.cleanup();
      } catch {
        // pdf.js can throw if the page was already cleaned up by an
        // earlier viewer instance — harmless.
      }
    }
    try {
      doc.destroy();
    } catch {}
    let text = pages.join("\n\n");
    if (truncated) {
      text += `\n\n…[truncated at ~${MAX_EXTRACTED_CHARS.toLocaleString()} characters; ${doc.numPages - pages.length} pages were not included]`;
    }
    return text;
  })();

  cache.set(src, { status: "pending", promise });

  try {
    const text = await promise;
    cache.set(src, { status: "resolved", text });
    return text;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    cache.set(src, { status: "rejected", error });
    throw error;
  }
}
