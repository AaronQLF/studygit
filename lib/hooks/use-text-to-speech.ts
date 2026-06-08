"use client";

// Wrapper around the browser-native Web Speech Synthesis API for
// reading the buddy's replies back to the user. Pairs with
// useSpeechRecognition to power the hands-free conversation loop:
//   listen → STT → /api/ai → speak via this hook → listen again.
//
// Two design choices worth flagging:
//
//   1. We strip HTML and `pgedit` JSON blocks from the assistant turn's
//      text before speaking. The pills and code-fenced edit
//      suggestions are visual affordances; reading them aloud as
//      "language hyphen pgedit open brace target colon current…" would
//      be unbearable. The stripped text goes into a single utterance
//      so we can hook a clean `onend` event for the loop transition.
//
//   2. We cap each utterance at ~800 chars. Realtime conversation UX
//      degrades sharply if a single reply takes 30+ seconds to read
//      out. Anything longer is truncated with a trailing "…" and the
//      user can still see the full reply on screen.
//
// SSR: the synth API isn't available on the server. The hook reports
// `supported: false` on the server and after first mount checks for
// real availability via a microtask (matches the SSR-safety pattern in
// the rest of the app, e.g. AppShell's mac titlebar measurement).

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_SPEECH_CHARS = 800;

const PGEDIT_BLOCK_RE =
  /```pgedit[\s\S]*?```|<pre[^>]*>\s*<code[^>]*language-pgedit[^>]*>[\s\S]*?<\/code>\s*<\/pre>/gi;

// Convert assistant-turn HTML/markdown into plain text fit for TTS.
// Exported so the buddy panel can compute previews (e.g. "About to
// speak: …") without redoing the work.
export function plainTextForSpeech(input: string): string {
  if (!input) return "";
  const withoutBlocks = input.replace(PGEDIT_BLOCK_RE, " ");
  const withoutTags = withoutBlocks
    .replace(/<\s*br\s*\/?\s*>/gi, ". ")
    .replace(/<\/p>\s*<p[^>]*>/gi, ". ")
    .replace(/<[^>]+>/g, " ");
  const decoded = withoutTags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const collapsed = decoded.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_SPEECH_CHARS) return collapsed;
  // Cut on a sentence-ish boundary near the cap so the truncation
  // doesn't sound mid-thought.
  const cut = collapsed.slice(0, MAX_SPEECH_CHARS);
  const lastBreak = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? ")
  );
  return lastBreak > MAX_SPEECH_CHARS * 0.6
    ? `${cut.slice(0, lastBreak + 1)} …`
    : `${cut}…`;
}

export type UseTextToSpeechOptions = {
  // BCP 47 language hint — the engine uses it to pick a default voice.
  // Falls back to the browser's language if omitted.
  lang?: string;
  // Speaking rate (0.1–10, default 1.0). 1.05 reads slightly faster
  // than the OS default which keeps multi-turn conversation snappy
  // without sounding rushed.
  rate?: number;
  // Pitch (0–2, default 1.0). Left alone in the buddy default; exposed
  // for future per-voice tuning.
  pitch?: number;
};

export type UseTextToSpeechReturn = {
  supported: boolean;
  speaking: boolean;
  // Speak the given text. `onEnd` runs whether the utterance finished
  // naturally or was cancelled — the hands-free loop depends on this
  // to know when it's safe to restart listening regardless of why
  // playback stopped.
  speak: (text: string, opts?: { onEnd?: () => void }) => void;
  cancel: () => void;
};

export function useTextToSpeech(
  options: UseTextToSpeechOptions = {}
): UseTextToSpeechReturn {
  const { lang, rate = 1.05, pitch = 1.0 } = options;
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // The currently-speaking utterance — kept in a ref so cancel() can
  // detach the onend handler before tearing it down. Without this,
  // calling cancel() races with the engine's own onend dispatch and
  // we can fire the handoff callback twice.
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    queueMicrotask(() =>
      setSupported(
        typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined"
      )
    );
  }, []);

  // Cancel any in-flight playback when the component unmounts. Without
  // this, navigating away mid-reply would leave the synth queue running
  // and you'd hear the buddy keep talking to an empty page.
  useEffect(() => {
    return () => {
      try {
        if (typeof window !== "undefined" && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
      } catch {
        // ignore — best-effort cleanup
      }
    };
  }, []);

  const cancel = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = utteranceRef.current;
    if (u) {
      // Detach the handler before cancel() so the user-facing onEnd
      // they passed in won't be re-invoked by the engine's own
      // cancellation event. The hands-free loop relies on this.
      u.onend = null;
      u.onerror = null;
    }
    utteranceRef.current = null;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, opts: { onEnd?: () => void } = {}) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        opts.onEnd?.();
        return;
      }
      const trimmed = text.trim();
      if (!trimmed) {
        opts.onEnd?.();
        return;
      }

      // Cancel any prior utterance before queuing a new one — Chrome's
      // implementation otherwise queues utterances and the user hears
      // both replies back-to-back, which breaks the conversation flow.
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }

      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.lang =
        lang ?? (typeof navigator !== "undefined" ? navigator.language : "en-US");
      utterance.rate = rate;
      utterance.pitch = pitch;
      const finish = () => {
        if (utteranceRef.current === utterance) utteranceRef.current = null;
        setSpeaking(false);
        opts.onEnd?.();
      };
      utterance.onend = finish;
      // Treat synth errors as a finished utterance for the purposes of
      // the loop — the user already saw the reply on screen, so we
      // shouldn't strand them in "speaking" state forever just because
      // playback failed.
      utterance.onerror = finish;
      utteranceRef.current = utterance;
      setSpeaking(true);
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        finish();
      }
    },
    [lang, pitch, rate]
  );

  return { supported, speaking, speak, cancel };
}
