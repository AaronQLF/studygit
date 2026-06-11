"use client";

// Flashcards deck panel: manage cards, generate them with AI from any
// workspace source (PDF highlights, articles, pages, notes, AI replies),
// and study due cards with an SM-2 spaced-repetition loop.
//
// Three views:
//   deck   — stats header, generation flow, editable card list
//   study  — one due card at a time; flip with Space, grade with 1–4
//   done   — end-of-session summary
//
// All mutations go through updateNodeData(node.id, { cards }) so the
// existing debounced persistence pipeline picks them up unchanged.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Braces,
  CalendarClock,
  Check,
  GraduationCap,
  ImagePlus,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useToastStore } from "@/components/ui/Toast";
import { CardFace } from "@/components/study/CardFace";
import { GRADE_BUTTONS } from "@/components/study/grade-buttons";
import { ImageOcclusionEditor } from "@/components/study/ImageOcclusionEditor";
import { SourcePicker } from "@/components/viewers/SourcePicker";
import { rowToSourceRefAsync, type SourceRow } from "@/lib/source-rows";
import { readAiSettings, hasAiCredentials, AI_SETTINGS_DIALOG_EVENT } from "@/lib/ai-settings";
import { generateCardsFromSources } from "@/lib/flashcards-generate";
import { uploadFileToServer } from "@/lib/upload-file";
import {
  deckStats,
  dueCards,
  examActive,
  examDaysLeft,
  gradeCard,
  isDue,
  newCard,
  nextDueLabel,
  previewIntervalsNow,
  type FlashcardGrade,
  type GeneratedCardDraft,
} from "@/lib/flashcards";
import type {
  AiSourceRef,
  CanvasNode,
  Flashcard,
  FlashcardsNodeData,
  PdfHighlightRect,
} from "@/lib/types";

type View = "deck" | "study";

export function FlashcardsPanelBody({ node }: { node: CanvasNode }) {
  const d = node.data as FlashcardsNodeData;
  const cards = useMemo(() => d.cards ?? [], [d.cards]);
  const updateNodeData = useStore((s) => s.updateNodeData);
  const [view, setView] = useState<View>("deck");

  const setCards = useCallback(
    (next: Flashcard[]) => {
      updateNodeData(node.id, { cards: next } as Partial<FlashcardsNodeData>);
    },
    [node.id, updateNodeData]
  );

  if (view === "study") {
    return (
      <StudyView
        nodeId={node.id}
        cards={cards}
        examDate={(node.data as FlashcardsNodeData).examDate ?? null}
        setCards={setCards}
        onExit={() => setView("deck")}
      />
    );
  }
  return (
    <DeckView
      node={node}
      cards={cards}
      setCards={setCards}
      onStudy={() => setView("study")}
    />
  );
}

// ---------------------------------------------------------------------
// Deck view
// ---------------------------------------------------------------------

