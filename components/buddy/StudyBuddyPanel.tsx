"use client";

// Inner contents of the Study Buddy dock — header, "currently watching"
// indicator, extra-sources strip, thread, and composer. The send/retry
// lifecycle + composer state come from useConversation (shared with the
// canvas AI node); what's unique here is the app-level state, the
// auto-attached "current page" source, and the hands-free voice loop.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  Eraser,
  Eye,
  EyeOff,
  FileText,
  Headphones,
  Link2,
  Loader2,
  Mic,
  Plus,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { STUDY_BUDDY_PROMPT_EXTRA } from "@/lib/buddy-prompt";
import { attachSourceRow } from "@/lib/source-attach";
import { useConversation } from "@/lib/hooks/use-conversation";
import {
  FATAL_SPEECH_ERROR_CODES,
  useSpeechRecognition,
} from "@/lib/hooks/use-speech-recognition";
import { plainTextForSpeech, useTextToSpeech } from "@/lib/hooks/use-text-to-speech";
import { type SourceRow } from "@/lib/source-rows";
import type { AiRequestSource } from "@/lib/ai-request";
import type { AiAttachment, AiSourceRef, CanvasNode } from "@/lib/types";
import { SourcePicker } from "@/components/viewers/SourcePicker";
import { AiComposer } from "@/components/panels/ai/AiComposer";
import {
  EXTRACTING_SENTINEL,
  chipState,
} from "@/components/panels/ai/AiSourcesStrip";
import { StudyBuddyTurn, StudyBuddyEmptyState } from "./StudyBuddyTurn";
import { useToastStore } from "@/components/ui/Toast";

// ---- helpers ---------------------------------------------------------

// Strip HTML to plain text — same lightweight pass used elsewhere in
// the app. Good enough for shoving page/link content into the model's
// context as `s1`.
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Per-source soft cap so a 50-page article doesn't blow the context
// window. Matches lib/source-rows.ts so the buddy and AI nodes feed
// the model excerpts of the same magnitude.
const MAX_AUTO_EXCERPT_CHARS = 24_000;
function clamp(text: string): string {
  if (text.length <= MAX_AUTO_EXCERPT_CHARS) return text;
  return `${text.slice(0, MAX_AUTO_EXCERPT_CHARS)}\n\n…[truncated]`;
}

// Derive an `AiSourceRef` for the current "page the user is on" if the
// node is automatically source-able. Returns null when there's no
// focused node, the focused node isn't editable/textual, or it has no
// extracted content yet (e.g. a Link that hasn't been read in the
// reader-view yet).
function deriveCurrentSource(
  node: CanvasNode | null
): { ref: AiSourceRef | null; reason: string | null } {
  if (!node) {
    return { ref: null, reason: "Open a page or note to give the buddy context." };
  }
  if (node.data.kind === "page") {
    const title = node.data.title || "Untitled page";
    const plain = stripHtml(node.data.content ?? "");
    if (!plain) return { ref: null, reason: `“${title}” is empty — nothing to read yet.` };
    return {
      ref: {
        sid: "s1",
        nodeId: node.id,
        highlightId: null,
        label: title,
        locator: "page",
        page: null,
        excerpt: clamp(plain),
      },
      reason: null,
    };
  }
  if (node.data.kind === "blog") {
    // Blog nodes carry raw Markdown; we just feed that through after
    // light whitespace normalization so the model sees structure
    // intact (lists, headings, etc.) rather than the markdown source
    // collapsed by stripHtml.
    const title = node.data.title || "Untitled draft";
    const md = (node.data.markdown ?? "").trim();
    if (!md) return { ref: null, reason: `“${title}” is empty — nothing to read yet.` };
    return {
      ref: {
        sid: "s1",
        nodeId: node.id,
        highlightId: null,
        label: title,
        locator: "blog",
        page: null,
        excerpt: clamp(md),
      },
      reason: null,
    };
  }
  if (node.data.kind === "note") {
    const text = (node.data.text ?? "").trim();
    if (!text) return { ref: null, reason: "This note is empty." };
    return {
      ref: {
        sid: "s1",
        nodeId: node.id,
        highlightId: null,
        label: text.length > 60 ? `${text.slice(0, 60)}…` : text,
        locator: "note",
        page: null,
        excerpt: clamp(text),
      },
      reason: null,
    };
  }
  if (node.data.kind === "link") {
    const data = node.data;
    const html = data.extractedHtml ?? "";
    const plain = stripHtml(html);
    const title = data.extractedTitle || data.title || data.url || "Link";
    if (!plain) {
      return {
        ref: null,
        reason: `Open “${title}” in the reader-view first to extract its text.`,
      };
    }
    return {
      ref: {
        sid: "s1",
        nodeId: node.id,
        highlightId: null,
        label: title,
        locator: "link",
        page: null,
        excerpt: clamp(plain),
      },
      reason: null,
    };
  }
  // PDFs / images / ai / shape — not auto-attached. The user can pin
  // them as extra sources via the picker if they want.
  if (node.data.kind === "pdf") {
    return {
      ref: null,
      reason:
        "Add a specific PDF page or highlight as an extra source — the buddy doesn't auto-extract whole PDFs.",
    };
  }
  if (node.data.kind === "ai") {
    return {
      ref: null,
      reason: "Open a page or note for the buddy to follow along with.",
    };
  }
  return { ref: null, reason: "This node has no readable content for the buddy." };
}

