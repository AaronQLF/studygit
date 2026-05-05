"use client";

import { useEffect, useState } from "react";
import {
  getLocalPdfBlobUrl,
  parseLocalPdfHash,
  subscribeLocalPdfAdded,
} from "./localPdfStore";

export type PdfSourceState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "ready"; url: string; isLocal: boolean }
  | { kind: "missing"; hash: string }
  | { kind: "error"; error: string };

type Resolution = {
  hash: string;
  state: PdfSourceState;
};

// Resolve a `pdf` node `src` to something pdf.js can load.
//
// - `local:<sha256>` — looked up in the on-device store. If the bytes aren't
//   on this device, returns `kind: 'missing'` so the caller can render a
//   re-attach prompt. Re-resolves automatically once the matching bytes are
//   added to the local store (e.g. via the re-attach picker).
// - Anything else (legacy `/api/files/<key>`, http(s) URLs) — passed through
//   unchanged as a remote URL.
// - Empty/null — `kind: 'idle'`.
export function usePdfSource(src: string | null | undefined): PdfSourceState {
  // The synchronous shape of the result is fully determined by `src`.
  // Only the "did the local store have these bytes?" question is async.
  const hash = src ? parseLocalPdfHash(src) : null;
  const [resolution, setResolution] = useState<Resolution | null>(null);

  useEffect(() => {
    if (!hash) {
      // No async work to do. Letting `resolution` stay stale is fine — the
      // returned value below ignores resolutions that don't match the
      // current hash.
      return;
    }
    let cancelled = false;
    const resolve = async () => {
      try {
        const url = await getLocalPdfBlobUrl(hash);
        if (cancelled) return;
        setResolution({
          hash,
          state: url
            ? { kind: "ready", url, isLocal: true }
            : { kind: "missing", hash },
        });
      } catch (err) {
        if (cancelled) return;
        setResolution({
          hash,
          state: {
            kind: "error",
            error: (err as Error).message || "failed to load local pdf",
          },
        });
      }
    };
    void resolve();
    const unsubscribe = subscribeLocalPdfAdded((addedHash) => {
      if (addedHash === hash) void resolve();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [hash]);

  if (!src) return { kind: "idle" };
  if (!hash) return { kind: "ready", url: src, isLocal: false };
  if (resolution && resolution.hash === hash) return resolution.state;
  return { kind: "pending" };
}