function DeckView({
  node,
  cards,
  setCards,
  onStudy,
}: {
  node: CanvasNode;
  cards: Flashcard[];
  setCards: (next: Flashcard[]) => void;
  onStudy: () => void;
}) {
  const pushToast = useToastStore((s) => s.push);
  const updateNodeData = useStore((s) => s.updateNodeData);
  const stats = deckStats(cards);
  const nextDue = nextDueLabel(cards);
  const examDate = (node.data as FlashcardsNodeData).examDate ?? null;

  const [genOpen, setGenOpen] = useState(false);
  const [occlusionOpen, setOcclusionOpen] = useState(false);
  // When set, the occlusion pane edits this card's covers instead of
  // creating a new card.
  const [occlusionEditId, setOcclusionEditId] = useState<string | null>(null);

  const addBlankCard = () => {
    setCards([newCard("", ""), ...cards]);
  };

  const addClozeCard = () => {
    setCards([{ ...newCard("", ""), type: "cloze" as const }, ...cards]);
  };

  const setExamDate = (next: number | null) => {
    updateNodeData(node.id, { examDate: next } as Partial<FlashcardsNodeData>);
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--pg-border)] px-6 pb-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onStudy}
            disabled={stats.due === 0}
            className="inline-flex items-center gap-1.5 rounded-[var(--pg-radius-md)] bg-[var(--pg-study)] px-3 py-1.5 text-[12.5px] font-medium text-white shadow-sm hover:bg-[color-mix(in_srgb,var(--pg-study)_88%,black)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <GraduationCap size={13} />
            Study{stats.due > 0 ? ` ${stats.due} due` : ""}
          </button>
          <button
            onClick={() => setGenOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-[var(--pg-radius-md)] border border-[var(--pg-border-strong)] px-3 py-1.5 text-[12.5px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
          >
            <Sparkles size={13} />
            Generate with AI
          </button>
          <button
            onClick={addBlankCard}
            className="inline-flex items-center gap-1.5 rounded-[var(--pg-radius-md)] border border-[var(--pg-border)] px-3 py-1.5 text-[12.5px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            title="Add a basic question/answer card"
          >
            <Plus size={13} />
            Card
          </button>
          <button
            onClick={addClozeCard}
            className="inline-flex items-center gap-1.5 rounded-[var(--pg-radius-md)] border border-[var(--pg-border)] px-3 py-1.5 text-[12.5px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            title="Add a fill-in-the-blank card — wrap hidden words in {{ }}"
          >
            <Braces size={13} />
            Cloze
          </button>
          <button
            onClick={() => {
              setOcclusionEditId(null);
              setOcclusionOpen((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 rounded-[var(--pg-radius-md)] border border-[var(--pg-border)] px-3 py-1.5 text-[12.5px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            title="Add an image-occlusion card — cover labels on a diagram"
          >
            <ImagePlus size={13} />
            Image
          </button>
          <span className="ml-auto inline-flex items-center gap-2 text-[11.5px] text-[var(--pg-muted)]">
            <ExamDateControl examDate={examDate} onChange={setExamDate} />
            <span>
              {stats.total} {stats.total === 1 ? "card" : "cards"}
              {stats.fresh > 0 ? ` · ${stats.fresh} new` : ""}
              {stats.due === 0 && stats.total > 0 && nextDue
                ? ` · next review ${nextDue}`
                : ""}
            </span>
          </span>
        </div>

        {genOpen ? (
          <GeneratePane
            node={node}
            onClose={() => setGenOpen(false)}
            onGenerated={(drafts, sourceNodeId) => {
              const generated = drafts.map((c) => ({
                ...newCard(c.front, c.back, sourceNodeId),
                ...(c.type === "cloze" ? { type: "cloze" as const } : {}),
              }));
              setCards([...generated, ...cards]);
              setGenOpen(false);
              pushToast({
                message: `Added ${generated.length} ${
                  generated.length === 1 ? "card" : "cards"
                } to the deck`,
              });
            }}
          />
        ) : null}

        {occlusionOpen || occlusionEditId ? (
          <OcclusionPane
            editingCard={
              occlusionEditId
                ? cards.find((c) => c.id === occlusionEditId) ?? null
                : null
            }
            onClose={() => {
              setOcclusionOpen(false);
              setOcclusionEditId(null);
            }}
            onSave={({ imageUrl, rects, hint }) => {
              if (occlusionEditId) {
                setCards(
                  cards.map((c) =>
                    c.id === occlusionEditId
                      ? { ...c, imageUrl, occlusionRects: rects, front: hint }
                      : c
                  )
                );
              } else {
                setCards([
                  {
                    ...newCard(hint, ""),
                    type: "occlusion" as const,
                    imageUrl,
                    occlusionRects: rects,
                  },
                  ...cards,
                ]);
              }
              setOcclusionOpen(false);
              setOcclusionEditId(null);
            }}
          />
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {cards.length === 0 ? (
          <div className="mx-auto mt-10 max-w-sm text-center text-[13px] text-[var(--pg-muted)]">
            <Sparkles size={18} className="mx-auto mb-2 opacity-60" />
            No cards yet. Write one by hand, or attach a PDF, article, or page
            and let AI draft a deck from it.
          </div>
        ) : (
          <div className="space-y-2.5">
            {cards.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                onChange={(patch) =>
                  setCards(
                    cards.map((c) => (c.id === card.id ? { ...c, ...patch } : c))
                  )
                }
                onDelete={() => setCards(cards.filter((c) => c.id !== card.id))}
                onEditAreas={
                  card.type === "occlusion"
                    ? () => {
                        setOcclusionOpen(false);
                        setOcclusionEditId(card.id);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CardRow({
  card,
  onChange,
  onDelete,
  onEditAreas,
}: {
  card: Flashcard;
  onChange: (patch: Partial<Flashcard>) => void;
  onDelete: () => void;
  onEditAreas?: () => void;
}) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  // Re-sync local drafts when the card changes underneath us (AI batch,
  // undo, another panel for the same node) — React's "adjust state
  // during render" pattern, keyed on the persisted values.
  const [prevPersisted, setPrevPersisted] = useState({
    front: card.front,
    back: card.back,
  });
  if (prevPersisted.front !== card.front || prevPersisted.back !== card.back) {
    setPrevPersisted({ front: card.front, back: card.back });
    setFront(card.front);
    setBack(card.back);
  }

  const due = isDue(card);
  const kind = card.type ?? "basic";

  // Wrap the textarea's selection in {{ }} — the cloze authoring helper.
  const wrapSelection = () => {
    const el = frontRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) return;
    const next = `${front.slice(0, start)}{{${front.slice(start, end)}}}${front.slice(end)}`;
    setFront(next);
    onChange({ front: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, end + 4);
    });
  };

  return (
    <div className="group rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg)] p-3 shadow-[var(--pg-shadow-sm)]">
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={
            due
              ? "rounded-full bg-[var(--pg-study-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--pg-study)]"
              : "rounded-full bg-[var(--pg-bg-subtle)] px-2 py-0.5 text-[10px] text-[var(--pg-muted)]"
          }
        >
          {card.lastReviewedAt == null ? "new" : due ? "due" : `${card.interval}d`}
        </span>
        {kind !== "basic" ? (
          <span className="rounded-full bg-[var(--pg-bg-subtle)] px-2 py-0.5 text-[10px] text-[var(--pg-muted)]">
            {kind}
          </span>
        ) : null}
        {kind === "cloze" ? (
          <button
            onClick={wrapSelection}
            className="rounded-md border border-[var(--pg-border)] px-1.5 py-0.5 text-[10px] text-[var(--pg-muted)] opacity-0 transition-opacity hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)] group-hover:opacity-100"
            title="Wrap the selected words in {{ }} (hidden on the question side)"
          >
            {"{{ }}"}
          </button>
        ) : null}
        {kind === "occlusion" && onEditAreas ? (
          <button
            onClick={onEditAreas}
            className="rounded-md border border-[var(--pg-border)] px-1.5 py-0.5 text-[10px] text-[var(--pg-muted)] opacity-0 transition-opacity hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)] group-hover:opacity-100"
            title="Edit the covered areas"
          >
            Edit areas
          </button>
        ) : null}
        <button
          onClick={onDelete}
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--pg-muted)] opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
          title="Delete card"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {kind === "occlusion" ? (
        <div className="flex items-start gap-3">
          {card.imageUrl ? (
            <span className="relative inline-block shrink-0 overflow-hidden rounded-md border border-[var(--pg-border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.imageUrl}
                alt="Occluded diagram"
                className="h-20 w-auto max-w-[160px] object-contain"
              />
              {(card.occlusionRects ?? []).map((r, i) => (
                <span
                  key={i}
                  className="absolute rounded-[2px] bg-[var(--pg-study)]/85"
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.width * 100}%`,
                    height: `${r.height * 100}%`,
                  }}
                />
              ))}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <textarea
              ref={frontRef}
              value={front}
              onChange={(e) => setFront(e.target.value)}
              onBlur={() => front !== card.front && onChange({ front })}
              placeholder="Optional hint shown above the image"
              rows={1}
              className="w-full resize-none bg-transparent text-[13px] leading-snug text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)]"
            />
            <p className="mt-1 text-[11px] text-[var(--pg-muted)]">
              {(card.occlusionRects ?? []).length} covered{" "}
              {(card.occlusionRects ?? []).length === 1 ? "area" : "areas"}
            </p>
          </div>
        </div>
      ) : kind === "cloze" ? (
        <textarea
          ref={frontRef}
          value={front}
          onChange={(e) => setFront(e.target.value)}
          onBlur={() => front !== card.front && onChange({ front })}
          placeholder="Full sentence with the hidden parts in {{double braces}} — e.g. The {{mitochondrion}} produces ATP."
          rows={2}
          className="w-full resize-none bg-transparent text-[13.5px] leading-snug text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)]"
        />
      ) : (
        <>
          <textarea
            ref={frontRef}
            value={front}
            onChange={(e) => setFront(e.target.value)}
            onBlur={() => front !== card.front && onChange({ front })}
            placeholder="Front — the question"
            rows={1}
            className="w-full resize-none bg-transparent text-[13.5px] font-medium leading-snug text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)]"
          />
          <div className="my-1.5 border-t border-dashed border-[var(--pg-border)]" />
          <textarea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            onBlur={() => back !== card.back && onChange({ back })}
            placeholder="Back — the answer"
            rows={1}
            className="w-full resize-none bg-transparent text-[13px] leading-snug text-[var(--pg-fg-soft)] outline-none placeholder:text-[var(--pg-muted)]"
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Exam date control
// ---------------------------------------------------------------------

function ExamDateControl({
  examDate,
  onChange,
}: {
  examDate: number | null;
  onChange: (next: number | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const active = examActive(examDate);
  const daysLeft = active && examDate != null ? examDaysLeft(examDate) : 0;

  const isoValue = examDate
    ? new Date(examDate).toISOString().slice(0, 10)
    : "";

  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={() => inputRef.current?.showPicker?.() ?? inputRef.current?.click()}
        className={
          active
            ? "inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[10.5px] font-medium text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
            : "inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--pg-border)] px-2 py-0.5 text-[10.5px] text-[var(--pg-muted)] hover:border-[var(--pg-border-strong)] hover:text-[var(--pg-fg)]"
        }
        title={
          active
            ? "Reviews are compressed so every card is seen before the exam"
            : "Set an exam date — reviews compress so every card is seen before it"
        }
      >
        <CalendarClock size={10} />
        {active ? `Exam in ${daysLeft}d` : "Exam date"}
      </button>
      {active ? (
        <button
          onClick={() => onChange(null)}
          className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          title="Clear exam date"
        >
          <X size={9} />
        </button>
      ) : null}
      {/* Invisible native date input anchored under the chip; showPicker()
          opens the platform calendar. */}
      <input
        ref={inputRef}
        type="date"
        value={isoValue}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v ? new Date(`${v}T23:59:59`).getTime() : null);
        }}
        className="pointer-events-none absolute left-0 top-full h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden
      />
    </span>
  );
}

// ---------------------------------------------------------------------
// Image-occlusion creation / editing pane
// ---------------------------------------------------------------------

function OcclusionPane({
  editingCard,
  onClose,
  onSave,
}: {
  editingCard: Flashcard | null;
  onClose: () => void;
  onSave: (result: {
    imageUrl: string;
    rects: PdfHighlightRect[];
    hint: string;
  }) => void;
}) {
  const [imageUrl, setImageUrl] = useState(editingCard?.imageUrl ?? "");
  const [urlDraft, setUrlDraft] = useState("");
  const [rects, setRects] = useState<PdfHighlightRect[]>(
    editingCard?.occlusionRects ?? []
  );
  const [hint, setHint] = useState(editingCard?.front ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Pick an image file.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFileToServer(file);
      setImageUrl(uploaded.url);
      setRects([]);
    } catch (err) {
      setError((err as Error).message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-3 rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.14em] text-[var(--pg-muted)]">
          <ImagePlus size={11} />
          {editingCard ? "Edit covered areas" : "Image occlusion"}
        </span>
        <button
          onClick={onClose}
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          title="Close"
        >
          <X size={12} />
        </button>
      </div>

      {!imageUrl ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="Paste an image URL…"
            className="min-w-[180px] flex-1 rounded-[var(--pg-radius-md)] border border-[var(--pg-border)] bg-[var(--pg-bg)] px-2.5 py-1.5 text-[12px] text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)] focus:border-[var(--pg-border-strong)]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && urlDraft.trim()) {
                setImageUrl(urlDraft.trim());
                setRects([]);
              }
            }}
          />
          <button
            onClick={() => {
              if (urlDraft.trim()) {
                setImageUrl(urlDraft.trim());
                setRects([]);
              }
            }}
            disabled={!urlDraft.trim()}
            className="rounded-[var(--pg-radius-md)] border border-[var(--pg-border-strong)] px-3 py-1.5 text-[12px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)] disabled:opacity-40"
          >
            Use URL
          </button>
          <span className="text-[11px] text-[var(--pg-muted)]">or</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-[var(--pg-radius-md)] border border-[var(--pg-border-strong)] px-3 py-1.5 text-[12px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)] disabled:opacity-40"
          >
            {uploading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Upload size={12} />
            )}
            Upload image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          <ImageOcclusionEditor
            imageUrl={imageUrl}
            rects={rects}
            onChange={setRects}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="Optional hint, e.g. “Label the organelles”"
              className="min-w-[180px] flex-1 rounded-[var(--pg-radius-md)] border border-[var(--pg-border)] bg-[var(--pg-bg)] px-2.5 py-1.5 text-[12px] text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)] focus:border-[var(--pg-border-strong)]"
            />
            <button
              onClick={() => {
                setImageUrl("");
                setRects([]);
              }}
              className="rounded-[var(--pg-radius-md)] border border-[var(--pg-border)] px-3 py-1.5 text-[12px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            >
              Change image
            </button>
            <button
              onClick={() => onSave({ imageUrl, rects, hint: hint.trim() })}
              disabled={rects.length === 0}
              className="inline-flex items-center gap-1.5 rounded-[var(--pg-radius-md)] bg-[var(--pg-study)] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--pg-study)_88%,black)] disabled:cursor-not-allowed disabled:opacity-40"
              title={rects.length === 0 ? "Cover at least one area first" : undefined}
            >
              <Check size={12} />
              {editingCard ? "Save changes" : "Add card"}
            </button>
          </div>
        </div>
      )}
      {error ? <p className="mt-2 text-[11.5px] text-red-500">{error}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------
// AI generation pane
// ---------------------------------------------------------------------

const COUNT_OPTIONS = [8, 12, 20] as const;

function GeneratePane({
  node,
  onClose,
  onGenerated,
}: {
  node: CanvasNode;
  onClose: () => void;
  onGenerated: (
    cards: GeneratedCardDraft[],
    sourceNodeId: string | null
  ) => void;
}) {
  const nodes = useStore((s) => s.nodes);
  const [sources, setSources] = useState<AiSourceRef[]>([]);
  const [count, setCount] = useState<number>(12);
  const [guidance, setGuidance] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addSourceBtnRef = useRef<HTMLButtonElement>(null);

  const excludeKeys = useMemo(
    () => new Set(sources.map((s) => `${s.nodeId}:${s.highlightId ?? s.nodeId}`)),
    [sources]
  );

  const onPickSource = async (row: SourceRow) => {
    setPickerOpen(false);
    setAttaching(true);
    try {
      const sourceNode = nodes.find((n) => n.id === row.sourceNodeId) ?? null;
      const draft = await rowToSourceRefAsync(row, sourceNode);
      if (!draft.excerpt.trim()) {
        setError("Couldn't extract text from that source.");
        return;
      }
      setSources((prev) => [
        ...prev,
        { sid: `s${prev.length + 1}`, ...draft },
      ]);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Failed to attach source");
    } finally {
      setAttaching(false);
    }
  };

  const generate = async () => {
    if (sources.length === 0 || generating) return;
    const settings = readAiSettings();
    if (!hasAiCredentials(settings)) {
      window.dispatchEvent(new CustomEvent(AI_SETTINGS_DIALOG_EVENT));
      return;
    }
    setGenerating(true);
    setError(null);
    const restamped = sources.map((s, i) => ({ ...s, sid: `s${i + 1}` }));
    const result = await generateCardsFromSources(
      restamped,
      count,
      guidance,
      settings
    );
    setGenerating(false);
    if (!result.ok) {
      setError(result.details ? `${result.error} — ${result.details}` : result.error);
      return;
    }
    onGenerated(
      result.cards,
      sources.length === 1 ? sources[0].nodeId : null
    );
  };

  return (
    <div className="mt-3 rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.14em] text-[var(--pg-muted)]">
          <Sparkles size={11} />
          Sources
        </span>
        {sources.map((s) => (
          <span
            key={s.sid}
            className="inline-flex max-w-[200px] items-center gap-1 rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg)] px-2 py-0.5 text-[11px] text-[var(--pg-fg-soft)]"
            title={s.label}
          >
            <span className="truncate">{s.label}</span>
            {s.locator ? (
              <span className="text-[var(--pg-muted)]">· {s.locator}</span>
            ) : null}
            <button
              onClick={() =>
                setSources((prev) => prev.filter((x) => x.sid !== s.sid))
              }
              className="text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <button
          ref={addSourceBtnRef}
          onClick={() => setPickerOpen(true)}
          disabled={attaching}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--pg-border)] px-2 py-0.5 text-[11px] text-[var(--pg-muted)] hover:border-[var(--pg-border-strong)] hover:text-[var(--pg-fg)]"
        >
          {attaching ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <Plus size={10} />
          )}
          Add
        </button>
        <button
          onClick={onClose}
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          title="Close"
        >
          <X size={12} />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-[var(--pg-radius-md)] border border-[var(--pg-border)]">
          {COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={
                count === n
                  ? "bg-[var(--pg-bg-elevated)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--pg-fg)]"
                  : "px-2.5 py-1 text-[11.5px] text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
              }
            >
              {n}
            </button>
          ))}
        </div>
        <input
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          placeholder="Optional focus, e.g. “only definitions” or “chapter 3”"
          className="min-w-[180px] flex-1 rounded-[var(--pg-radius-md)] border border-[var(--pg-border)] bg-[var(--pg-bg)] px-2.5 py-1.5 text-[12px] text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)] focus:border-[var(--pg-border-strong)]"
          onKeyDown={(e) => {
            if (e.key === "Enter") generate();
          }}
        />
        <button
          onClick={generate}
          disabled={sources.length === 0 || generating || attaching}
          className="inline-flex items-center gap-1.5 rounded-[var(--pg-radius-md)] bg-[var(--pg-study)] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--pg-study)_88%,black)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {generating ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Sparkles size={12} />
          )}
          {generating ? "Generating…" : `Generate ${count} cards`}
        </button>
      </div>

      {sources.length === 0 ? (
        <p className="mt-2 text-[11.5px] text-[var(--pg-muted)]">
          Attach a PDF, article, page, or highlight — the AI writes cards only
          from what&apos;s in your sources.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-[11.5px] text-red-500">{error}</p>
      ) : null}

      <SourcePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onPickSource}
        anchorRef={addSourceBtnRef}
        workspaceId={node.workspaceId}
        excludeNodeId={node.id}
        excludeKeys={excludeKeys}
        placeholder="Search sources to study…"
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Study view
// ---------------------------------------------------------------------

const GRADES = GRADE_BUTTONS;

function StudyView({
  nodeId,
  cards,
  examDate,
  setCards,
  onExit,
}: {
  nodeId: string;
  cards: Flashcard[];
  examDate: number | null;
  setCards: (next: Flashcard[]) => void;
  onExit: () => void;
}) {
  // Session queue snapshot: ids of cards due when the session started.
  // "Again" re-queues the id at the back so lapsed cards get re-drilled
  // before the session ends. Cards deleted mid-session (from another
  // panel) are filtered out at render time rather than via an effect.
  const [queue, setQueue] = useState<string[]>(() =>
    dueCards(cards).map((c) => c.id)
  );
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(queue.length);
  const recordStudyDay = useStore((s) => s.recordStudyDay);

  const liveQueue = useMemo(
    () => queue.filter((id) => cards.some((c) => c.id === id)),
    [queue, cards]
  );
  const current =
    liveQueue.length > 0 ? cards.find((c) => c.id === liveQueue[0]) : undefined;

  const grade = useCallback(
    (g: FlashcardGrade) => {
      if (!current) return;
      const graded = gradeCard(current, g, Date.now(), { examDate });
      setCards(cards.map((c) => (c.id === current.id ? graded : c)));
      setQueue((q) => {
        const rest = q.filter((id) => id !== current.id);
        // Lapsed cards come back within the session for a re-drill.
        if (g === "again") return [...rest, current.id];
        return rest;
      });
      if (g === "again") setSessionTotal((n) => n + 1);
      setReviewed((n) => n + 1);
      setFlipped(false);
      recordStudyDay();
    },
    [current, cards, setCards, recordStudyDay, examDate]
  );

  // Projected next interval per grade, shown under the buttons once the
  // card is flipped. Deterministic (no fuzz) so labels don't jitter.
  const previews = useMemo(
    () =>
      current && flipped ? previewIntervalsNow(current, { examDate }) : null,
    [current, flipped, examDate]
  );

  // Keyboard: Space/Enter flips, 1–4 grades, Esc handled by PanelManager.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      if (!flipped) return;
      const match = GRADES.find((g) => g.key === e.key);
      if (match) {
        e.preventDefault();
        grade(match.grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, grade]);

  if (!current) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <Check size={28} className="text-emerald-500" />
        <div className="pg-serif text-[20px] font-semibold text-[var(--pg-fg)]">
          Session complete
        </div>
        <div className="text-[13px] text-[var(--pg-muted)]">
          {reviewed} {reviewed === 1 ? "review" : "reviews"} done.
          {nextDueLabel(cards) ? ` Next card due ${nextDueLabel(cards)}.` : ""}
        </div>
        <button
          onClick={onExit}
          className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--pg-radius-md)] border border-[var(--pg-border-strong)] px-3 py-1.5 text-[12.5px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
        >
          <ArrowLeft size={13} />
          Back to deck
        </button>
      </div>
    );
  }

  const progress = sessionTotal ? Math.min(1, reviewed / sessionTotal) : 0;

  return (
    <div className="flex flex-1 min-h-0 flex-col" key={nodeId}>
      <div className="shrink-0 px-6 pt-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          >
            <ArrowLeft size={12} />
            Deck
          </button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--pg-bg-subtle)]">
            <div
              className="h-full rounded-full bg-[var(--pg-study)] transition-[width] duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span className="text-[11.5px] tabular-nums text-[var(--pg-muted)]">
            {liveQueue.length} left
          </span>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 items-center justify-center px-8 py-6">
        <button
          onClick={() => setFlipped((f) => !f)}
          className="flex max-h-full w-full max-w-xl flex-col items-center justify-center gap-4 rounded-[var(--pg-radius-xl)] border border-[var(--pg-border)] bg-[var(--pg-bg)] px-8 py-10 text-center shadow-[var(--pg-shadow)] transition-shadow hover:shadow-lg"
        >
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--pg-muted)]">
            {flipped ? "Answer" : "Question"}
          </span>
          <span className="pg-serif overflow-y-auto whitespace-pre-wrap text-[19px] font-medium leading-relaxed text-[var(--pg-fg)]">
            <CardFace card={current} side={flipped ? "answer" : "question"} />
          </span>
          {!flipped ? (
            <span className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-[var(--pg-muted)]">
              <RotateCcw size={11} />
              Click or press Space to reveal
            </span>
          ) : null}
        </button>
      </div>

      <div className="shrink-0 px-6 pb-6">
        {flipped ? (
          <div className="mx-auto flex max-w-xl items-center justify-center gap-2">
            {GRADES.map((g) => (
              <button
                key={g.grade}
                onClick={() => grade(g.grade)}
                className={`flex-1 rounded-[var(--pg-radius-md)] border bg-[var(--pg-bg)] px-3 py-2 text-[12.5px] font-medium transition-colors ${g.className}`}
              >
                <span className="flex flex-col items-center gap-0.5">
                  <span>
                    {g.label}
                    <span className="ml-1.5 rounded bg-[var(--pg-bg-subtle)] px-1 text-[10px] text-[var(--pg-muted)]">
                      {g.key}
                    </span>
                  </span>
                  {previews ? (
                    <span className="text-[10px] font-normal tabular-nums text-[var(--pg-muted)]">
                      {previews[g.grade]}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center text-[11.5px] text-[var(--pg-muted)]">
            Space to flip · 1–4 to grade
          </div>
        )}
      </div>
    </div>
  );
}
