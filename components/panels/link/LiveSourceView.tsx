"use client";

// Renders the live original page inside the link panel. In Electron we
// mount a real <webview> so cross-origin sites load without
// X-Frame-Options problems; in a regular browser we fall back to a
// sandboxed iframe pointed at our same-origin proxy. Most blocked
// iframes don't fire a useful `onError`, so a timed contentDocument
// check surfaces a soft "couldn't load" overlay after ~1.8s.

import React, { useEffect, useRef, useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { buildWebProxyUrl } from "@/lib/web-proxy";
import { isElectronEnvironment } from "@/lib/runtime";

export function LiveSourceView({ url }: { url: string }) {
  const [isElectron, setIsElectron] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Defer the setState a microtask so we don't sync-render twice
    // during the initial mount (matches the pattern used in
    // AppShell.tsx for the same platform-detection check).
    queueMicrotask(() => {
      setIsElectron(isElectronEnvironment());
    });
  }, []);

  useEffect(() => {
    if (isElectron) return;
    queueMicrotask(() => setIframeBlocked(false));
    const id = window.setTimeout(() => {
      try {
        const doc = iframeRef.current?.contentDocument;
        if (!doc || doc.body?.childElementCount === 0) {
          setIframeBlocked(true);
        }
      } catch {
        // Cross-origin contentDocument access throws — that's a strong
        // signal the iframe loaded SOMETHING (rather than being blank).
        // Don't show the fallback in that case.
      }
    }, 1800);
    return () => window.clearTimeout(id);
  }, [isElectron, url]);

  if (!url) {
    return (
      <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--pg-muted)]">
        No URL to load
      </div>
    );
  }

  if (isElectron) {
    // The webview shares the persist:browser partition with the main
    // in-app browser so a Substack / NYT login made there carries over
    // to the source view of any saved link.
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement("webview" as any, {
        src: url,
        partition: "persist:browser",
        style: {
          display: "inline-flex",
          width: "100%",
          height: "100%",
          background: "white",
        },
      })
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white">
      <iframe
        ref={iframeRef}
        src={buildWebProxyUrl(url)}
        className="pg-live-source-iframe h-full w-full border-0"
        // No `allow-same-origin` — see BrowserWindow.tsx for the
        // rationale. Sites that need their own cookies render
        // logged-out, but our XSS surface stays closed.
        sandbox="allow-scripts allow-popups allow-forms"
        title="Original page"
      />
      {iframeBlocked ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--pg-bg)_85%,transparent)]">
          <div className="pointer-events-auto max-w-sm rounded-lg border border-[var(--pg-border-strong)] bg-[var(--pg-bg-elevated)] p-4 text-center shadow-[var(--pg-shadow)]">
            <Globe size={18} className="mx-auto mb-2 text-[var(--pg-muted)]" />
            <div className="mb-1 text-[13px] font-medium text-[var(--pg-fg)]">
              Couldn&rsquo;t load this page
            </div>
            <p className="mb-3 text-[12px] text-[var(--pg-fg-soft)]">
              The server-side proxy couldn&rsquo;t fetch this URL. Try the
              reader view, or open the original in a new tab.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--pg-accent)] px-3 py-1.5 text-[12px] text-white hover:opacity-90"
            >
              <ExternalLink size={11} />
              Open original
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
