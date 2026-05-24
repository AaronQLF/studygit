"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { nanoid } from "nanoid";
import {
  FileText,
  ImagePlus,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  AI_SETTINGS_DIALOG_EVENT,
  aiRequestHeaders,
  hasAiCredentials,
  readAiSettings,
} from "@/lib/ai-settings";
import {
  rowToSourceRef,
  rowToSourceRefAsync,
  type SourceRow,
} from "@/lib/source-rows";
import type {
  AiAnswerNodeData,
  AiAttachment,
  AiProvenance,
  AiSourceRef,
  AiTurn,
  CanvasNode,
} from "@/lib/types";
import { EditableTitle } from "../nodes/EditableTitle";
import { SourcePicker } from "../SourcePicker";

// Conversation node panel: title + sticky sources strip + scrolling thread
// of user/assistant turns + composer. Each assistant turn renders the
// server-emitted HTML (with <citation> pills that click-jump to the
// source) and a small provenance line.

export function AiAnswerPanelBody({ node }: { node: CanvasNode }) {
  const d = node.data as AiAnswerNodeData;
  const nodeId = node.id;
  const updateNodeData = useStore((s) => s.updateNodeData);
  const appendAiTurn = useStore((s) => s.appendAiTurn);
  const updateAiTurn = useStore((s) => s.updateAiTurn);
  const removeAiTurn = useStore((s) => s.removeAiTurn);

  const consumePendingHighlightJump = useStore(
    (s) => s.consumePendingHighlightJump
  );

  const [composer, setComposer] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<AiAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [credsMissing, setCredsMissing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // sid of the chip whose mode-swap popover is currently open, or null.
  // The popover reuses SourcePicker with `restrictToNodeId` so only rows
  // for the same underlying source node appear.
  const [swapForSid, setSwapForSid] = useState<string | null>(null);
  // Briefly highlight a turn after a citation pill click lands us on
  // it. Cleared by a timer so the panel doesn't permanently mark a turn
  // as "selected".
  const [highlightedTurnId, setHighlightedTurnId] = useState<string | null>(
    null
  );
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const swapAnchorRef = useRef<HTMLElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the thread to the bottom whenever a turn is added or a
  // running turn finishes. Keeping the cursor at the latest exchange is
  // table stakes for chat UX.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // Defer to the next frame so the new turn has been laid out before
    // we measure scrollHeight.
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [d.turns]);

  // Honor citation-pill click-jumps that target a specific assistant
  // turn inside this conversation. The pill click (anywhere in the app)
  // sets `pendingHighlightJumps[nodeId]` to the turn id; this effect
  // finds the turn's DOM element, scrolls it into view, flashes a brief
  // selection ring, and consumes the request so it doesn't fire again.
  useEffect(() => {
    const tryJump = (turnId: string) => {
      const el = document.querySelector<HTMLElement>(
        `[data-ai-turn-id="${turnId}"]`
      );
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedTurnId(turnId);
      consumePendingHighlightJump(nodeId);
      return true;
    };

    // Honor any jump request that was already pending when the panel
    // mounted (e.g. the user clicked a citation pill in another panel
    // before this one was open).
    const initial = useStore.getState().pendingHighlightJumps[nodeId];
    if (initial) {
      // Wait a frame so the turn elements have laid out before
      // scrolling; otherwise scrollIntoView lands on a half-rendered
      // node and the offset is wrong.
      requestAnimationFrame(() => tryJump(initial));
    }

    const unsub = useStore.subscribe((state, prev) => {
      const next = state.pendingHighlightJumps[nodeId] ?? null;
      const before = prev.pendingHighlightJumps[nodeId] ?? null;
      if (!next || next === before) return;
      requestAnimationFrame(() => tryJump(next));
    });
    return unsub;
  }, [nodeId, consumePendingHighlightJump]);

  // Clear the "I just jumped here" highlight after a moment so the
  // turn doesn't stay visually selected forever.
  useEffect(() => {
    if (!highlightedTurnId) return;
    const t = setTimeout(() => setHighlightedTurnId(null), 1800);
    return () => clearTimeout(t);
  }, [highlightedTurnId]);

  const onTitleChange = (next: string) =>
    updateNodeData(nodeId, { title: next } as Partial<AiAnswerNodeData>);

  const excludeKeys = useMemo(() => {
    const set = new Set<string>();
    for (const s of d.sources) {
      set.add(`${s.nodeId}:${s.highlightId ?? s.nodeId}`);
    }
    return set;
  }, [d.sources]);

  const removeSource = (sid: string) => {
    updateNodeData(nodeId, {
      sources: d.sources.filter((s) => s.sid !== sid),
    } as Partial<AiAnswerNodeData>);
  };

  // Replace the source identified by `sid` with one derived from the
  // given row, keeping the sid stable so any in-flight assistant turn's
  // citation pills (and the conversation's overall provenance) keep
  // making sense.
  const swapSourceMode = (sid: string, row: SourceRow) => {
    const sourceNode =
      useStore.getState().nodes.find((n) => n.id === row.sourceNodeId) ?? null;
    const placeholder = rowToSourceRef(row, sourceNode);

    if (row.kind === "pdf-whole") {
      // Optimistically show the "extracting…" state on the same chip,
      // then swap in the real ref when pdf.js finishes.
      const fresh = useStore.getState().nodes.find((n) => n.id === nodeId);
      if (!fresh || fresh.data.kind !== "ai") return;
      const data = fresh.data as AiAnswerNodeData;
      updateNodeData(nodeId, {
        sources: data.sources.map((s) =>
          s.sid === sid
            ? {
                ...placeholder,
                sid,
                excerpt: EXTRACTING_SENTINEL,
              }
            : s
        ),
      } as Partial<AiAnswerNodeData>);
      void rowToSourceRefAsync(row, sourceNode)
        .then((finalRef) => {
          const live = useStore.getState().nodes.find((n) => n.id === nodeId);
          if (!live || live.data.kind !== "ai") return;
          updateNodeData(nodeId, {
            sources: (live.data as AiAnswerNodeData).sources.map((s) =>
              s.sid === sid ? { ...finalRef, sid } : s
            ),
          } as Partial<AiAnswerNodeData>);
        })
        .catch((err: Error) => {
          const live = useStore.getState().nodes.find((n) => n.id === nodeId);
          if (!live || live.data.kind !== "ai") return;
          updateNodeData(nodeId, {
            sources: (live.data as AiAnswerNodeData).sources.map((s) =>
              s.sid === sid
                ? { ...s, excerpt: `${ERROR_SENTINEL_PREFIX}${err.message}` }
                : s
            ),
          } as Partial<AiAnswerNodeData>);
        });
      return;
    }

    updateNodeData(nodeId, {
      sources: d.sources.map((s) =>
        s.sid === sid ? { ...placeholder, sid } : s
      ),
    } as Partial<AiAnswerNodeData>);
  };

  const openSwapPopover = (sid: string, anchor: HTMLElement) => {
    if (swapForSid === sid) {
      setSwapForSid(null);
      return;
    }
    swapAnchorRef.current = anchor;
    setSwapForSid(sid);
  };

  // The currently-attached row for the chip being swapped — used to hide
  // it from the popover so the picker only shows *other* modes.
  const swapTargetSource = swapForSid
    ? d.sources.find((s) => s.sid === swapForSid) ?? null
    : null;
  const swapExcludeKeys = useMemo(() => {
    if (!swapTargetSource) return undefined;
    const set = new Set<string>();
    set.add(
      `${swapTargetSource.nodeId}:${
        swapTargetSource.highlightId ?? swapTargetSource.nodeId
      }`
    );
    return set;
  }, [swapTargetSource]);

  // The model's view of sources only needs to be stable within one turn,
  // but we keep the sid stamped on the source itself so the citation
  // pills the model emits stay resolvable later. Re-stamp the sources to
  // s1..sN at send time so we always start clean.
  const restampSources = useCallback((): AiSourceRef[] => {
    const restamped = d.sources.map((s, i) => ({ ...s, sid: `s${i + 1}` }));
    if (restamped.some((s, i) => s.sid !== d.sources[i].sid)) {
      updateNodeData(nodeId, {
        sources: restamped,
      } as Partial<AiAnswerNodeData>);
    }
    return restamped;
  }, [d.sources, nodeId, updateNodeData]);

  // Send a new user message. The thread becomes:
  //   ...prior turns, { user: text, attachments? }, { assistant: status=running }
  // We persist both before kicking off the fetch so the panel reflects
  // the in-flight state if the user closes / reopens it mid-call.
  const send = useCallback(
    async (text: string, attachments: AiAttachment[] = []) => {
      const promptText = text.trim();
      // Allow image-only messages — the model can describe / answer
      // questions about the attached image on its own.
      if (!promptText && attachments.length === 0) return;

      if (!hasAiCredentials()) {
        setCredsMissing(true);
        return;
      }
      setCredsMissing(false);

      // Defensively drop sources that never finished extracting (the
      // user pressed Enter before pdf.js was done, or extraction errored
      // and they're sending anyway). The error/extracting chip stays
      // attached so the user can decide whether to retry or remove it,
      // but it's a no-op for this particular send.
      const sources = restampSources().filter(
        (s) =>
          s.excerpt !== EXTRACTING_SENTINEL &&
          !s.excerpt.startsWith(ERROR_SENTINEL_PREFIX)
      );
      const userTurn: AiTurn = {
        id: nanoid(8),
        role: "user",
        text: promptText,
        createdAt: Date.now(),
        attachments: attachments.length > 0 ? attachments : undefined,
      };
      const assistantTurn: AiTurn = {
        id: nanoid(8),
        role: "assistant",
        text: "",
        createdAt: Date.now(),
        status: "running",
      };

      appendAiTurn(nodeId, userTurn);
      appendAiTurn(nodeId, assistantTurn);
      setComposer("");
      setPendingAttachments([]);
      setAttachmentError(null);

      // First turn? Auto-derive a title from the prompt — saves a click
      // and gives the canvas card a real label. Untouched once the user
      // has customized it (anything other than the default placeholder).
      if (d.turns.length === 0 && (!d.title || d.title === "Ask AI")) {
        const seed =
          promptText ||
          (attachments.length > 0
            ? `Image (${attachments.length})`
            : "Untitled");
        updateNodeData(nodeId, {
          title: seed.length > 60 ? `${seed.slice(0, 60)}…` : seed,
        } as Partial<AiAnswerNodeData>);
      }

      try {
        // Re-send full history so the model sees the prior context. We
        // pass attachments only for user turns; assistant attachments
        // never exist. Re-feeding images on every turn keeps the
        // model's visual context intact across multi-turn questions.
        const history = [
          ...d.turns
            .filter(
              (t) =>
                t.role === "user" ||
                (t.text && t.status !== "error")
            )
            .map((t) => ({
              role: t.role,
              text: t.text,
              attachments:
                t.role === "user" ? attachmentsForWire(t.attachments) : undefined,
            })),
          {
            role: "user" as const,
            text: promptText,
            attachments: attachmentsForWire(attachments),
          },
        ];

        const response = await fetch("/api/ai", {
          method: "POST",
          headers: aiRequestHeaders(readAiSettings()),
          body: JSON.stringify({
            messages: history,
            sources: sources.map((s) => ({
              sid: s.sid,
              label: s.label,
              locator: s.locator,
              excerpt: s.excerpt,
              nodeId: s.nodeId,
              highlightId: s.highlightId,
              page: s.page,
            })),
          }),
        });

        if (!response.ok) {
          const errPayload = (await response.json().catch(() => null)) as
            | { error?: string; details?: string }
            | null;
          const message =
            (errPayload?.error ?? "AI request failed") +
            (errPayload?.details ? ` — ${errPayload.details}` : "");
          updateAiTurn(nodeId, assistantTurn.id, {
            status: "error",
            error: message,
          });
          return;
        }

        const payload = (await response.json()) as {
          answer: string;
          provenance: AiProvenance;
        };
        updateAiTurn(nodeId, assistantTurn.id, {
          status: "idle",
          text: payload.answer ?? "",
          provenance: payload.provenance ?? null,
          error: undefined,
        });
      } catch (err) {
        updateAiTurn(nodeId, assistantTurn.id, {
          status: "error",
          error: (err as Error)?.message ?? "Network error",
        });
      }
    },
    [
      appendAiTurn,
      d.title,
      d.turns,
      nodeId,
      restampSources,
      updateAiTurn,
      updateNodeData,
    ]
  );

  // Re-run an assistant turn: drop it (and any later turns) and resend
  // the user message immediately above. Same semantics as Claude/ChatGPT's
  // "regenerate" affordance.
  const retryFrom = useCallback(
    (assistantTurnId: string) => {
      const idx = d.turns.findIndex((t) => t.id === assistantTurnId);
      if (idx < 1) return;
      const previous = d.turns[idx - 1];
      if (previous.role !== "user") return;
      // Remove this assistant turn and anything after it.
      const toRemove = d.turns.slice(idx).map((t) => t.id);
      for (const id of toRemove) removeAiTurn(nodeId, id);
      // Also drop the user turn we're about to replay, so send() can
      // re-add it cleanly with a fresh timestamp.
      removeAiTurn(nodeId, previous.id);
      void send(previous.text, previous.attachments ?? []);
    },
    [d.turns, nodeId, removeAiTurn, send]
  );

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--pg-bg)]">
      <Header title={d.title} onTitleChange={onTitleChange} />

      <SourcesStrip
        sources={d.sources}
        onRemove={removeSource}
        onSwap={openSwapPopover}
        onAddClick={() => setPickerOpen((v) => !v)}
        addBtnRef={addBtnRef}
      />

      {/* Per-chip mode swap popover. Anchors to the chip element via
          swapAnchorRef and restricts the row list to the chip's
          underlying source node. Keyed by `swapForSid` so that clicking
          a different chip while the popover is already open remounts the
          picker and forces a fresh anchor measurement. */}
      <SourcePicker
        key={`swap:${swapForSid ?? "closed"}`}
        open={swapForSid !== null}
        onClose={() => setSwapForSid(null)}
        onSelect={(row) => {
          if (!swapForSid) return;
          swapSourceMode(swapForSid, row);
          setSwapForSid(null);
        }}
        anchorRef={swapAnchorRef}
        workspaceId={node.workspaceId}
        excludeNodeId={nodeId}
        excludeKeys={swapExcludeKeys}
        restrictToNodeId={swapTargetSource?.nodeId ?? null}
        placeholder="Switch to another mode…"
        emptyMessage={
          <>
            No other modes for this source.
            <div className="mt-1 text-[11px] text-[var(--pg-muted-soft)]">
              Add more content to the source first (highlight a passage,
              write another reply, etc.) or attach a different node.
            </div>
          </>
        }
      />

      <SourcePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(row) => {
          // Pull the full content from the live store at attach time so
          // whole-node sources (page/note/link/ai) carry their complete
          // text into the conversation, not just the picker preview.
          const sourceNode =
            useStore.getState().nodes.find((n) => n.id === row.sourceNodeId) ??
            null;
          const placeholder = rowToSourceRef(row, sourceNode);
          const tempSid = `s${d.sources.length + 1}`;

          if (row.kind === "pdf-whole") {
            // Optimistically attach a "extracting…" chip, then swap in
            // the real ref once pdf.js finishes. Failure leaves the chip
            // with an error excerpt so the user can retry by re-adding.
            const placeholderRef: AiSourceRef = {
              ...placeholder,
              sid: tempSid,
              // Sentinel excerpt the chip detects to render the spinner
              // state. We strip it at send time if extraction never
              // completes — see send().
              excerpt: "__extracting__",
            };
            updateNodeData(nodeId, {
              sources: [...d.sources, placeholderRef],
            } as Partial<AiAnswerNodeData>);

            void rowToSourceRefAsync(row, sourceNode)
              .then((finalRef) => {
                const fresh = useStore
                  .getState()
                  .nodes.find((n) => n.id === nodeId);
                if (!fresh || fresh.data.kind !== "ai") return;
                const data = fresh.data as AiAnswerNodeData;
                updateNodeData(nodeId, {
                  sources: data.sources.map((s) =>
                    s.sid === tempSid
                      ? { ...finalRef, sid: s.sid }
                      : s
                  ),
                } as Partial<AiAnswerNodeData>);
              })
              .catch((err: Error) => {
                const fresh = useStore
                  .getState()
                  .nodes.find((n) => n.id === nodeId);
                if (!fresh || fresh.data.kind !== "ai") return;
                const data = fresh.data as AiAnswerNodeData;
                updateNodeData(nodeId, {
                  sources: data.sources.map((s) =>
                    s.sid === tempSid
                      ? { ...s, excerpt: `__error__:${err.message}` }
                      : s
                  ),
                } as Partial<AiAnswerNodeData>);
              });
            return;
          }

          updateNodeData(nodeId, {
            sources: [
              ...d.sources,
              { ...placeholder, sid: tempSid },
            ],
          } as Partial<AiAnswerNodeData>);
        }}
        anchorRef={addBtnRef}
        workspaceId={node.workspaceId}
        excludeNodeId={nodeId}
        excludeKeys={excludeKeys}
      />

      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        {d.turns.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mx-auto max-w-3xl px-6 pt-2 pb-6">
            {d.turns.map((turn, i) => (
              <Turn
                key={turn.id}
                turn={turn}
                showRetry={
                  turn.role === "assistant" &&
                  i > 0 &&
                  d.turns[i - 1].role === "user"
                }
                flash={highlightedTurnId === turn.id}
                onRetry={() => retryFrom(turn.id)}
                onDelete={() => removeAiTurn(nodeId, turn.id)}
              />
            ))}
          </div>
        )}
      </div>

      <Composer
        value={composer}
        onChange={setComposer}
        onSend={() => send(composer, pendingAttachments)}
        disabled={
          d.turns.some((t) => t.status === "running") ||
          d.sources.some((s) => s.excerpt === EXTRACTING_SENTINEL)
        }
        credsMissing={credsMissing}
        attachments={pendingAttachments}
        onAttachmentsChange={setPendingAttachments}
        attachmentError={attachmentError}
        setAttachmentError={setAttachmentError}
      />
    </section>
  );
}

