"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  FileText,
  Highlighter,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Send,
  Sparkles,
  StickyNote,
  Trash2,
  Upload,
} from "lucide-react";
import { nanoid } from "nanoid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HIGHLIGHT_COLORS } from "@/lib/defaults";
import { useStore } from "@/lib/store";
import type { AiMessage, CanvasNode, PdfNodeData } from "@/lib/types";
import {
  PdfViewer,
  type PdfSelectionEvent,
  type PdfViewerHandle,
} from "../PdfViewer";
import { RichTextEditor } from "../RichTextEditor";

type PdfHighlightItem = PdfNodeData["highlights"][number];

const SUGGESTED_PROMPTS = [
  "Summarize this in plain English",
  "Explain it like I'm five",
  "What are the key claims?",
  "What's the counter-argument?",
];

export function PdfPanelBody({ node }: { node: CanvasNode }) {
  const pdfData = node.data as PdfNodeData;
  const nodeId = node.id;

  const updateNodeData = useStore((s) => s.updateNodeData);
  const addPdfHighlight = useStore((s) => s.addPdfHighlight);
  const deletePdfHighlight = useStore((s) => s.deletePdfHighlight);
  const addPdfComment = useStore((s) => s.addPdfComment);
  const deletePdfComment = useStore((s) => s.deletePdfComment);
  const appendPdfAiMessage = useStore((s) => s.appendPdfAiMessage);

  const [pdfActiveHighlightId, setPdfActiveHighlightId] = useState<string | null>(null);
  const [pdfAiInput, setPdfAiInput] = useState("");
  const [pdfAiSending, setPdfAiSending] = useState(false);
  const [pdfAiError, setPdfAiError] = useState<string | null>(null);
  const [pdfCommentDraft, setPdfCommentDraft] = useState("");
  const [pdfReplacing, setPdfReplacing] = useState(false);
  const [pdfNotesOpen, setPdfNotesOpen] = useState(false);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);
  const pdfViewerRef = useRef<PdfViewerHandle>(null);
  const pdfAutoAskRef = useRef<string | null>(null);

  const activePdfHighlight =
    pdfData.highlights.find((h) => h.id === pdfActiveHighlightId) ?? null;

  useEffect(() => {
    if (!pdfAutoAskRef.current) return;
    const targetId = pdfAutoAskRef.current;
    const target = pdfData.highlights.find((h) => h.id === targetId);
    if (!target) return;
    pdfAutoAskRef.current = null;
    const question = "Summarize this in plain English.";
    const ctx = target.text;
    const src = pdfData.fileName ?? pdfData.title;
    const userMsg: AiMessage = {
      id: nanoid(8),
      role: "user",
      text: question,
      createdAt: Date.now(),
    };
    appendPdfAiMessage(nodeId, targetId, userMsg);
    setPdfAiSending(true);
    setPdfAiError(null);
    (async () => {
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, context: ctx, source: src, history: [] }),
        });
        const data = (await res.json()) as { answer?: string; error?: string };
        if (!res.ok) throw new Error(data.error || `AI error (${res.status})`);
        const assistantMsg: AiMessage = {
          id: nanoid(8),
          role: "assistant",
          text: data.answer ?? "(empty response)",
          createdAt: Date.now(),
        };
        appendPdfAiMessage(nodeId, targetId, assistantMsg);
      } catch (err) {
        setPdfAiError((err as Error).message);
      } finally {
        setPdfAiSending(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfData.highlights, nodeId]);

  const uploadPdfFile = async (file: File) => {
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
    if (!question.trim()) return;
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
    const id = createPdfHighlight(selection, HIGHLIGHT_COLORS[0]);
    if (id) {
      setPdfActiveHighlightId(id);
      pdfAutoAskRef.current = id;
    }
  };

  return (
    <section className="flex min-h-0 flex-1 overflow-hidden">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center justify-end gap-1 border-b border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2">
          <button
            title={pdfNotesOpen ? "Hide notes" : "Open notes side-by-side"}
            onClick={() => setPdfNotesOpen((v) => !v)}
            className={clsx(
              "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-mono",
              pdfNotesOpen
                ? "border-[var(--pg-accent)] bg-[color-mix(in_srgb,var(--pg-accent)_18%,transparent)] text-zinc-100"
                : "border-[var(--pg-border)] bg-[var(--pg-bg-elevated)] text-zinc-400 hover:text-zinc-100"
            )}
          >
            {pdfNotesOpen ? (
              <PanelRightClose size={12} />
            ) : (
              <PanelRightOpen size={12} />
            )}
            notes
          </button>
        </div>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
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
                <FileText size={28} className="mx-auto mb-2 text-zinc-500" />
                <div className="mb-1 text-sm font-semibold text-zinc-100">
                  No PDF yet
                </div>
                <div className="mb-4 text-[12px] text-zinc-400">
                  Upload a PDF to start reading, highlighting, and asking AI
                  about it.
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
        </div>
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

      {pdfNotesOpen ? (
        <aside className="flex w-[44%] min-w-[340px] max-w-[640px] shrink-0 flex-col border-l border-[var(--pg-border)] bg-[var(--pg-bg)]">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-zinc-500">
              <StickyNote size={12} />
              notes
            </div>
            <button
              title="Close notes"
              onClick={() => setPdfNotesOpen(false)}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-[var(--pg-bg-elevated)] hover:text-zinc-100"
            >
              <PanelRightClose size={12} />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <RichTextEditor
              value={pdfData.notes ?? ""}
              onChange={(html) =>
                updateNodeData(nodeId, {
                  notes: html,
                } as Partial<PdfNodeData>)
              }
              placeholder="Take notes on this PDF…"
            />
          </div>
        </aside>
      ) : null}

      <aside className="flex w-[340px] shrink-0 flex-col border-l border-[var(--pg-border)] bg-[var(--pg-bg)]">
        {activePdfHighlight ? (
          <PdfHighlightPanel
            highlight={activePdfHighlight}
            onBack={() => setPdfActiveHighlightId(null)}
            onJump={() =>
              pdfViewerRef.current?.jumpToHighlight(activePdfHighlight.id)
            }
            onRemove={() => {
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
              addPdfComment(nodeId, activePdfHighlight.id, text);
            }}
            onDeleteComment={(commentId) => {
              deletePdfComment(nodeId, activePdfHighlight.id, commentId);
            }}
          />
        ) : (
          <PdfHighlightsList
            highlights={pdfData.highlights}
            onOpen={(id) => {
              setPdfActiveHighlightId(id);
              pdfViewerRef.current?.jumpToHighlight(id);
            }}
            onDelete={(id) => {
              deletePdfHighlight(nodeId, id);
              if (pdfActiveHighlightId === id) setPdfActiveHighlightId(null);
            }}
            onReplace={
              pdfData.src ? () => pdfFileInputRef.current?.click() : undefined
            }
          />
        )}
      </aside>
    </section>
  );
}

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

  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [highlight.id]);

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
  onDelete,
  onReplace,
}: {
  highlights: PdfHighlightItem[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
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
                <div
                  key={highlight.id}
                  onClick={() => onOpen(highlight.id)}
                  className="group relative block w-full cursor-pointer overflow-hidden rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-3 pl-4 text-left transition-colors hover:border-[var(--pg-border-strong)] hover:bg-[var(--pg-bg-elevated)]"
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(highlight.id);
                        }}
                        className="inline-flex items-center rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                        title="Remove highlight"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  <p className="line-clamp-3 text-[13px] leading-relaxed text-zinc-200">
                    {preview}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