// ---- component -------------------------------------------------------

export function StudyBuddyPanel() {
  const buddy = useStore((s) => s.studyBuddy);
  const focusedNodeId = useStore((s) => s.focusedNodeId);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectedWorkspaceId = useStore((s) => s.selectedWorkspaceId);
  const nodes = useStore((s) => s.nodes);

  const appendStudyBuddyTurn = useStore((s) => s.appendStudyBuddyTurn);
  const updateStudyBuddyTurn = useStore((s) => s.updateStudyBuddyTurn);
  const removeStudyBuddyTurn = useStore((s) => s.removeStudyBuddyTurn);
  const clearStudyBuddyThread = useStore((s) => s.clearStudyBuddyThread);
  const setHandsFree = useStore((s) => s.setStudyBuddyHandsFree);
  const addStudyBuddyExtraSource = useStore((s) => s.addStudyBuddyExtraSource);
  const updateStudyBuddyExtraSource = useStore(
    (s) => s.updateStudyBuddyExtraSource
  );
  const removeStudyBuddyExtraSource = useStore(
    (s) => s.removeStudyBuddyExtraSource
  );
  const restampStudyBuddyExtraSources = useStore(
    (s) => s.restampStudyBuddyExtraSources
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  // Lets the user temporarily ignore the auto-source — useful for asking
  // a meta question that shouldn't pull in the page they're on. Resets
  // implicitly when the user changes focus.
  const [autoMuted, setAutoMuted] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // The "current page" is whichever panel is focused, falling back to
  // the canvas's selection so opening the buddy without any panels open
  // still gives it the user's intent. Re-derived on every render so the
  // indicator and the source we send to the model stay in lockstep.
  const currentNodeId = focusedNodeId ?? selectedNodeId;
  const currentNode = useMemo(
    () => (currentNodeId ? nodes.find((n) => n.id === currentNodeId) ?? null : null),
    [currentNodeId, nodes]
  );
  const { ref: autoSource, reason: autoReason } = useMemo(
    () => deriveCurrentSource(currentNode),
    [currentNode]
  );

  // s1 = current page (unless muted), then ready extra sources as
  // e1..eN. Re-stamps the extras as a send-time side effect so the model
  // gets clean, stable numbering each turn.
  const getSendSources = useCallback((): AiRequestSource[] => {
    const restampedExtras = restampStudyBuddyExtraSources().filter(
      (s) => chipState(s) === "ready"
    );
    const sources: AiSourceRef[] = [];
    if (autoSource && !autoMuted) sources.push(autoSource);
    sources.push(...restampedExtras);
    return sources.map((s) => ({
      sid: s.sid,
      label: s.label,
      locator: s.locator,
      excerpt: s.excerpt,
      nodeId: s.nodeId,
      highlightId: s.highlightId,
      page: s.page,
    }));
  }, [autoSource, autoMuted, restampStudyBuddyExtraSources]);

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
    thread: {
      turns: buddy.turns,
      appendTurn: appendStudyBuddyTurn,
      updateTurn: updateStudyBuddyTurn,
      removeTurn: removeStudyBuddyTurn,
    },
    getSendSources,
    systemPromptExtra: STUDY_BUDDY_PROMPT_EXTRA,
  });

  // -------------- Hands-free conversation loop --------------
  //
  // Implicit state machine: one auto-listen effect arms the mic whenever
  // hands-free is on and nothing else is happening (not listening, not
  // speaking, no turn in flight). Each leg of the loop just flips one of
  // those dependencies and the effect re-arms:
  //
  //   speech heard → send() → turnRunning → effect bails
  //   send done    → reply spoken via TTS  → effect bails on ttsSpeaking
  //   TTS done     → ttsSpeaking=false      → effect re-arms the mic
  //
  // Refs cover the cases state can't be threaded through deps cleanly:
  //   handsFreeRef        — latest toggle, read in the engine callback
  //   composerRef         — current textarea value at session-end
  //   sendRef             — latest send (recognizer is set up first)
  //   lastSpokenTurnIdRef — don't re-speak the same reply on re-render
  //   restartTimerRef     — pending "wait a beat then re-listen" timer
  const handsFree = buddy.handsFree;
  const handsFreeRef = useRef(handsFree);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);
  const composerRef = useRef(composer);
  useEffect(() => {
    composerRef.current = composer;
  }, [composer]);
  const sendRef = useRef<(text: string, attachments: AiAttachment[]) => Promise<void>>(
    send
  );
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  const lastSpokenTurnIdRef = useRef<string | null>(null);
  const restartTimerRef = useRef<number | null>(null);

  const tts = useTextToSpeech();
  const handsFreeStt = useSpeechRecognition({
    continuous: false,
    onFinalChunk: (chunk) => {
      // Show the user what was heard by feeding it into the composer —
      // same surface as if they'd typed it. Auto-send happens on
      // session-end; this just makes the in-flight transcript visible.
      const current = composerRef.current;
      const sep = current && !/\s$/.test(current) ? " " : "";
      setComposer(`${current}${sep}${chunk}`);
    },
    onSessionEnd: ({ sawSpeech }) => {
      if (!handsFreeRef.current) return;
      // No speech → the auto-listen effect re-arms the mic on the next
      // render when sttListening flips false. Nothing to do here.
      if (!sawSpeech) return;
      // Heard something. Defer one tick so the recognizer is fully torn
      // down and React has flushed the onFinalChunk setComposer updates
      // before we send.
      window.setTimeout(() => {
        if (!handsFreeRef.current) return;
        const text = composerRef.current.trim();
        if (!text) return;
        setComposer("");
        void sendRef.current(text, []);
      }, 0);
    },
  });

  // Pull the stable primitives out of each hook return so the effect
  // dependency arrays below stay clean.
  const {
    supported: sttSupported,
    listening: sttListening,
    error: sttError,
    errorCode: sttErrorCode,
    start: sttStart,
    stop: sttStop,
  } = handsFreeStt;
  const {
    supported: ttsSupported,
    speaking: ttsSpeaking,
    speak: ttsSpeak,
    cancel: ttsCancel,
  } = tts;

  // Disengage cleanup: when hands-free flips off (or the dock unmounts),
  // cancel any in-flight mic / synth / restart timer so the loop stops.
  useEffect(() => {
    if (handsFree) return;
    if (sttListening) sttStop();
    ttsCancel();
    if (restartTimerRef.current != null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    lastSpokenTurnIdRef.current = null;
  }, [handsFree, sttListening, sttStop, ttsCancel]);

  // Fatal mic failure (denied permission, no hardware): disengage
  // hands-free and tell the user why, instead of letting the
  // auto-listen effect below re-arm the dead mic every 250ms forever.
  useEffect(() => {
    if (!handsFree) return;
    if (!sttErrorCode || !FATAL_SPEECH_ERROR_CODES.has(sttErrorCode)) return;
    setHandsFree(false);
    useToastStore
      .getState()
      .push(
        { message: sttError ?? "Hands-free stopped: microphone unavailable." },
        7000
      );
  }, [handsFree, sttErrorCode, sttError, setHandsFree]);

  // Auto-listen tick: while hands-free is on and nothing else is
  // happening, arm the mic for the next utterance after a small
  // debounce. Re-runs on every state transition that could matter.
  useEffect(() => {
    if (!handsFree) return;
    if (!sttSupported) return;
    if (sttErrorCode && FATAL_SPEECH_ERROR_CODES.has(sttErrorCode)) return;
    if (sttListening) return;
    if (ttsSpeaking) return;
    if (turnRunning) return;
    if (restartTimerRef.current != null) {
      window.clearTimeout(restartTimerRef.current);
    }
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      if (!handsFreeRef.current) return;
      sttStart();
    }, 250);
    return () => {
      if (restartTimerRef.current != null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
    };
  }, [handsFree, sttSupported, sttErrorCode, sttListening, ttsSpeaking, turnRunning, sttStart]);

  // Speak each new assistant turn aloud, guarded against re-speaking the
  // same turn on incidental re-renders. ttsSpeaking flipping back to
  // false drives the auto-listen effect above to pick the loop back up.
  useEffect(() => {
    if (!handsFree) return;
    if (!ttsSupported) return;
    const last = buddy.turns[buddy.turns.length - 1];
    if (!last || last.role !== "assistant") return;
    if (last.status !== "idle") return;
    if (!last.text) return;
    if (lastSpokenTurnIdRef.current === last.id) return;
    lastSpokenTurnIdRef.current = last.id;
    const speech = plainTextForSpeech(last.text);
    if (!speech) return;
    ttsSpeak(speech);
  }, [handsFree, ttsSupported, ttsSpeak, buddy.turns]);

  // Cleanup on unmount (dock close, workspace switch, etc).
  useEffect(() => {
    return () => {
      if (restartTimerRef.current != null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
    };
  }, []);

  // Reset the mute toggle whenever the user moves to a different node —
  // it would be confusing if "ignore current page" silently persisted.
  const lastNodeIdRef = useRef<string | null>(currentNodeId ?? null);
  useEffect(() => {
    if (lastNodeIdRef.current !== currentNodeId) {
      lastNodeIdRef.current = currentNodeId ?? null;
      setAutoMuted(false);
    }
  }, [currentNodeId]);

  // Auto-scroll to the bottom whenever a new turn arrives.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [buddy.turns]);

  const excludeKeys = useMemo(() => {
    const set = new Set<string>();
    for (const s of buddy.extraSources) {
      set.add(`${s.nodeId}:${s.highlightId ?? s.nodeId}`);
    }
    if (autoSource) {
      // Don't let the user double-attach the auto-source as an extra.
      set.add(`${autoSource.nodeId}:${autoSource.highlightId ?? autoSource.nodeId}`);
    }
    return set;
  }, [buddy.extraSources, autoSource]);

  const onPickerSelect = (row: SourceRow) => {
    const tempSid = `e${buddy.extraSources.length + 1}`;
    attachSourceRow(row, tempSid, {
      write: addStudyBuddyExtraSource,
      resolve: (sid, ref) => updateStudyBuddyExtraSource(sid, ref),
      fail: (sid, errorExcerpt) =>
        updateStudyBuddyExtraSource(sid, { excerpt: errorExcerpt }),
    });
  };

  const composerDisabled =
    turnRunning ||
    buddy.extraSources.some((s) => s.excerpt === EXTRACTING_SENTINEL);

  // Loop status, surfaced in the header so the user always knows whether
  // the buddy is hearing them, thinking, or talking back. Order matters:
  // thinking > speaking > listening > idle, so a mid-flight reply doesn't
  // flap to "listening" during the gap between TTS-end and STT-start.
  const loopStatus: "idle" | "listening" | "thinking" | "speaking" = handsFree
    ? turnRunning
      ? "thinking"
      : ttsSpeaking
        ? "speaking"
        : sttListening
          ? "listening"
          : "idle"
    : "idle";

  const onHandsFreeToggle = () => setHandsFree(!handsFree);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--pg-bg)]">
      {/* Header strip — title + hands-free toggle + Clear thread. */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--pg-border)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles size={13} className="shrink-0 text-[var(--pg-accent)]" />
          <span className="pg-serif truncate text-[13px] font-medium text-[var(--pg-fg)]">
            Study Buddy
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onHandsFreeToggle}
            disabled={!handsFree && !sttSupported}
            className={clsx(
              "inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px]",
              handsFree
                ? "bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]"
                : !sttSupported
                  ? "text-[var(--pg-muted-soft)]"
                  : "text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]"
            )}
            title={
              !sttSupported
                ? "Voice conversation isn't supported in this browser."
                : handsFree
                  ? "Stop hands-free conversation"
                  : "Start hands-free: speak, the buddy auto-responds and reads replies aloud."
            }
            aria-pressed={handsFree}
          >
            <Headphones size={11} />
            {handsFree ? "On" : "Voice"}
          </button>
          {buddy.turns.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "Clear the Study Buddy thread? Sources stay attached, but every message will be removed."
                  )
                ) {
                  clearStudyBuddyThread();
                }
              }}
              className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]"
              title="Clear thread"
            >
              <Eraser size={11} />
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {/* Source strip: the auto-attached current source as a fixed chip,
          plus any extra sources the user pinned. */}
      <div className="shrink-0 border-b border-[var(--pg-border)] px-3 py-2">
        <CurrentSourceChip
          source={autoSource}
          reason={autoReason}
          muted={autoMuted}
          onToggleMute={() => setAutoMuted((v) => !v)}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {buddy.extraSources.map((source) => (
            <ExtraSourceChip
              key={source.sid}
              source={source}
              onRemove={() => removeStudyBuddyExtraSource(source.sid)}
            />
          ))}
          <button
            ref={addBtnRef}
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--pg-border)] px-2 py-0.5 text-[10.5px] text-[var(--pg-muted)] hover:border-[var(--pg-border-strong)] hover:text-[var(--pg-fg)]"
          >
            <Plus size={10} /> Source
          </button>
        </div>
      </div>

      <SourcePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onPickerSelect}
        anchorRef={addBtnRef}
        workspaceId={selectedWorkspaceId}
        excludeNodeId={null}
        excludeKeys={excludeKeys}
      />

      {handsFree ? <HandsFreeStatusBar status={loopStatus} /> : null}

      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto">
        {buddy.turns.length === 0 ? (
          <StudyBuddyEmptyState hasCurrent={!!autoSource} />
        ) : (
          <div className="px-3 pt-3 pb-4">
            {buddy.turns.map((turn, i) => (
              <StudyBuddyTurn
                key={turn.id}
                turn={turn}
                showRetry={
                  turn.role === "assistant" &&
                  i > 0 &&
                  buddy.turns[i - 1].role === "user"
                }
                onRetry={() => retryFrom(turn.id)}
                onDelete={() => removeStudyBuddyTurn(turn.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--pg-border)]">
        <AiComposer
          value={composer}
          onChange={setComposer}
          onSend={() => send(composer, pendingAttachments)}
          disabled={composerDisabled}
          credsMissing={credsMissing}
          attachments={pendingAttachments}
          onAttachmentsChange={setPendingAttachments}
          attachmentError={attachmentError}
          setAttachmentError={setAttachmentError}
          // In hands-free mode the panel-level recognizer owns the
          // microphone — hide the composer's own mic so the two engines
          // can't fight for the audio device.
          suppressVoiceInput={handsFree}
        />
      </div>
    </section>
  );
}

function HandsFreeStatusBar({
  status,
}: {
  status: "idle" | "listening" | "thinking" | "speaking";
}) {
  // Compact status banner under the source strip — gives the user a
  // single, predictable place to read the state of the loop.
  let icon = <Headphones size={11} />;
  let label = "Hands-free ready — say something.";
  let tone = "border-[var(--pg-accent)]/40 bg-[var(--pg-accent-soft)] text-[var(--pg-fg-soft)]";
  if (status === "listening") {
    icon = <Mic size={11} className="text-red-500" />;
    label = "Listening…";
    tone = "border-red-500/30 bg-red-500/5 text-[var(--pg-fg-soft)]";
  } else if (status === "thinking") {
    icon = <Loader2 size={11} className="animate-spin" />;
    label = "Thinking…";
    tone = "border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] text-[var(--pg-muted)]";
  } else if (status === "speaking") {
    icon = <Volume2 size={11} className="text-[var(--pg-accent)]" />;
    label = "Speaking…";
    tone = "border-[var(--pg-accent)]/40 bg-[var(--pg-accent-soft)] text-[var(--pg-fg-soft)]";
  }
  return (
    <div
      className={clsx(
        "shrink-0 border-b px-3 py-1.5 text-[11px]",
        tone
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        {icon}
        <span>{label}</span>
      </span>
    </div>
  );
}

// ---- small chip components ------------------------------------------

function CurrentSourceChip({
  source,
  reason,
  muted,
  onToggleMute,
}: {
  source: AiSourceRef | null;
  reason: string | null;
  muted: boolean;
  onToggleMute: () => void;
}) {
  if (!source) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--pg-muted)]">
        <Eye size={11} className="shrink-0" />
        <span className="truncate">{reason ?? "Nothing focused right now."}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={clsx(
          "inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
          muted
            ? "border-[var(--pg-border)] text-[var(--pg-muted)]"
            : "border-[var(--pg-accent)]/40 bg-[var(--pg-accent-soft)] text-[var(--pg-fg-soft)]"
        )}
        title={
          muted
            ? "Click the eye to re-include this page in the buddy's context"
            : `Currently watching: ${source.label}\n\nThe buddy will reference this as [s1] in its answers.`
        }
      >
        <FileText size={10} className="shrink-0" />
        <span className="truncate">
          {muted ? "Ignoring " : "Watching "}
          <span className="font-medium text-[var(--pg-fg)]">{source.label}</span>
        </span>
      </span>
      <button
        type="button"
        onClick={onToggleMute}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]"
        title={muted ? "Re-include current page" : "Ignore current page for now"}
      >
        {muted ? <EyeOff size={11} /> : <Eye size={11} />}
      </button>
    </div>
  );
}

function ExtraSourceChip({
  source,
  onRemove,
}: {
  source: AiSourceRef;
  onRemove: () => void;
}) {
  const state = chipState(source);
  const Icon =
    source.page != null ? FileText : source.highlightId == null ? Sparkles : Link2;

  return (
    <span
      className={clsx(
        "group inline-flex max-w-[200px] items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px]",
        state === "ready"
          ? "border-[var(--pg-border)] text-[var(--pg-fg-soft)]"
          : state === "extracting"
            ? "border-[var(--pg-border)] text-[var(--pg-muted)]"
            : "border-red-500/40 text-red-500"
      )}
      title={state === "ready" ? source.excerpt.slice(0, 240) : source.excerpt}
    >
      <Icon size={9} className="shrink-0 text-[var(--pg-muted)]" aria-hidden />
      <span className="truncate">{source.label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded text-[var(--pg-muted)] opacity-0 transition-opacity hover:text-[var(--pg-fg)] group-hover:opacity-100"
        title="Remove source"
      >
        <span className="text-[12px] leading-none">×</span>
      </button>
    </span>
  );
}
