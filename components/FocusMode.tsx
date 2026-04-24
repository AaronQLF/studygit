"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Highlighter,
  Image as ImageIcon,
  Link2,
  MessageSquare,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { nanoid } from "nanoid";
import { HIGHLIGHT_COLORS, NOTE_COLORS } from "@/lib/defaults";
import { useStore } from "@/lib/store";
import type {
  AiMessage,
  BlogNodeData,
  DocumentNodeData,
  Highlight,
  ImageNodeData,
  LinkNodeData,
  NoteNodeData,
  PdfNodeData,
} from "@/lib/types";
import { PdfViewer, type PdfSelectionEvent, type PdfViewerHandle } from "./PdfViewer";

type Segment = {
  text: string;
  start: number;
  end: number;
  highlightIds: string[];
  color: string | null;
};

function buildSegments(content: string, highlights: Highlight[]): Segment[] {
  const boundaries = new Set<number>([0, content.length]);
  for (const highlight of highlights) {
    boundaries.add(Math.max(0, Math.min(content.length, highlight.start)));
    boundaries.add(Math.max(0, Math.min(content.length, highlight.end)));
  }

  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start === end) continue;
    const overlaps = highlights.filter(
      (highlight) => highlight.start <= start && highlight.end >= end
    );
    segments.push({
      text: content.slice(start, end),
      start,
      end,
      highlightIds: overlaps.map((highlight) => highlight.id),
      color: overlaps.length ? overlaps[overlaps.length - 1].color : null,
    });
  }
  return segments;
}

