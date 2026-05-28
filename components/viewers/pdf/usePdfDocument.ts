"use client";

// Two-step pdf.js bootstrap for the PDF viewer:
//   1. Dynamically import the pdfjs-dist module (the shared loader
//      handles worker + polyfill setup).
//   2. When `src` changes, load that document and pre-resolve every
//      page's base viewport — we use those dimensions to lay out the
//      pages before any render runs.
//
// Cancellation is handled at every async boundary so a fast src swap
// (or unmount) won't leave a partial document on screen or call
// setState after the component is gone.

import { useEffect, useState } from "react";
import { loadPdfJs } from "@/lib/pdfjs-loader";

export type PdfJsModule = typeof import("pdfjs-dist");
export type PdfDoc = Awaited<
  ReturnType<PdfJsModule["getDocument"]>["promise"]
>;
export type PdfPage = Awaited<ReturnType<PdfDoc["getPage"]>>;

export type LoadedPdfPage = {
  page: PdfPage;
  baseWidth: number;
  baseHeight: number;
};

export type UsePdfDocumentResult = {
  pdfjs: PdfJsModule | null;
  doc: PdfDoc | null;
  pages: LoadedPdfPage[];
  loading: boolean;
  error: string | null;
};

export function usePdfDocument(
  src: string,
  onLoaded?: (info: { pageCount: number }) => void
): UsePdfDocumentResult {
  const [pdfjs, setPdfjs] = useState<PdfJsModule | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [pages, setPages] = useState<LoadedPdfPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPdfJs()
      .then((lib) => {
        if (!cancelled) setPdfjs(lib);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pdfjs || !src) return;
    let cancelled = false;
    let task: ReturnType<PdfJsModule["getDocument"]> | null = null;
    // Reset state on the next microtask so we don't trip the React 19
    // "no setState in effect body" rule. The async loader below already
    // hands control back to the scheduler so this never races a real
    // setDoc/setPages emission.
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setPages([]);
      setDoc(null);
    });
    (async () => {
      try {
        task = pdfjs.getDocument(src);
        const loaded = await task.promise;
        if (cancelled) {
          await loaded.destroy();
          return;
        }
        setDoc(loaded);
        const list: LoadedPdfPage[] = [];
        for (let i = 1; i <= loaded.numPages; i++) {
          const page = await loaded.getPage(i);
          if (cancelled) return;
          const vp = page.getViewport({ scale: 1 });
          list.push({ page, baseWidth: vp.width, baseHeight: vp.height });
        }
        if (cancelled) return;
        setPages(list);
        onLoaded?.({ pageCount: loaded.numPages });
      } catch (err) {
        if (!cancelled) setError((err as Error).message || "failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      task?.destroy?.();
    };
    // `onLoaded` is intentionally omitted — consumers usually pass a
    // fresh inline callback every render and we don't want to reload
    // the document each time. The first non-null call is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfjs, src]);

  useEffect(() => {
    return () => {
      if (doc) {
        doc.destroy().catch(() => {});
      }
    };
  }, [doc]);

  return { pdfjs, doc, pages, loading, error };
}