function Header({
  title,
  onTitleChange,
}: {
  title: string;
  onTitleChange: (next: string) => void;
}) {
  // Header is just the title. The exchange count used to live here but
  // it shifted with every send/receive and made the top of the panel feel
  // chatty; the canvas card already surfaces that metadata at a glance.
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-5 pb-2 shrink-0">
      <EditableTitle
        value={title}
        onChange={onTitleChange}
        placeholder="Untitled conversation"
        className="pg-page-title font-semibold text-[var(--pg-fg)]"
      />
    </div>
  );
}

function SourcesStrip({
  sources,
  onRemove,
  onSwap,
  onAddClick,
  addBtnRef,
}: {
  sources: AiSourceRef[];
  onRemove: (sid: string) => void;
  onSwap: (sid: string, anchor: HTMLElement) => void;
  onAddClick: () => void;
  addBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-4 shrink-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.14em] text-[var(--pg-muted)]">
          <Sparkles size={11} />
          Sources
        </span>
        {sources.map((source) => (
          <SourceChip
            key={source.sid}
            source={source}
            onRemove={() => onRemove(source.sid)}
            onSwap={(anchor) => onSwap(source.sid, anchor)}
          />
        ))}
        <button
          ref={addBtnRef}
          type="button"
          onClick={onAddClick}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--pg-border)] px-2 py-0.5 text-[11px] text-[var(--pg-muted)] hover:border-[var(--pg-border-strong)] hover:text-[var(--pg-fg)]"
        >
          <Plus size={10} /> Add
        </button>
        {sources.length === 0 ? (
          <span className="text-[11px] text-[var(--pg-muted)]">
            ungrounded without sources
          </span>
        ) : null}
      </div>
    </div>
  );
}

