"use client";

// Wrapper around the browser-native Web Speech API (`SpeechRecognition`)
// for dictating into the AI composer with your voice. The API is widely
// available in Chromium-based runtimes — including the packaged Electron
// app — and in modern Safari; Firefox does not implement it, in which
// case `supported` is false and callers can hide the mic UI gracefully.
//
// Two streams of text come back from each session:
//
//   - `interimTranscript`: the in-flight guess the engine is still
//     refining. Updated on every keystroke-equivalent. The composer
//     uses this purely as a visual hint (gray italic preview) so the
//     user knows their voice is being heard.
//
//   - The result reported through the `onFinalChunk` callback: a
//     stable transcript chunk the engine has committed. The composer
//     appends each final chunk to the textarea so the user can see
//     dictation accumulate and edit it before sending.
//
// Privacy note: the standard implementation streams audio through the
// platform's speech service (Google's servers in Chromium, Apple's on
// Safari). If a user is on a privacy-sensitive AI provider this is the
// one place in the app where audio leaves their machine to a different
// vendor. The composer's mic button surfaces a tooltip making this
// clear; future work could swap this for a Whisper-style endpoint
// against the configured AI provider.

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal local typings for the Web Speech API. Avoids depending on
// `@types/dom-speech-recognition` (not installed in this repo) while
// still giving us the strict-mode type safety the rest of the app uses.
type SpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string };
};
type SpeechRecognitionResultList = {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResult;
};
type SpeechRecognitionEvent = Event & {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
};
type SpeechRecognitionErrorEvent = Event & {
  readonly error: string;
  readonly message?: string;
};
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type UseSpeechRecognitionOptions = {
  // Called every time the engine emits a finalized chunk. The composer
  // appends this to the textarea value. The string already has a
  // trailing space normalized in so callers can concatenate without
  // worrying about word-merge bugs.
  onFinalChunk: (chunk: string) => void;
  // Called once when a session ends (engine emitted `onend`), whether
  // it ended naturally on silence or was stopped by a caller. Receives
  // a flag indicating whether a non-empty final chunk was committed
  // during the session, which the hands-free loop uses to decide
  // whether to auto-send vs. silently restart listening on a no-speech
  // session. Optional — dictation-only callers don't need it.
  onSessionEnd?: (info: { sawSpeech: boolean }) => void;
  // BCP 47 language tag (e.g. "en-US"). Defaults to the user's browser
  // language so the engine picks up regional pronunciation cues.
  lang?: string;
  // When true, the engine keeps listening across sentence pauses and
  // only stops when the caller explicitly calls `stop()`. Defaults to
  // true — most dictation use cases benefit from longer-form capture.
  // Hands-free conversation mode flips this to false so each utterance
  // ends naturally on silence and the loop knows when to auto-send.
  continuous?: boolean;
};

// Engine error codes that mean "another start() will fail the same way"
// — denied permission or missing hardware. Callers running auto-restart
// loops (hands-free mode) must stop retrying when one of these lands,
// otherwise they spin against the denied permission forever.
export const FATAL_SPEECH_ERROR_CODES = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
]);

