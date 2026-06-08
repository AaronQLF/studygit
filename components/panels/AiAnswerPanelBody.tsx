"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { attachSourceRow } from "@/lib/source-attach";
import { useConversation } from "@/lib/hooks/use-conversation";
import { type SourceRow } from "@/lib/source-rows";
import type { AiRequestSource } from "@/lib/ai-request";
import type {
  AiAnswerNodeData,
  AiAttachment,
  AiSourceRef,
  AiTurn,
  CanvasNode,
} from "@/lib/types";
import { SourcePicker } from "@/components/viewers/SourcePicker";
import { usePendingHighlightJump } from "@/lib/hooks/use-pending-highlight-jump";
import { AiComposer } from "./ai/AiComposer";
import { AiTurn as AiTurnView, AiEmptyState } from "./ai/AiTurn";
import {
  AiHeader,
  AiSourcesStrip,
  ERROR_SENTINEL_PREFIX,
  EXTRACTING_SENTINEL,
} from "./ai/AiSourcesStrip";

// Conversation node panel: title + sticky sources strip + scrolling thread
// of user/assistant turns + composer. The send/retry lifecycle and composer
// state live in useConversation (shared with the Study Buddy dock); this
// component supplies the node-backed thread + sources and keeps the bits
// unique to a canvas node (title editing, per-chip mode swap, citation
// click-jump to a specific turn).

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

  const getSendSources = useCallback((): AiRequestSource[] => {
    // Defensively drop sources that never finished extracting (the user
    // pressed Enter before pdf.js was done, or extraction errored). The
    // chip stays attached so they can retry, but it's a no-op this send.
    return restampSources()
      .filter(
        (s) =>
          s.excerpt !== EXTRACTING_SENTINEL &&
          !s.excerpt.startsWith(ERROR_SENTINEL_PREFIX)
      )
      .map((s) => ({
        sid: s.sid,
        label: s.label,
        locator: s.locator,
        excerpt: s.excerpt,
        nodeId: s.nodeId,
        highlightId: s.highlightId,
        page: s.page,
      }));
  }, [restampSources]);

  // First turn? Auto-derive a title from the prompt — saves a click and
  // gives the canvas card a real label. Untouched once the user has
  // customized it (anything other than the default placeholder).
  const onFirstTurn = useCallback(
    (promptText: string, attachments: AiAttachment[]) => {
      if (d.title && d.title !== "Ask AI") return;
      const seed =
        promptText ||
        (attachments.length > 0 ? `Image (${attachments.length})` : "Untitled");
      updateNodeData(nodeId, {
        title: seed.length > 60 ? `${seed.slice(0, 60)}…` : seed,
      } as Partial<AiAnswerNodeData>);
    },
    [d.title, nodeId, updateNodeData]
  );

  const appendTurn = useCallback(
    (turn: AiTurn) => appendAiTurn(nodeId, turn),
    [appendAiTurn, nodeId]
  );
  const updateTurn = useCallback(
    (turnId: string, patch: Partial<AiTurn>) =>
      updateAiTurn(nodeId, turnId, patch),
    [updateAiTurn, nodeId]
  );
  const removeTurn = useCallback(
    (turnId: string) => removeAiTurn(nodeId, turnId),
    [removeAiTurn, nodeId]
  );

  const {
    composer,
    setComposer,
    pendingAttachments,
    setPendingAttachments,
    attachmentError,
    setAttachmentError,
    credsMissing,
    turnRunning,
    send,
    retryFrom,
  } = useConversation({
    thread: { turns: d.turns, appendTurn, updateTurn, removeTurn },
    getSendSources,
    onFirstTurn,
  });

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

  // Source writers handed to attachSourceRow — they own *where* a ref
  // lands (append / replace by sid) while the helper owns the optimistic
  // whole-PDF extraction flow. Each re-reads the live node so concurrent
  // attaches don't clobber each other through a stale closure.
  const addSource = useCallback(
    (ref: AiSourceRef) => {
      const live = useStore.getState().nodes.find((n) => n.id === nodeId);
      if (!live || live.data.kind !== "ai") return;
      updateNodeData(nodeId, {
        sources: [...(live.data as AiAnswerNodeData).sources, ref],
      } as Partial<AiAnswerNodeData>);
    },
    [nodeId, updateNodeData]
  );
  const replaceSourceBySid = useCallback(
    (sid: string, ref: AiSourceRef) => {
      const live = useStore.getState().nodes.find((n) => n.id === nodeId);
      if (!live || live.data.kind !== "ai") return;
      updateNodeData(nodeId, {
        sources: (live.data as AiAnswerNodeData).sources.map((s) =>
          s.sid === sid ? ref : s
        ),
      } as Partial<AiAnswerNodeData>);
    },
    [nodeId, updateNodeData]
  );
  const setSourceExcerptBySid = useCallback(
    (sid: string, excerpt: string) => {
      const live = useStore.getState().nodes.find((n) => n.id === nodeId);
      if (!live || live.data.kind !== "ai") return;
      updateNodeData(nodeId, {
        sources: (live.data as AiAnswerNodeData).sources.map((s) =>
          s.sid === sid ? { ...s, excerpt } : s
        ),
      } as Partial<AiAnswerNodeData>);
    },
    [nodeId, updateNodeData]
  );

  // Replace the source identified by `sid` with one derived from the
  // given row, keeping the sid stable so any in-flight assistant turn's
  // citation pills (and the conversation's overall provenance) keep
  // making sense.
  const swapSourceMode = (sid: string, row: SourceRow) => {
    attachSourceRow(row, sid, {
      write: (ref) => replaceSourceBySid(sid, ref),
      resolve: replaceSourceBySid,
      fail: setSourceExcerptBySid,
    });
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
          const tempSid = `s${d.sources.length + 1}`;
          attachSourceRow(row, tempSid, {
            write: addSource,
            resolve: replaceSourceBySid,
            fail: setSourceExcerptBySid,
          });
        }}
        anchorRef={addBtnRef}
        workspaceId={node.workspaceId}
        excludeNodeId={nodeId}
        excludeKeys={excludeKeys}
      />

      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto">
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
          turnRunning || d.sources.some((s) => s.excerpt === EXTRACTING_SENTINEL)
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