// Sentinel excerpts used by the optimistic whole-PDF attach path. The
// chip reads them to render the right state without us having to plumb a
// separate "status" field through AiSourceRef.
const EXTRACTING_SENTINEL = "__extracting__";
const ERROR_SENTINEL_PREFIX = "__error__:";

function chipState(source: AiSourceRef): "extracting" | "error" | "ready" {
  if (source.excerpt === EXTRACTING_SENTINEL) return "extracting";
  if (source.excerpt.startsWith(ERROR_SENTINEL_PREFIX)) return "error";
  return "ready";
}

function SourceChip({
  source,
  onRemove,
  onSwap,
}: {
  source: AiSourceRef;
  onRemove: () => void;
  // Click anywhere on the chip body (not the remove button) opens a
  // popover that lets the user switch this source between whole/highlight
  // modes for the same underlying node.
  onSwap: (anchor: HTMLElement) => void;
}) {
  const Icon =
    source.page != null
      ? FileText
      : source.highlightId == null
      ? Sparkles
      : Link2;
  const state = chipState(source);
  const title =
    state === "ready"
      ? `${source.excerpt}\n\nClick to switch between whole / highlight modes`
      : state === "extracting"
      ? "Extracting PDF text…"
      : source.excerpt.slice(ERROR_SENTINEL_PREFIX.length) ||
        "Failed to extract PDF";

  return (
    <span
      className={clsx(
        "group inline-flex max-w-[240px] items-center gap-1 rounded-full border pl-2 pr-1 py-0 text-[11px]",
        state === "ready"
          ? "border-[var(--pg-border)] text-[var(--pg-fg-soft)]"
          : state === "extracting"
          ? "border-[var(--pg-border)] text-[var(--pg-muted)]"
          : "border-red-500/40 text-red-500"
      )}
      title={title}
    >
      <button
        type="button"
        onClick={(e) => {
          if (state !== "ready") return;
          onSwap(e.currentTarget.parentElement as HTMLElement);
        }}
        disabled={state !== "ready"}
        className={clsx(
          "inline-flex max-w-[200px] items-center gap-1 py-0.5 text-left",
          state === "ready" && "cursor-pointer hover:text-[var(--pg-fg)]"
        )}
      >
        {state === "extracting" ? (
          <Loader2
            size={10}
            className="shrink-0 animate-spin text-[var(--pg-muted)]"
            aria-hidden
          />
        ) : state === "error" ? (
          <TriangleAlert size={10} className="shrink-0" aria-hidden />
        ) : (
          <Icon size={10} className="shrink-0 text-[var(--pg-muted)]" aria-hidden />
        )}
        <span className="truncate">{source.label}</span>
        {source.locator && state === "ready" ? (
          <span className="shrink-0 font-mono text-[9.5px] text-[var(--pg-muted)]">
            {source.locator}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] text-[var(--pg-muted)] opacity-0 transition-opacity hover:text-[var(--pg-fg)] group-hover:opacity-100"
        title="Remove source"
      >
        <X size={9} />
      </button>
    </span>
  );
}

function EmptyState() {
  // Intentionally minimal — matches the rest of the app, where empty
  // panels show a one-liner rather than a full-screen splash. Keeps the
  // visual weight balanced with the composer below it.
  return (
    <div className="mx-auto max-w-3xl px-6 pt-3 pb-6">
      <div className="text-[12.5px] leading-relaxed text-[var(--pg-muted)]">
        Attach sources above and ask anything. Every citation will jump
        back to the highlight it came from.
      </div>
    </div>
  );
}

function Turn({
  turn,
  showRetry,
  flash,
  onRetry,
  onDelete,
}: {
  turn: AiTurn;
  showRetry: boolean;
  // When true, render a brief selection ring so the user can see which
  // turn was just jumped to from a citation pill click.
  flash: boolean;
  onRetry: () => void;
  onDelete: () => void;
}) {
  if (turn.role === "user") {
    // Document-style user turn: a small "You" caption, then any image
    // attachments tiled above the question text, indented with a thin
    // accent rail on the left. Mirrors the Notion quote/callout look —
    // no bubble, no background change.
    const attachments = turn.attachments ?? [];
    return (
      <div
        data-ai-turn-id={turn.id}
        className={clsx(
          "group relative mb-5 pl-3 transition-colors duration-300",
          flash &&
            "rounded-md ring-2 ring-[var(--pg-accent)] ring-offset-2 ring-offset-[var(--pg-bg)]"
        )}
      >
        <span className="absolute inset-y-0.5 left-0 w-[2px] rounded-full bg-[var(--pg-accent)] opacity-60" />
        <div className="mb-0.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-[var(--pg-muted)]">
          <span>You</span>
          {attachments.length > 0 ? (
            <span className="normal-case tracking-normal text-[var(--pg-muted-soft)]">
              · {attachments.length} image{attachments.length === 1 ? "" : "s"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto inline-flex h-4 w-4 items-center justify-center rounded text-[var(--pg-muted)] opacity-0 transition-opacity hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)] group-hover:opacity-100"
            title="Delete message"
          >
            <Trash2 size={10} />
          </button>
        </div>
        {attachments.length > 0 ? (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {attachments.map((att, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${turn.id}-att-${i}`}
                src={att.dataUrl}
                alt={att.name ?? "attached image"}
                className="max-h-[220px] max-w-full rounded-md border border-[var(--pg-border)] object-contain"
              />
            ))}
          </div>
        ) : null}
        {turn.text ? (
          <div className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[var(--pg-fg)]">
            {turn.text}
          </div>
        ) : null}
      </div>
    );
  }

  // Assistant turn — also document-style. Small caption with the model
  // name, then prose flowing directly on the panel surface. No card, no
  // shadow, no bubble; the citation pills supply their own visual
  // accent so the prose itself can stay minimal.
  return (
    <div
      data-ai-turn-id={turn.id}
      className={clsx(
        "group mb-6 rounded-md transition-shadow duration-300",
        flash &&
          "ring-2 ring-[var(--pg-accent)] ring-offset-2 ring-offset-[var(--pg-bg)]"
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[10.5px] uppercase tracking-[0.12em] text-[var(--pg-muted)]">
        <Sparkles size={10} />
        <span>AI</span>
        {turn.provenance ? (
          <span className="font-mono text-[10px] normal-case tracking-normal text-[var(--pg-muted)]">
            {turn.provenance.model}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {showRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10.5px] normal-case tracking-normal text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]"
              title="Re-run this answer"
            >
              <RefreshCw size={10} />
              Re-run
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-4 w-4 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]"
            title="Delete reply"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      <AssistantBody turn={turn} />

      {turn.provenance ? (
        <ProvenanceLine provenance={turn.provenance} />
      ) : null}
    </div>
  );
}

function AssistantBody({ turn }: { turn: AiTurn }) {
  if (turn.status === "running") {
    return (
      <div className="inline-flex items-center gap-2 text-[13px] text-[var(--pg-muted)]">
        <Loader2 size={12} className="animate-spin" />
        Thinking…
      </div>
    );
  }
  if (turn.status === "error") {
    return (
      <div className="flex items-start gap-2 rounded border-l-2 border-red-500/60 bg-transparent px-3 py-1 text-[12.5px] text-red-600 dark:text-red-400">
        <TriangleAlert size={12} className="mt-0.5 shrink-0" />
        <span className="break-words">
          {turn.error ?? "The model didn't return an answer."}
        </span>
      </div>
    );
  }
  return (
    <div
      className="pg-prose text-[14px] leading-relaxed text-[var(--pg-fg)]"
      onClick={onAssistantClick}
      dangerouslySetInnerHTML={{ __html: turn.text }}
    />
  );
}

// Delegated click handler for any citation pill inside an assistant
// turn. We don't mount Tiptap here (~150KB of editor stack would be
// overkill for a read-only surface), so we replicate the pill's click
// behavior with the same store actions the Tiptap node-view uses.
function onAssistantClick(event: React.MouseEvent<HTMLDivElement>) {
  const target = (event.target as HTMLElement | null)?.closest(
    ".pg-citation"
  ) as HTMLElement | null;
  if (!target) return;
  const nodeId = target.getAttribute("data-node-id");
  if (!nodeId) return;
  event.preventDefault();
  event.stopPropagation();
  const highlightId = target.getAttribute("data-highlight-id");
  if (!highlightId) {
    useStore.getState().openPanel(nodeId);
    return;
  }
  useStore.getState().requestHighlightJump(nodeId, highlightId);
}

function ProvenanceLine({ provenance }: { provenance: AiProvenance }) {
  const total = provenance.usage?.total_tokens;
  return (
    <div className="mt-1.5 pl-1 text-[11px] text-[var(--pg-muted)]">
      {provenance.citationsResolved > 0 ? (
        <span title="Citations the model emitted that resolved to a real source">
          {provenance.citationsResolved} cited
        </span>
      ) : null}
      {provenance.citationsDemoted > 0 ? (
        <span
          className="ml-1 text-amber-600 dark:text-amber-400"
          title="Citations kept but marked as possibly misplaced"
        >
          ({provenance.citationsDemoted} weak)
        </span>
      ) : null}
      {provenance.citationsDropped > 0 ? (
        <span
          className="ml-1"
          title="Phantom or unverified citations dropped before render"
        >
          · {provenance.citationsDropped} dropped
        </span>
      ) : null}
      {total != null ? (
        <span className="ml-1" title="Approximate tokens reported by the provider">
          · ~{total.toLocaleString()} tok
        </span>
      ) : null}
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  disabled,
  credsMissing,
  attachments,
  onAttachmentsChange,
  attachmentError,
  setAttachmentError,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  disabled: boolean;
  credsMissing: boolean;
  attachments: AiAttachment[];
  onAttachmentsChange: (next: AiAttachment[]) => void;
  attachmentError: string | null;
  setAttachmentError: (msg: string | null) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [attaching, setAttaching] = useState(false);

  // Auto-resize the textarea up to a generous cap. Keeps single-line
  // questions tight, lets multi-paragraph drafts breathe without
  // requiring an internal scrollbar inside the panel.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(220, el.scrollHeight)}px`;
  }, [value]);

  const canSend = !disabled && (value.trim().length > 0 || attachments.length > 0);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };

  const ingestFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setAttachmentError(null);
      setAttaching(true);
      try {
        const remaining = MAX_ATTACHMENTS - attachments.length;
        if (remaining <= 0) {
          setAttachmentError(
            `Max ${MAX_ATTACHMENTS} images per message — remove one to add another.`
          );
          return;
        }
        const accepted: AiAttachment[] = [];
        for (const file of files.slice(0, remaining)) {
          if (!file.type.startsWith("image/")) continue;
          try {
            const att = await fileToImageAttachment(file);
            accepted.push(att);
          } catch (err) {
            // Surface the first error but keep going so a single bad
            // file doesn't tank the others.
            if (!attachmentError) {
              setAttachmentError(
                `Couldn't attach ${file.name || "image"}: ${
                  (err as Error).message
                }`
              );
            }
          }
        }
        if (accepted.length > 0) {
          onAttachmentsChange([...attachments, ...accepted]);
        }
      } finally {
        setAttaching(false);
      }
    },
    [attachments, attachmentError, onAttachmentsChange, setAttachmentError]
  );

  const onPaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(event.clipboardData.items);
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        event.preventDefault();
        void ingestFiles(imageFiles);
      }
    },
    [ingestFiles]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      const files = Array.from(event.dataTransfer.files ?? []).filter((f) =>
        f.type.startsWith("image/")
      );
      if (files.length > 0) void ingestFiles(files);
    },
    [ingestFiles]
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-5 pt-2 shrink-0">
      {credsMissing ? (
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent(AI_SETTINGS_DIALOG_EVENT))
          }
          className="mb-2 inline-flex h-7 items-center gap-1.5 rounded-[var(--pg-radius)] border border-amber-500/40 px-2.5 text-[12px] text-amber-600 dark:text-amber-400"
        >
          <Settings size={11} />
          Configure an AI provider to send messages
        </button>
      ) : null}
      {attachmentError ? (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-[var(--pg-radius)] border border-red-500/40 px-2.5 py-1 text-[12px] text-red-600 dark:text-red-400">
          <TriangleAlert size={11} />
          {attachmentError}
        </div>
      ) : null}
      <div
        onDragEnter={(event) => {
          if (Array.from(event.dataTransfer.types).includes("Files")) {
            setDragOver(true);
          }
        }}
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer.types).includes("Files")) {
            event.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={(event) => {
          // Only clear when the drag leaves the entire wrapper, not
          // when it crosses into a child.
          if (event.currentTarget === event.target) setDragOver(false);
        }}
        onDrop={onDrop}
        className={clsx(
          "flex flex-col gap-1.5 rounded-[var(--pg-radius)] border bg-transparent p-1 transition-colors",
          dragOver
            ? "border-[var(--pg-accent)] bg-[color-mix(in_srgb,var(--pg-accent)_8%,transparent)]"
            : disabled
            ? "border-[var(--pg-border)]"
            : "border-[var(--pg-border)] focus-within:border-[var(--pg-border-strong)]"
        )}
      >
        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-1 pt-1">
            {attachments.map((att, i) => (
              <AttachmentChip
                key={`${i}-${att.dataUrl.length}`}
                attachment={att}
                onRemove={() =>
                  onAttachmentsChange(attachments.filter((_, j) => j !== i))
                }
              />
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || attaching || attachments.length >= MAX_ATTACHMENTS}
            className={clsx(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--pg-radius)] transition-colors",
              disabled || attaching || attachments.length >= MAX_ATTACHMENTS
                ? "text-[var(--pg-muted)]"
                : "text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]"
            )}
            title={
              attachments.length >= MAX_ATTACHMENTS
                ? `Max ${MAX_ATTACHMENTS} images per message`
                : "Attach image (or paste / drop)"
            }
          >
            {attaching ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ImagePlus size={13} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              void ingestFiles(files);
              // Reset so picking the same file twice in a row still fires.
              event.target.value = "";
            }}
          />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={1}
            placeholder={
              attachments.length > 0
                ? "Ask about these images… (⇧⏎ for newline)"
                : "Ask a follow-up… (⇧⏎ for newline, paste or drop images)"
            }
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] leading-relaxed text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)]"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            className={clsx(
              "inline-flex h-7 w-7 items-center justify-center rounded-[var(--pg-radius)] transition-colors",
              !canSend
                ? "text-[var(--pg-muted)]"
                : "text-[var(--pg-accent)] hover:bg-[var(--pg-bg-subtle)]"
            )}
            title="Send (⏎)"
          >
            {disabled ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: AiAttachment;
  onRemove: () => void;
}) {
  return (
    <div className="group relative inline-flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachment.dataUrl}
        alt={attachment.name ?? "attached image"}
        className="h-12 w-12 rounded-md border border-[var(--pg-border)] object-cover"
      />
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--pg-bg-elevated)] text-[var(--pg-muted)] opacity-0 shadow-[var(--pg-shadow)] transition-opacity hover:text-[var(--pg-fg)] group-hover:opacity-100"
        title="Remove image"
      >
        <X size={9} />
      </button>
    </div>
  );
}

