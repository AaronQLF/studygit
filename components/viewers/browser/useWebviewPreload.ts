"use client";

// Resolves the preload script URL exposed by the Electron main process
// via `window.studygit.getWebviewPreloadUrl()`. The `<webview>` needs
// this on mount to attach our IPC bridge — without it the in-app
// browser is dead in the desktop build, hence the explicit error state.
// In a regular browser this hook is a no-op and reports neither url
// nor error.

import { useEffect, useState } from "react";

export type WebviewPreloadState = {
  url: string | null;
  error: string | null;
};

export function useWebviewPreload(isElectron: boolean): WebviewPreloadState {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    let cancelled = false;
    const bridge = (
      window as unknown as {
        studygit?: { getWebviewPreloadUrl?: () => Promise<string> };
      }
    ).studygit;
    bridge?.getWebviewPreloadUrl?.()
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [isElectron]);

  return { url, error };
}
