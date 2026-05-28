"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useStore } from "@/lib/store";
import { hasAiCredentials, readAiSettings } from "@/lib/ai-settings";
import { sendAiRequest } from "@/lib/ai-client";
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
import { SourcePicker } from "@/components/viewers/SourcePicker";
import { usePendingHighlightJump } from "@/lib/hooks/use-pending-highlight-jump";
import { attachmentsForWire } from "@/lib/ai-attachments";
import { AiComposer } from "./ai/AiComposer";
import { AiTurn as AiTurnView, AiEmptyState } from "./ai/AiTurn";
import {
  AiHeader,
  AiSourcesStrip,
  ERROR_SENTINEL_PREFIX,
  EXTRACTING_SENTINEL,
} from "./ai/AiSourcesStrip";

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
  // sets `pendingHighlightJumps[nodeId]` to the turn id; the handler
  // finds the turn's DOM element, scrolls it into view, flashes a brief
  // selection ring, and consumes the request so it doesn't fire again.
  const tryJumpToTurn = useCallback(
    (turnId: string) => {
      // Wait a frame so the turn elements have laid out before
      // scrolling; otherwise scrollIntoView lands on a half-rendered
      // node and the offset is wrong.
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(
          `[data-ai-turn-id="${turnId}"]`
        );
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedTurnId(turnId);
        consumePendingHighlightJump(nodeId);
      });
    },
    [nodeId, consumePendingHighlightJump]
  );
  usePendingHighlightJump(nodeId, tryJumpToTurn);

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

        // Dispatch via sendAiRequest, which picks the transport: the
        // hosted /api/ai full path for the web build, or the Electron
        // main-process IPC path for the packaged app. The packaged app
        // requires the IPC path when the configured base URL is a
        // corp/private host (e.g. *.stingray-private.com) that the
        // Vercel function can't reach.
        const result = await sendAiRequest(
          {
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
          },
          readAiSettings()
        );

        if (!result.ok) {
          const message =
            (result.error.error ?? "AI request failed") +
            (result.error.details ? ` — ${result.error.details}` : "");
          updateAiTurn(nodeId, assistantTurn.id, {
            status: "error",
            error: message,
          });
          return;
        }

        updateAiTurn(nodeId, assistantTurn.id, {
          status: "idle",
          text: result.payload.answer ?? "",
          provenance: (result.payload.provenance as AiProvenance) ?? null,
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
      <AiHeader title={d.title} onTitleChange={onTitleChange} />

      <AiSourcesStrip
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
          <AiEmptyState />
        ) : (
          <div className="mx-auto max-w-3xl px-6 pt-2 pb-6">
            {d.turns.map((turn, i) => (
              <AiTurnView
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

      <AiComposer
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