// -- attachment plumbing ------------------------------------------------

const MAX_ATTACHMENTS = 4;
// Cap the longest edge of the resized image. 1568 mirrors Anthropic's
// vision recommendation; OpenAI / OpenRouter accept higher but the
// quality return per byte tails off quickly above this.
const MAX_IMAGE_DIMENSION = 1568;
// Final byte budget after re-encode. 1.5 MB keeps the request body
// reasonable for most providers and well under our server's 6 MB cap.
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

async function fileToImageAttachment(file: File): Promise<AiAttachment> {
  if (!file.type.startsWith("image/")) {
    throw new Error("not an image file");
  }
  // Animated GIFs lose animation when re-encoded via canvas. Keep them
  // as-is if they're already under the byte budget; otherwise reject so
  // we don't silently freeze the first frame.
  if (file.type === "image/gif") {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("GIF too large — must be under 1.5 MB");
    }
    const dataUrl = await readFileAsDataUrl(file);
    return {
      kind: "image",
      dataUrl,
      mimeType: "image/gif",
      name: file.name,
    };
  }

  const bitmap = await loadImageBitmap(file);
  const { width, height } = fitWithin(
    bitmap.width,
    bitmap.height,
    MAX_IMAGE_DIMENSION
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  // Try JPEG first (smaller for photos), fall back to PNG if the source
  // had transparency or JPEG ends up larger.
  const hasAlpha = file.type === "image/png" || file.type === "image/webp";
  const candidates: Array<{ mime: string; quality: number }> = hasAlpha
    ? [
        { mime: "image/webp", quality: 0.85 },
        { mime: "image/png", quality: 1 },
      ]
    : [
        { mime: "image/jpeg", quality: 0.85 },
        { mime: "image/jpeg", quality: 0.7 },
        { mime: "image/jpeg", quality: 0.55 },
      ];

  let best: { dataUrl: string; mime: string; bytes: number } | null = null;
  for (const cand of candidates) {
    const dataUrl = canvas.toDataURL(cand.mime, cand.quality);
    const bytes = approxDataUrlBytes(dataUrl);
    if (!best || bytes < best.bytes) {
      best = { dataUrl, mime: cand.mime, bytes };
    }
    if (bytes <= MAX_IMAGE_BYTES) break;
  }
  if (!best) throw new Error("failed to encode image");
  if (best.bytes > MAX_IMAGE_BYTES) {
    throw new Error("image is too large after compression");
  }
  return {
    kind: "image",
    dataUrl: best.dataUrl,
    mimeType: best.mime,
    name: file.name,
    width: canvas.width,
    height: canvas.height,
  };
}

function loadImageBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap is faster and avoids the load-event dance, but
  // some Safari versions and older Electrons trip on AVIF / HEIF. Fall
  // back to <img> with object URL on failure.
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).catch(() => loadImageElement(file));
  }
  return loadImageElement(file);
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("couldn't decode image"));
    };
    img.src = objectUrl;
  });
}

function fitWithin(
  w: number,
  h: number,
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const ratio = maxEdge / longest;
  return { width: w * ratio, height: h * ratio };
}

function approxDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) return dataUrl.length;
  const base64 = dataUrl.slice(commaIdx + 1);
  // base64 expansion: 4 chars per 3 bytes.
  return Math.floor((base64.length * 3) / 4);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

// Shape the wire payload for /api/ai. We only forward the dataUrl + mime
// — name and dimensions are local UX state, not useful to the model.
function attachmentsForWire(
  atts: AiAttachment[] | undefined
): Array<{ kind: "image"; dataUrl: string; mimeType: string }> | undefined {
  if (!atts || atts.length === 0) return undefined;
  return atts.map((a) => ({
    kind: a.kind,
    dataUrl: a.dataUrl,
    mimeType: a.mimeType,
  }));
}
