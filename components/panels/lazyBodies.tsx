"use client";

// Code-split the heavy panel bodies (each pulls in TipTap + lowlight +
// KaTeX, plus pdf.js for PdfPanelBody, plus the article reader for
// LinkPanelBody). Lazy-loading them keeps the initial /app bundle small;
// the chunk is fetched the first time the user opens a panel of that
// kind, then cached for subsequent opens.
import dynamic from "next/dynamic";

function PanelLoading() {
  return (
    <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--pg-muted)]">
      Loading…
    </div>
  );
}

export const LazyPdfPanelBody = dynamic(
  () => import("./PdfPanelBody").then((m) => m.PdfPanelBody),
  { ssr: false, loading: PanelLoading }
);

export const LazyPagePanelBody = dynamic(
  () => import("./PagePanelBody").then((m) => m.PagePanelBody),
  { ssr: false, loading: PanelLoading }
);

export const LazyLinkPanelBody = dynamic(
  () => import("./LinkPanelBody").then((m) => m.LinkPanelBody),
  { ssr: false, loading: PanelLoading }
);

export const LazyAiAnswerPanelBody = dynamic(
  () => import("./AiAnswerPanelBody").then((m) => m.AiAnswerPanelBody),
  { ssr: false, loading: PanelLoading }
);

export const LazyFlashcardsPanelBody = dynamic(
  () => import("./FlashcardsPanelBody").then((m) => m.FlashcardsPanelBody),
  { ssr: false, loading: PanelLoading }
);
