"use client";

// Routes `postMessage` events from the cloud iframe into the shared
// browser-channel handler. The iframe is sandboxed without
// `allow-same-origin` so its scripts run in an opaque origin
// (`event.origin === "null"`) and `event.source` is our only safe way
// to authenticate the sender — that's why we match on
// `event.source === iframe.contentWindow` instead of an origin string.
//
// Inactive when `isElectron` is true; the desktop browser uses
// `<webview>` IPC instead.

import { useEffect, type RefObject } from "react";
import type {
  BrowserChannelSurface,
} from "./types";

export type UseCloudFrameBridgeOptions = {
  isElectron: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  /** Reads the current URL so the channel router can attribute events. */
  currentUrlRef: RefObject<string>;
  onChannel: (
    channel: string,
    args: unknown[],
    surface: BrowserChannelSurface
  ) => void;
};

export function useCloudFrameBridge({
  isElectron,
  iframeRef,
  currentUrlRef,
  onChannel,
}: UseCloudFrameBridgeOptions) {
  useEffect(() => {
    if (isElectron) return;
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as {
        type?: string;
        channel?: string;
        args?: unknown[];
      };
      if (data?.type !== "pg-browser" || !data.channel) return;
      const surface: BrowserChannelSurface = {
        getURL: () => currentUrlRef.current,
        // Cross-origin contentDocument access throws — fall back to "".
        getTitle: () => {
          try {
            return frame.contentDocument?.title ?? "";
          } catch {
            return "";
          }
        },
        getRect: () => frame.getBoundingClientRect(),
      };
      onChannel(data.channel, data.args ?? [], surface);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [isElectron, iframeRef, currentUrlRef, onChannel]);
}