function normalizeUrl(url: string) {
  const value = url.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export function FocusMode() {
  const focusedNodeId = useStore((s) => s.focusedNodeId);
  const clearFocus = useStore((s) => s.clearFocus);
  const nodes = useStore((s) => s.nodes);
  const folders = useStore((s) => s.folders);
  const isDirty = useStore((s) => s.isDirty);
  const justSaved = useStore((s) => s.justSaved);
  const updateNodeData = useStore((s) => s.updateNodeData);
  const addHighlight = useStore((s) => s.addHighlight);
  const deleteHighlight = useStore((s) => s.deleteHighlight);
  const addComment = useStore((s) => s.addComment);
  const deleteComment = useStore((s) => s.deleteComment);
  const addPdfHighlight = useStore((s) => s.addPdfHighlight);
  const deletePdfHighlight = useStore((s) => s.deletePdfHighlight);
  const addPdfComment = useStore((s) => s.addPdfComment);
  const deletePdfComment = useStore((s) => s.deletePdfComment);
  const appendPdfAiMessage = useStore((s) => s.appendPdfAiMessage);

  const node = useMemo(
    () => nodes.find((candidate) => candidate.id === focusedNodeId) ?? null,
    [focusedNodeId, nodes]
  );
  const nodeId = node?.id ?? null;
  const nodeKind = node?.data.kind ?? null;

  const breadcrumb = useMemo(() => {
    if (!node) return [];
    const folder = folders.find((f) => f.id === node.folderId);
    if (!folder) return [];
    const names = [folder.name];
    let parentId = folder.parentId;
    while (parentId) {
      const parent = folders.find((f) => f.id === parentId);
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parentId;
    }
    return names;
  }, [folders, node]);

  const [blogTitle, setBlogTitle] = useState("");
  const [blogMarkdown, setBlogMarkdown] = useState("");

  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkDescription, setLinkDescription] = useState("");
  const [linkEmbed, setLinkEmbed] = useState(true);

  const [imageUrl, setImageUrl] = useState("");
  const [imageCaption, setImageCaption] = useState("");

  const [noteText, setNoteText] = useState("");
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0]);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [mounted, setMounted] = useState(false);

  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docMode, setDocMode] = useState<"write" | "annotate">("write");
  const [docRailCollapsed, setDocRailCollapsed] = useState(false);
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
    rect: { x: number; y: number };
  } | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  const initializedNodeRef = useRef<string | null>(null);

  const [pdfActiveHighlightId, setPdfActiveHighlightId] = useState<string | null>(null);
  const [pdfAiInput, setPdfAiInput] = useState("");
  const [pdfAiSending, setPdfAiSending] = useState(false);
  const [pdfAiError, setPdfAiError] = useState<string | null>(null);
  const [pdfCommentDraft, setPdfCommentDraft] = useState("");
  const [pdfReplacing, setPdfReplacing] = useState(false);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);
  const pdfViewerRef = useRef<PdfViewerHandle>(null);

  useEffect(() => {
    if (!focusedNodeId) {
      initializedNodeRef.current = null;
      setMounted(false);
      return;
    }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [focusedNodeId]);

  useEffect(() => {
    if (!node || node.data.kind !== "note") return;
    const timer = setTimeout(() => {
      const el = noteRef.current;
      if (!el) return;
      el.focus();
      const pos = el.value.length;
      el.setSelectionRange(pos, pos);
    }, 120);
    return () => clearTimeout(timer);
  }, [node]);

  useEffect(() => {
    if (!node) return;
    if (initializedNodeRef.current === node.id) return;
    initializedNodeRef.current = node.id;

    if (node.data.kind === "blog") {
      const data = node.data as BlogNodeData;
      setBlogTitle(data.title);
      setBlogMarkdown(data.markdown);
      return;
    }

    if (node.data.kind === "link") {
      const data = node.data as LinkNodeData;
      setLinkTitle(data.title);
      setLinkUrl(data.url);
      setLinkDescription(data.description ?? "");
      setLinkEmbed(data.embed ?? true);
      return;
    }

    if (node.data.kind === "image") {
      const data = node.data as ImageNodeData;
      setImageUrl(data.url);
      setImageCaption(data.caption ?? "");
      return;
    }

    if (node.data.kind === "note") {
      const data = node.data as NoteNodeData;
      setNoteText(data.text);
      setNoteColor(data.color);
      return;
    }

    if (node.data.kind === "document") {
      const data = node.data as DocumentNodeData;
      setDocTitle(data.title);
      setDocContent(data.content);
      setDocMode("write");
      setSelection(null);
      setActiveHighlightId(null);
      setCommentDraft("");
      setDocRailCollapsed(false);
      return;
    }

    if (node.data.kind === "pdf") {
      setPdfActiveHighlightId(null);
      setPdfAiInput("");
      setPdfAiSending(false);
      setPdfAiError(null);
      setPdfCommentDraft("");
      setPdfReplacing(false);
    }
  }, [node]);

  useEffect(() => {
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (event.key === "Escape") {
        event.preventDefault();
        clearFocus();
        return;
      }
      if (typing) return;
      if (node.data.kind === "document" && event.key === "`") {
        event.preventDefault();
        setDocRailCollapsed((v) => !v);
      } else if (node.data.kind === "document" && event.key.toLowerCase() === "w") {
        event.preventDefault();
        setDocMode("write");
      } else if (node.data.kind === "document" && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setDocMode("annotate");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearFocus, node]);

  useEffect(() => {
    if (!nodeId || nodeKind !== "blog") return;
    const timer = setTimeout(() => {
      updateNodeData(nodeId, {
        title: blogTitle,
        markdown: blogMarkdown,
      } as Partial<BlogNodeData>);
    }, 220);
    return () => clearTimeout(timer);
  }, [blogMarkdown, blogTitle, nodeId, nodeKind, updateNodeData]);

  useEffect(() => {
    if (!nodeId || nodeKind !== "link") return;
    const timer = setTimeout(() => {
      updateNodeData(nodeId, {
        title: linkTitle,
        url: linkUrl,
        description: linkDescription,
        embed: linkEmbed,
      } as Partial<LinkNodeData>);
    }, 220);
    return () => clearTimeout(timer);
  }, [
    linkDescription,
    linkEmbed,
    linkTitle,
    linkUrl,
    nodeId,
    nodeKind,
    updateNodeData,
  ]);

  useEffect(() => {
    if (!nodeId || nodeKind !== "image") return;
    const timer = setTimeout(() => {
      updateNodeData(nodeId, {
        url: imageUrl,
        caption: imageCaption,
      } as Partial<ImageNodeData>);
    }, 220);
    return () => clearTimeout(timer);
  }, [imageCaption, imageUrl, nodeId, nodeKind, updateNodeData]);

  useEffect(() => {
    if (!nodeId || nodeKind !== "note") return;
    const timer = setTimeout(() => {
      updateNodeData(nodeId, {
        text: noteText,
        color: noteColor,
      } as Partial<NoteNodeData>);
    }, 220);
    return () => clearTimeout(timer);
  }, [nodeId, nodeKind, noteColor, noteText, updateNodeData]);

  useEffect(() => {
    if (!nodeId || nodeKind !== "document" || docMode !== "write") return;
    const timer = setTimeout(() => {
      updateNodeData(nodeId, {
        title: docTitle,
        content: docContent,
      } as Partial<DocumentNodeData>);
    }, 220);
    return () => clearTimeout(timer);
  }, [docContent, docMode, docTitle, nodeId, nodeKind, updateNodeData]);

  if (!node) return null;

  const saveDotClass = isDirty
    ? "bg-[var(--pg-accent)] animate-pulse"
    : justSaved
    ? "bg-[var(--pg-accent)]"
    : "bg-zinc-600";

  const documentData =
    node.data.kind === "document" ? (node.data as DocumentNodeData) : null;
  const sourceDocumentContent = documentData?.content ?? "";
  const segments = documentData
    ? buildSegments(sourceDocumentContent, documentData.highlights)
    : [];
  const activeHighlight = documentData
    ? documentData.highlights.find((h) => h.id === activeHighlightId) ?? null
    : null;
  const resolvedLinkUrl = normalizeUrl(linkUrl);

  const pdfData = node.data.kind === "pdf" ? (node.data as PdfNodeData) : null;
  const activePdfHighlight = pdfData
    ? pdfData.highlights.find((h) => h.id === pdfActiveHighlightId) ?? null
    : null;

  const onSelectText = () => {
    if (!documentData || docMode !== "annotate" || !contentRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!contentRef.current.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }
    let start = 0;
    let end = 0;
    const walker = document.createTreeWalker(contentRef.current, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let hitStart = false;
    let textNode: globalThis.Node | null;
    while ((textNode = walker.nextNode())) {
      const len = textNode.nodeValue?.length ?? 0;
      if (!hitStart && textNode === range.startContainer) {
        start = offset + range.startOffset;
        hitStart = true;
      }
      if (textNode === range.endContainer) {
        end = offset + range.endOffset;
        break;
      }
      offset += len;
    }
    if (start === end) {
      setSelection(null);
      return;
    }
    if (start > end) [start, end] = [end, start];
    const rect = range.getBoundingClientRect();
    setSelection({
      start,
      end,
      rect: { x: rect.left + rect.width / 2, y: rect.top },
    });
  };

  const switchToAnnotate = () => {
    if (!nodeId || nodeKind !== "document") return;
    updateNodeData(nodeId, {
      title: docTitle,
      content: docContent,
    } as Partial<DocumentNodeData>);
    setDocMode("annotate");
  };

  const uploadPdfFile = async (file: File) => {
    if (!nodeId || !pdfData) return;
    setPdfReplacing(true);
    setPdfAiError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `upload failed (${res.status})`);
      }
      const json = (await res.json()) as { url: string; name: string };
      updateNodeData(nodeId, {
        src: json.url,
        fileName: json.name,
        title:
          pdfData.title && pdfData.title !== "New PDF"
            ? pdfData.title
            : json.name.replace(/\.pdf$/i, ""),
      } as Partial<PdfNodeData>);
    } catch (err) {
      setPdfAiError((err as Error).message);
    } finally {
      setPdfReplacing(false);
    }
  };

  const askAiAboutHighlight = async (
    highlightId: string,
    question: string
  ) => {
    if (!pdfData || !nodeId || !question.trim()) return;
    const target = pdfData.highlights.find((h) => h.id === highlightId);
    if (!target) return;

    const userMessage: AiMessage = {
      id: nanoid(8),
      role: "user",
      text: question.trim(),
      createdAt: Date.now(),
    };
    appendPdfAiMessage(nodeId, highlightId, userMessage);
    setPdfAiInput("");
    setPdfAiSending(true);
    setPdfAiError(null);
    try {
      const history = target.aiThread.map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        text: m.text,
      }));
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: userMessage.text,
          context: target.text,
          source: pdfData.fileName ?? pdfData.title,
          history,
        }),
      });
      const data = (await res.json()) as {
        answer?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `AI error (${res.status})`);
      }
      const assistantMessage: AiMessage = {
        id: nanoid(8),
        role: "assistant",
        text: data.answer ?? "(empty response)",
        createdAt: Date.now(),
      };
      appendPdfAiMessage(nodeId, highlightId, assistantMessage);
    } catch (err) {
      setPdfAiError((err as Error).message);
    } finally {
      setPdfAiSending(false);
    }
  };

  const createPdfHighlight = (selection: PdfSelectionEvent, color: string) => {
    if (!nodeId || !pdfData) return null;
    const id = addPdfHighlight(
      nodeId,
      selection.page,
      selection.rects,
      selection.text,
      color
    );
    return id;
  };

  const handleAskAiFromSelection = (selection: PdfSelectionEvent) => {
    if (!nodeId || !pdfData) return;
    const id = createPdfHighlight(selection, HIGHLIGHT_COLORS[0]);
    if (id) {
      setPdfActiveHighlightId(id);
      setPdfAiInput("Summarize this in plain English.");
    }
  };

  return (
    <div
      className={clsx(
        "fixed inset-0 z-[60] bg-black/70 backdrop-blur-[3px] transition-opacity duration-200",
        mounted ? "opacity-100" : "opacity-0"
      )}
    >
      <div
        className={clsx(
          "absolute inset-0 transition-all duration-200 ease-out",
          mounted
            ? "translate-y-0 opacity-100 scale-100"
            : "translate-y-1 opacity-0 scale-[0.995]"
        )}
      >
        <div className="h-full w-full bg-[var(--pg-bg)] border-t border-[var(--pg-border)] flex flex-col">
          <header className="h-11 border-b border-[var(--pg-border)] px-3 flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <button
                className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--pg-border)] px-2 text-[11px] font-mono text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                onClick={clearFocus}
              >
                <ArrowLeft size={12} /> back
              </button>
              <span className="text-[11px] font-mono text-zinc-500">
                {node.data.kind}
              </span>
              {breadcrumb.length ? (
                <span className="truncate text-[11px] font-mono text-zinc-600">
                  {breadcrumb.join(" / ")}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500">
              <span className={`h-2 w-2 rounded-full ${saveDotClass}`} />
              <span>esc</span>
              {node.data.kind === "document" ? <span>w/a `</span> : null}
            </div>
          </header>

          {node.data.kind === "link" ? (
            <section className="flex-1 overflow-y-auto">
              <div className="mx-auto h-full max-w-6xl px-6 py-6 flex flex-col gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2">
                    <div className="mb-1 text-[11px] font-mono text-zinc-500 inline-flex items-center gap-1">
                      <Link2 size={11} />
                      title
                    </div>
                    <input
                      className="w-full bg-transparent text-lg font-semibold text-zinc-100 outline-none"
                      value={linkTitle}
                      onChange={(event) => setLinkTitle(event.target.value)}
                      placeholder="Website title"
                    />
                  </div>
                  <div className="rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2">
                    <div className="mb-1 text-[11px] font-mono text-zinc-500">url</div>
                    <div className="flex items-center gap-2">
                      <input
                        className="w-full bg-transparent text-sm font-mono text-zinc-200 outline-none"
                        value={linkUrl}
                        onChange={(event) => setLinkUrl(event.target.value)}
                        placeholder="https://example.com"
                      />
                      <a
                        href={resolvedLinkUrl || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={clsx(
                          "rounded border px-2 py-1 text-[11px] font-mono",
                          resolvedLinkUrl
                            ? "border-[var(--pg-border-strong)] text-[var(--pg-accent)] hover:bg-zinc-800"
                            : "border-[var(--pg-border)] text-zinc-600 pointer-events-none"
                        )}
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </div>
                <textarea
                  className="w-full resize-none rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2 text-sm text-zinc-300 outline-none"
                  rows={3}
                  value={linkDescription}
                  onChange={(event) => setLinkDescription(event.target.value)}
                  placeholder="Notes about this site..."
                />
                <label className="inline-flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                  <input
                    type="checkbox"
                    checked={linkEmbed}
                    onChange={(event) => setLinkEmbed(event.target.checked)}
                  />
                  embed website in node and focus view
                </label>
                <div className="flex-1 min-h-[340px] overflow-hidden rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-elevated)]">
                  {linkEmbed && resolvedLinkUrl ? (
                    <iframe
                      title={linkTitle || "Embedded website"}
                      src={resolvedLinkUrl}
                      className="nowheel h-full w-full bg-white"
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center px-4 text-center text-[12px] text-zinc-500">
                      {resolvedLinkUrl
                        ? "Enable embed to browse this site directly."
                        : "Paste a URL to embed and scroll it naturally."}
                    </div>
                  )}
                </div>
                <p className="text-[11px] font-mono text-zinc-500">
                  Some websites block embedding for security (X-Frame-Options).
                </p>
              </div>
            </section>
          ) : null}

          {node.data.kind === "blog" ? (
            <section className="flex-1 min-h-0 grid lg:grid-cols-2">
              <div className="min-h-0 overflow-y-auto border-r border-[var(--pg-border)] px-6 py-6">
                <div className="mb-2 text-[11px] font-mono text-zinc-500">
                  edit directly
                </div>
                <input
                  className="mb-3 w-full bg-transparent text-3xl font-semibold text-zinc-100 outline-none"
                  value={blogTitle}
                  onChange={(event) => setBlogTitle(event.target.value)}
                  placeholder="Untitled"
                />
                <textarea
                  className="w-full min-h-[65vh] resize-y rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-3 text-sm font-mono text-zinc-200 outline-none"
                  value={blogMarkdown}
                  onChange={(event) => setBlogMarkdown(event.target.value)}
                  placeholder="Start writing..."
                />
              </div>
              <div className="min-h-0 overflow-y-auto px-6 py-6">
                <div className="mb-3 text-[11px] font-mono text-zinc-500">live preview</div>
                <h1 className="mb-4 text-3xl font-semibold leading-tight text-zinc-100">
                  {blogTitle || "Untitled"}
                </h1>
                <article className="prose prose-sm prose-zinc dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {blogMarkdown || "_Nothing yet._"}
                  </ReactMarkdown>
                </article>
              </div>
            </section>
          ) : null}

          {node.data.kind === "image" ? (
            <section className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-4xl px-6 py-6 flex flex-col gap-3">
                <div className="text-[11px] font-mono text-zinc-500 inline-flex items-center gap-1">
                  <ImageIcon size={11} /> image
                </div>
                <input
                  className="rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2 text-sm font-mono text-zinc-200 outline-none"
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="https://..."
                />
                <input
                  className="rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2 text-sm text-zinc-300 outline-none"
                  value={imageCaption}
                  onChange={(event) => setImageCaption(event.target.value)}
                  placeholder="Caption"
                />
                <div className="overflow-hidden rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-elevated)]">
                  {imageUrl.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt={imageCaption || "Image"}
                      className="max-h-[70vh] w-full object-contain bg-black"
                    />
                  ) : (
                    <div className="h-64 flex items-center justify-center text-[12px] text-zinc-500">
                      Paste an image URL to preview.
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {node.data.kind === "note" ? (
            <section className="flex-1 min-h-0 overflow-y-auto">
              <div className="mx-auto flex min-h-full max-w-2xl items-center justify-center px-6 py-10">
                <div
                  className="relative w-full rounded-xl p-10 shadow-[0_30px_80px_rgba(0,0,0,0.45)] ring-1 ring-black/10 transition-colors duration-200"
                  style={{ backgroundColor: noteColor }}
                >
                  <textarea
                    ref={noteRef}
                    className="nowheel w-full min-h-[55vh] resize-none bg-transparent text-[17px] leading-[1.65] text-zinc-900 placeholder:text-zinc-700/50 outline-none font-serif"
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder="Start writing…"
                  />
                  <div className="mt-6 flex items-center justify-between gap-3 border-t border-black/10 pt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {NOTE_COLORS.map((color) => (
                        <button
                          key={color}
                          className={clsx(
                            "h-5 w-5 rounded-full border border-black/20 transition-transform duration-150 ease-out hover:scale-110",
                            noteColor === color &&
                              "ring-2 ring-black/40 ring-offset-1 ring-offset-transparent"
                          )}
                          style={{ backgroundColor: color }}
                          onClick={() => setNoteColor(color)}
                          aria-label={`Note color ${color}`}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] font-mono text-zinc-900/55">
                      {noteText.trim() ? noteText.trim().split(/\s+/).length : 0}{" "}
                      {noteText.trim().split(/\s+/).length === 1 ? "word" : "words"}
                      {" · "}
                      {noteText.length} {noteText.length === 1 ? "char" : "chars"}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {documentData ? (
            <section className="flex-1 flex min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto px-8 py-7 relative">
                <div className="mx-auto max-w-3xl">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="inline-flex rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-0.5">
                      <button
                        className={clsx(
                          "rounded px-2 py-1 text-[11px] font-mono",
                          docMode === "write"
                            ? "bg-[var(--pg-bg-elevated)] text-zinc-100"
                            : "text-zinc-500 hover:text-zinc-200"
                        )}
                        onClick={() => setDocMode("write")}
                      >
                        write
                      </button>
                      <button
                        className={clsx(
                          "rounded px-2 py-1 text-[11px] font-mono",
                          docMode === "annotate"
                            ? "bg-[var(--pg-bg-elevated)] text-zinc-100"
                            : "text-zinc-500 hover:text-zinc-200"
                        )}
                        onClick={switchToAnnotate}
                      >
                        annotate
                      </button>
                    </div>
                    {docMode === "annotate" ? (
                      <button
                        className="text-[11px] font-mono text-zinc-500 hover:text-zinc-200"
                        onClick={() => setDocRailCollapsed((prev) => !prev)}
                      >
                        {docRailCollapsed ? "show comments (`)" : "hide comments (`)"}
                      </button>
                    ) : null}
                  </div>

                  {docMode === "write" ? (
                    <>
                      <input
                        className="mb-3 w-full bg-transparent text-3xl font-semibold text-zinc-100 outline-none"
                        placeholder="Document title"
                        value={docTitle}
                        onChange={(event) => setDocTitle(event.target.value)}
                      />
                      <textarea
                        className="w-full min-h-[65vh] resize-y rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-3 text-base text-zinc-200 outline-none font-serif leading-relaxed"
                        placeholder="Write like Notion..."
                        value={docContent}
                        onChange={(event) => setDocContent(event.target.value)}
                      />
                    </>
                  ) : (
                    <>
                      <h1 className="text-3xl font-semibold text-zinc-100 mb-6 leading-tight">
                        {documentData.title || "Untitled document"}
                      </h1>
                      <div
                        ref={contentRef}
                        className="text-base text-zinc-200 leading-relaxed whitespace-pre-wrap font-serif"
                        onMouseUp={onSelectText}
                      >
                        {sourceDocumentContent ? (
                          segments.map((segment, idx) => {
                            if (!segment.highlightIds.length) {
                              return <span key={idx}>{segment.text}</span>;
                            }
                            const hasComments = segment.highlightIds.some((id) => {
                              const h = documentData.highlights.find((x) => x.id === id);
                              return (h?.comments.length ?? 0) > 0;
                            });
                            return (
                              <span
                                key={idx}
                                className="cursor-pointer rounded-sm"
                                style={{
                                  backgroundColor: segment.color ?? undefined,
                                  color: "#18181b",
                                  boxShadow:
                                    activeHighlightId &&
                                    segment.highlightIds.includes(activeHighlightId)
                                      ? "0 0 0 2px rgba(250,250,250,0.6)"
                                      : undefined,
                                }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveHighlightId(
                                    segment.highlightIds[segment.highlightIds.length - 1]
                                  );
                                }}
                              >
                                {segment.text}
                                {hasComments ? (
                                  <sup className="ml-0.5 text-zinc-600">
                                    <MessageSquare size={9} className="inline" />
                                  </sup>
                                ) : null}
                              </span>
                            );
                          })
                        ) : (
                          <span className="italic text-zinc-500">
                            Switch to write mode and add content first.
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {selection && docMode === "annotate" ? (
                  <div
                    className="fixed z-[65] -translate-x-1/2 -translate-y-full mt-[-8px] bg-zinc-900 border border-zinc-700 rounded-lg px-1.5 py-1 flex items-center gap-1 shadow-lg"
                    style={{ top: selection.rect.y, left: selection.rect.x }}
                  >
                    <Highlighter size={12} className="text-zinc-400 ml-0.5" />
                    {HIGHLIGHT_COLORS.map((color) => (
                      <button
                        key={color}
                        className="h-5 w-5 rounded-full border border-white/20"
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          const id = addHighlight(
                            node.id,
                            selection.start,
                            selection.end,
                            color
                          );
                          setActiveHighlightId(id);
                          setSelection(null);
                          window.getSelection()?.removeAllRanges();
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              <aside
                className={clsx(
                  "shrink-0 border-l border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] transition-all duration-150",
                  docMode !== "annotate" || docRailCollapsed
                    ? "w-0 overflow-hidden"
                    : "w-[320px]"
                )}
              >
                {docMode === "annotate" && !docRailCollapsed ? (
                  <div className="h-full flex flex-col">
                    <div className="h-10 border-b border-[var(--pg-border)] px-3 flex items-center justify-between">
                      <span className="text-[11px] font-mono text-zinc-500">
                        {activeHighlight ? "comments" : "highlights"}
                      </span>
                      <button
                        className="text-[11px] font-mono text-zinc-500 hover:text-zinc-200"
                        onClick={() => setDocRailCollapsed(true)}
                      >
                        `
                      </button>
                    </div>

                    {activeHighlight ? (
                      <div className="flex-1 flex flex-col min-h-0">
                        <div className="px-3 py-2 border-b border-[var(--pg-border)] flex items-center justify-between">
                          <button
                            className="text-[11px] font-mono text-zinc-500 hover:text-zinc-200"
                            onClick={() => setActiveHighlightId(null)}
                          >
                            ← back
                          </button>
                          <button
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-red-400 hover:text-red-300"
                            onClick={() => {
                              deleteHighlight(node.id, activeHighlight.id);
                              setActiveHighlightId(null);
                            }}
                          >
                            <Trash2 size={11} /> remove
                          </button>
                        </div>
                        <div className="px-3 py-2 border-b border-[var(--pg-border)]">
                          <span
                            className="text-xs rounded-sm px-1 py-0.5"
                            style={{
                              backgroundColor: activeHighlight.color,
                              color: "#18181b",
                            }}
                          >
                            {sourceDocumentContent.slice(
                              activeHighlight.start,
                              activeHighlight.end
                            )}
                          </span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                          {activeHighlight.comments.length === 0 ? (
                            <div className="px-1 py-2 text-[11px] text-zinc-500">
                              No comments yet.
                            </div>
                          ) : (
                            activeHighlight.comments.map((comment) => (
                              <div
                                key={comment.id}
                                className="rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-elevated)] p-2"
                              >
                                <p className="text-sm text-zinc-200 whitespace-pre-wrap">
                                  {comment.text}
                                </p>
                                <div className="mt-1 flex justify-between text-[10px] font-mono text-zinc-500">
                                  <span>
                                    {new Date(comment.createdAt).toLocaleDateString()}
                                  </span>
                                  <button
                                    onClick={() =>
                                      deleteComment(node.id, activeHighlight.id, comment.id)
                                    }
                                  >
                                    delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="border-t border-[var(--pg-border)] p-2">
                          <textarea
                            className="w-full rounded-md border border-[var(--pg-border-strong)] bg-transparent px-2 py-1.5 text-sm text-zinc-200 outline-none resize-none"
                            rows={2}
                            value={commentDraft}
                            onChange={(e) => setCommentDraft(e.target.value)}
                            placeholder="Add comment..."
                            onKeyDown={(event) => {
                              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                event.preventDefault();
                                if (!commentDraft.trim()) return;
                                addComment(node.id, activeHighlight.id, commentDraft.trim());
                                setCommentDraft("");
                              }
                            }}
                          />
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-[10px] font-mono text-zinc-500">cmd+↵</span>
                            <button
                              className={clsx(
                                "rounded px-2 py-1 text-[11px] font-mono",
                                commentDraft.trim()
                                  ? "border border-[var(--pg-border-strong)] text-zinc-200 hover:bg-zinc-800"
                                  : "text-zinc-600"
                              )}
                              disabled={!commentDraft.trim()}
                              onClick={() => {
                                if (!commentDraft.trim()) return;
                                addComment(node.id, activeHighlight.id, commentDraft.trim());
                                setCommentDraft("");
                              }}
                            >
                              post
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {documentData.highlights.length === 0 ? (
                          <div className="px-2 py-3 text-[11px] text-zinc-500">
                            select text to create a highlight
                          </div>
                        ) : (
                          documentData.highlights
                            .slice()
                            .sort((a, b) => a.start - b.start)
                            .map((highlight) => (
                              <button
                                key={highlight.id}
                                className="w-full rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-elevated)] p-2 text-left"
                                onClick={() => setActiveHighlightId(highlight.id)}
                              >
                                <span
                                  className="line-clamp-3 text-xs rounded-sm px-1"
                                  style={{
                                    backgroundColor: highlight.color,
                                    color: "#18181b",
                                  }}
                                >
                                  {sourceDocumentContent.slice(highlight.start, highlight.end)}
                                </span>
                                {highlight.comments.length ? (
                                  <div className="mt-1 text-[10px] font-mono text-zinc-500">
                                    {highlight.comments.length} comments
                                  </div>
                                ) : null}
                              </button>
                            ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div />
                )}
              </aside>
            </section>
          ) : null}

          {pdfData ? (
            <section className="flex min-h-0 flex-1">
              <div className="relative flex min-h-0 flex-1 flex-col">
                {pdfData.src ? (
                  <PdfViewer
                    ref={pdfViewerRef}
                    src={pdfData.src}
                    highlights={pdfData.highlights}
                    activeHighlightId={pdfActiveHighlightId}
                    onSelectionHighlight={(selection, color) => {
                      const id = createPdfHighlight(selection, color);
                      if (id) setPdfActiveHighlightId(id);
                    }}
                    onAskAi={handleAskAiFromSelection}
                    onHighlightClick={(id) => setPdfActiveHighlightId(id)}
                    onDocumentLoaded={({ pageCount }) => {
                      if (!nodeId) return;
                      if (pdfData.pageCount !== pageCount) {
                        updateNodeData(nodeId, {
                          pageCount,
                        } as Partial<PdfNodeData>);
                      }
                    }}
                  />
                ) : (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="max-w-sm rounded-lg border border-dashed border-[var(--pg-border-strong)] bg-[var(--pg-bg-subtle)] p-8 text-center">
                      <FileText
                        size={28}
                        className="mx-auto mb-2 text-zinc-500"
                      />
                      <div className="mb-1 text-sm font-semibold text-zinc-100">
                        No PDF yet
                      </div>
                      <div className="mb-4 text-[12px] text-zinc-400">
                        Upload a PDF to start reading, highlighting, and
                        asking AI about it.
                      </div>
                      <button
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-bg-elevated)] px-3 py-1.5 text-[12px] font-mono text-zinc-100 hover:bg-zinc-800"
                        onClick={() => pdfFileInputRef.current?.click()}
                      >
                        <Upload size={12} />{" "}
                        {pdfReplacing ? "uploading…" : "upload pdf"}
                      </button>
                      {pdfAiError ? (
                        <div className="mt-3 text-[11px] text-red-400">
                          {pdfAiError}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
                <input
                  ref={pdfFileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadPdfFile(file);
                    event.target.value = "";
                  }}
                />
              </div>

              <aside className="flex w-[420px] shrink-0 flex-col border-l border-[var(--pg-border)] bg-[var(--pg-bg)]">
                {activePdfHighlight ? (
                  <PdfHighlightPanel
                    highlight={activePdfHighlight}
                    onBack={() => setPdfActiveHighlightId(null)}
                    onJump={() =>
                      pdfViewerRef.current?.jumpToHighlight(
                        activePdfHighlight.id
                      )
                    }
                    onRemove={() => {
                      if (!nodeId) return;
                      deletePdfHighlight(nodeId, activePdfHighlight.id);
                      setPdfActiveHighlightId(null);
                    }}
                    input={pdfAiInput}
                    setInput={setPdfAiInput}
                    sending={pdfAiSending}
                    error={pdfAiError}
                    onAsk={(question) =>
                      askAiAboutHighlight(activePdfHighlight.id, question)
                    }
                    commentDraft={pdfCommentDraft}
                    setCommentDraft={setPdfCommentDraft}
                    onAddComment={(text) => {
                      if (!nodeId) return;
                      addPdfComment(nodeId, activePdfHighlight.id, text);
                    }}
                    onDeleteComment={(commentId) => {
                      if (!nodeId) return;
                      deletePdfComment(
                        nodeId,
                        activePdfHighlight.id,
                        commentId
                      );
                    }}
                  />
                ) : (
                  <PdfHighlightsList
                    highlights={pdfData.highlights}
                    onOpen={(id) => {
                      setPdfActiveHighlightId(id);
                      pdfViewerRef.current?.jumpToHighlight(id);
                    }}
                    onReplace={
                      pdfData.src
                        ? () => pdfFileInputRef.current?.click()
                        : undefined
                    }
                  />
                )}
              </aside>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type PdfHighlightItem = PdfNodeData["highlights"][number];

const SUGGESTED_PROMPTS = [
  "Summarize this in plain English",
  "Explain it like I'm five",
  "What are the key claims?",
  "What's the counter-argument?",
];

function PdfHighlightPanel({
  highlight,
  onBack,
  onJump,
  onRemove,
  input,
  setInput,
  sending,
  error,
  onAsk,
  commentDraft,
  setCommentDraft,
  onAddComment,
  onDeleteComment,
}: {
  highlight: PdfHighlightItem;
  onBack: () => void;
  onJump: () => void;
  onRemove: () => void;
  input: string;
  setInput: (value: string) => void;
  sending: boolean;
  error: string | null;
  onAsk: (question: string) => void;
  commentDraft: string;
  setCommentDraft: (value: string) => void;
  onAddComment: (text: string) => void;
  onDeleteComment: (commentId: string) => void;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [highlight.aiThread.length, sending]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  const submit = (value: string) => {
    const q = value.trim();
    if (!q || sending) return;
    onAsk(q);
  };

  const excerpt =
    highlight.text.length > 320
      ? highlight.text.slice(0, 320).trimEnd() + "…"
      : highlight.text;

  const canSend = input.trim().length > 0 && !sending;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--pg-border)] px-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-zinc-400 hover:bg-[var(--pg-bg-elevated)] hover:text-zinc-200"
        >
          <ArrowLeft size={14} />
          All highlights
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onJump}
            className="rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:bg-[var(--pg-bg-elevated)] hover:text-zinc-200"
            title="Jump to page in PDF"
          >
            Jump to page
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center rounded-md p-1.5 text-zinc-500 hover:bg-[var(--pg-bg-elevated)] hover:text-red-400"
            title="Delete highlight"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-5 pb-6 pt-4"
      >
        <div className="relative mb-5 overflow-hidden rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] pl-3 pr-3 py-2.5">
          <span
            className="absolute inset-y-0 left-0 w-1"
            style={{ backgroundColor: highlight.color }}
            aria-hidden
          />
          <div className="pl-2">
            <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Source · page {highlight.page}
            </div>
            <p className="text-[13px] leading-relaxed text-zinc-300">
              {excerpt}
            </p>
          </div>
        </div>

        {highlight.aiThread.length === 0 && !sending ? (
          <div className="pt-1">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
              <Sparkles size={12} /> Ask about this excerpt
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => submit(prompt)}
                  disabled={sending}
                  className="rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-1 text-[12px] text-zinc-300 hover:border-[var(--pg-border-strong)] hover:bg-[var(--pg-bg-elevated)] hover:text-zinc-100 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-5">
          {highlight.aiThread.map((message, idx) => (
            <PdfAiTurn key={message.id} message={message} isFirst={idx === 0} />
          ))}
          {sending ? <PdfThinking /> : null}
          {error ? (
            <div className="rounded-md border border-red-900/60 bg-red-950/30 p-2.5 text-[12px] text-red-300">
              {error}
            </div>
          ) : null}
        </div>

        <div className="mt-8 border-t border-[var(--pg-border)] pt-3">
          <button
            type="button"
            onClick={() => setCommentsOpen((v) => !v)}
            className="flex w-full items-center justify-between text-[11px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
          >
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare size={12} />
              Notes
              {highlight.comments.length ? (
                <span className="text-zinc-400">
                  ({highlight.comments.length})
                </span>
              ) : null}
            </span>
            <span>{commentsOpen ? "−" : "+"}</span>
          </button>
          {commentsOpen ? (
            <div className="mt-2 space-y-2">
              {highlight.comments.map((comment) => (
                <div
                  key={comment.id}
                  className="group rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2.5 py-2"
                >
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-200">
                    {comment.text}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                    <span>
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteComment(comment.id)}
                      className="opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    >
                      delete
                    </button>
                  </div>
                </div>
              ))}
              <textarea
                className="w-full resize-none rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2.5 py-2 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[var(--pg-border-strong)]"
                rows={2}
                placeholder="Add a note… (⌘↵ to save)"
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    const t = commentDraft.trim();
                    if (!t) return;
                    onAddComment(t);
                    setCommentDraft("");
                  }
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--pg-border)] bg-[var(--pg-bg)] px-4 py-3">
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2 transition-colors focus-within:border-[var(--pg-border-strong)]">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(input);
              }
            }}
            placeholder="Ask a follow-up…"
            className="min-h-[22px] max-h-[160px] flex-1 resize-none bg-transparent text-[14px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          <button
            type="button"
            onClick={() => submit(input)}
            disabled={!canSend}
            className={clsx(
              "mb-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
              canSend
                ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                : "bg-[var(--pg-bg-elevated)] text-zinc-600"
            )}
            aria-label="Send"
          >
            <Send size={13} />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] font-mono text-zinc-600">
          <span>⏎ send · ⇧⏎ newline</span>
          {sending ? <span className="text-zinc-500">thinking…</span> : null}
        </div>
      </div>
    </div>
  );
}

function PdfAiTurn({
  message,
  isFirst,
}: {
  message: AiMessage;
  isFirst: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className={clsx(isFirst ? "" : "border-t border-[var(--pg-border)] pt-5")}>
        <h3 className="text-[17px] font-semibold leading-snug text-zinc-100">
          {message.text}
        </h3>
      </div>
    );
  }
  return (
    <div className="mt-1">
      <div className="mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
        <Sparkles size={11} /> Answer
      </div>
      <div className="prose prose-sm prose-invert max-w-none prose-p:my-2 prose-p:leading-relaxed prose-p:text-zinc-200 prose-headings:text-zinc-100 prose-strong:text-zinc-100 prose-a:text-zinc-100 prose-code:text-zinc-100 prose-code:bg-[var(--pg-bg-subtle)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-[var(--pg-bg-subtle)] prose-pre:border prose-pre:border-[var(--pg-border)] prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:text-zinc-200">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
      </div>
    </div>
  );
}

function PdfThinking() {
  return (
    <div className="mt-1">
      <div className="mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
        <Sparkles size={11} /> Answer
      </div>
      <div className="flex items-center gap-1 py-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:240ms]" />
      </div>
    </div>
  );
}

function PdfHighlightsList({
  highlights,
  onOpen,
  onReplace,
}: {
  highlights: PdfHighlightItem[];
  onOpen: (id: string) => void;
  onReplace?: () => void;
}) {
  const sorted = highlights
    .slice()
    .sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--pg-border)] px-4">
        <div className="inline-flex items-center gap-2 text-[12px] text-zinc-300">
          <Highlighter size={13} className="text-zinc-500" />
          <span className="font-medium">Highlights</span>
          {highlights.length ? (
            <span className="text-zinc-500">{highlights.length}</span>
          ) : null}
        </div>
        {onReplace ? (
          <button
            type="button"
            onClick={onReplace}
            className="rounded-md px-2 py-1 text-[11px] text-zinc-500 hover:bg-[var(--pg-bg-elevated)] hover:text-zinc-300"
          >
            Replace PDF
          </button>
        ) : null}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {sorted.length === 0 ? (
          <div className="mt-8 px-4 text-center">
            <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] text-zinc-500">
              <Highlighter size={16} />
            </div>
            <p className="text-[13px] text-zinc-300">No highlights yet</p>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
              Select text in the PDF to highlight it, or ask the AI to explain
              a passage.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {sorted.map((highlight) => {
              const preview =
                highlight.text.length > 180
                  ? highlight.text.slice(0, 180).trimEnd() + "…"
                  : highlight.text;
              return (
                <button
                  key={highlight.id}
                  type="button"
                  onClick={() => onOpen(highlight.id)}
                  className="group relative block w-full overflow-hidden rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-3 pl-4 text-left transition-colors hover:border-[var(--pg-border-strong)] hover:bg-[var(--pg-bg-elevated)]"
                >
                  <span
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ backgroundColor: highlight.color }}
                    aria-hidden
                  />
                  <div className="mb-1 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    <span>Page {highlight.page}</span>
                    <div className="flex items-center gap-2">
                      {highlight.aiThread.length ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Sparkles size={10} /> {highlight.aiThread.length}
                        </span>
                      ) : null}
                      {highlight.comments.length ? (
                        <span className="inline-flex items-center gap-0.5">
                          <MessageSquare size={10} />{" "}
                          {highlight.comments.length}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="line-clamp-3 text-[13px] leading-relaxed text-zinc-200">
                    {preview}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