export type UseSpeechRecognitionReturn = {
  supported: boolean;
  // True between `start()` and the engine's `onend` event firing.
  // Drives the mic button's pulsing state in the composer.
  listening: boolean;
  // The latest interim (non-finalized) transcript fragment. Resets to
  // an empty string each time the engine commits a final chunk.
  interimTranscript: string;
  error: string | null;
  // Raw engine error code behind `error` (e.g. "not-allowed"), so
  // callers can tell fatal failures from transient ones like
  // "no-speech". Cleared on the next start().
  errorCode: string | null;
  start: () => void;
  stop: () => void;
};

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions
): UseSpeechRecognitionReturn {
  const { onFinalChunk, onSessionEnd, lang, continuous = true } = options;

  // Hold the live recognizer + the latest callbacks in refs so we
  // don't recreate the engine on every render (the API doesn't allow
  // swapping event handlers cleanly mid-session) and so the
  // long-lived event handlers always see the latest closures.
  const recognizerRef = useRef<SpeechRecognitionInstance | null>(null);
  const onFinalRef = useRef(onFinalChunk);
  const onSessionEndRef = useRef(onSessionEnd);
  // Track whether any committed (final) text landed during the
  // current session so onSessionEnd can report it.
  const sawSpeechRef = useRef(false);
  useEffect(() => {
    onFinalRef.current = onFinalChunk;
  }, [onFinalChunk]);
  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Resolve support once on mount. We also use this to short-circuit
  // start() — calling it on a runtime that lacks the API would throw.
  // The flag starts false so SSR / pre-hydration markup doesn't try to
  // render the mic button; we defer to a microtask after mount to
  // avoid a synchronous setState in the effect body (the codebase's
  // lint rule disallows that pattern, mirroring React's recommendation
  // to avoid cascading renders for derived-from-platform values).
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setSupported(getCtor() !== null));
  }, []);

  // Cleanup on unmount: abort any in-flight session so the OS releases
  // the microphone. `abort()` is preferred over `stop()` here because
  // it skips the "wait for last result to finalize" phase that would
  // otherwise call into a now-unmounted component.
  useEffect(() => {
    return () => {
      try {
        recognizerRef.current?.abort();
      } catch {
        // Ignore — the engine is in an undefined state once the
        // component is gone, but we still want the cleanup phase to
        // complete without bubbling an error up to React.
      }
      recognizerRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setError("Voice input isn't supported in this browser.");
      return;
    }
    if (recognizerRef.current) {
      // Already running — make start() idempotent so a double-click on
      // the mic button doesn't crash the session.
      return;
    }
    setError(null);
    setErrorCode(null);
    setInterimTranscript("");
    sawSpeechRef.current = false;

    const rec = new Ctor();
    rec.lang =
      lang ?? (typeof navigator !== "undefined" ? navigator.language : "en-US");
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => setListening(true);

    rec.onresult = (event: SpeechRecognitionEvent) => {
      // The result list is append-only across callbacks; resultIndex
      // tells us where the new chunks start. We split into "final"
      // (committed text we forward to the composer) and "interim"
      // (in-flight guess we hand back as a UI hint only).
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalChunk += text;
        else interim += text;
      }
      if (finalChunk.trim()) {
        // Normalize whitespace so concatenation in the composer
        // doesn't end up with double spaces or word collisions.
        const normalized = finalChunk.replace(/\s+/g, " ").trim();
        sawSpeechRef.current = true;
        onFinalRef.current(`${normalized} `);
      }
      setInterimTranscript(interim);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Translate the engine's terse error codes into language a user
      // can act on. We deliberately don't surface every code (some
      // like "aborted" fire on user-initiated stops and aren't actually
      // errors).
      const code = event.error;
      if (code === "aborted") return;
      const human =
        code === "not-allowed" || code === "service-not-allowed"
          ? "Microphone permission denied. Allow microphone access in your browser/OS settings to dictate."
          : code === "no-speech"
            ? "Didn't catch that — try again."
            : code === "audio-capture"
              ? "No microphone detected."
              : code === "network"
                ? "Voice recognition needs network access."
                : event.message || `Voice error: ${code}`;
      setError(human);
      setErrorCode(code);

      // Terminal failures (denied permission, no mic) don't reliably
      // deliver `onend` on every engine, which would leave the dead
      // recognizer in the ref and make every later start() short-circuit
      // on the idempotency guard — a permanent mic lockout until reload.
      // Abort and tear down here; if onend does fire afterwards the
      // cleanup there is idempotent.
      if (FATAL_SPEECH_ERROR_CODES.has(code)) {
        try {
          rec.abort();
        } catch {
          // Best effort — the engine may already be dead.
        }
        if (recognizerRef.current === rec) {
          recognizerRef.current = null;
          setListening(false);
          setInterimTranscript("");
        }
      }
    };

    rec.onend = () => {
      setListening(false);
      setInterimTranscript("");
      recognizerRef.current = null;
      // Notify the caller after we've torn down our internal state so
      // a same-tick `start()` from inside the callback (the typical
      // hands-free loop pattern) finds the hook in a clean idle state
      // instead of racing the previous session's teardown.
      const sawSpeech = sawSpeechRef.current;
      sawSpeechRef.current = false;
      onSessionEndRef.current?.({ sawSpeech });
    };

    try {
      rec.start();
      recognizerRef.current = rec;
    } catch (err) {
      // Common case: start() called too soon after a previous stop()
      // — the engine briefly enters an "ended" state before being
      // GC-able. Surface a friendly retry hint instead of a raw
      // InvalidStateError.
      const message = (err as Error)?.message ?? "Couldn't start voice input.";
      setError(/already started/i.test(message) ? "Try again in a second." : message);
    }
  }, [continuous, lang]);

  const stop = useCallback(() => {
    const rec = recognizerRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      // If stop() throws (rare), abort hard so we don't leak the mic.
      try {
        rec.abort();
      } catch {
        // Best effort.
      }
    }
  }, []);

  return {
    supported,
    listening,
    interimTranscript,
    error,
    errorCode,
    start,
    stop,
  };
}
