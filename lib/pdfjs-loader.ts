"use client";

// Shared pdfjs-dist loader. Imported by:
//   - components/PdfViewer.tsx (highlight/render the PDF in a panel)
//   - lib/pdf-extract.ts (pull plain-text from a PDF for AI grounding)
//
// Keeping this in one place means the readable-stream polyfill is applied
// exactly once, the worker URL is registered exactly once, and the
// dynamic import resolves to a single chunk shared by both consumers.

type PdfJsModule = typeof import("pdfjs-dist");

// Safari < 17.4 (and a few older Chromium/Edge builds) ship `ReadableStream`
// without `Symbol.asyncIterator`. pdf.js >= 5 uses `for await (… of stream)`
// inside `page.getTextContent()`, so without this polyfill the text layer
// never renders and PDF text selection/extraction silently breaks.
export function ensureReadableStreamAsyncIterator() {
  if (
    typeof ReadableStream === "undefined" ||
    typeof Symbol === "undefined" ||
    !Symbol.asyncIterator
  ) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = ReadableStream.prototype as any;
  if (proto[Symbol.asyncIterator]) return;

  async function* values(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this: any,
    options?: { preventCancel?: boolean }
  ) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } catch (err) {
      if (!options?.preventCancel) {
        try {
          await reader.cancel(err);
        } catch {}
      }
      throw err;
    } finally {
      reader.releaseLock();
    }
  }

  proto.values ??= values;
  proto[Symbol.asyncIterator] = proto.values;
}
ensureReadableStreamAsyncIterator();

let pdfjsPromise: Promise<PdfJsModule> | null = null;
export function loadPdfJs(): Promise<PdfJsModule> {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    ensureReadableStreamAsyncIterator();
    const lib = await import("pdfjs-dist");
    if (!lib.GlobalWorkerOptions.workerSrc) {
      lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${lib.version}/build/pdf.worker.min.mjs`;
    }
    return lib;
  })();
  return pdfjsPromise;
}
