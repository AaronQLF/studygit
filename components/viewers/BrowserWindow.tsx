"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import clsx from "clsx";
import { Globe } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  useBrowserSession,
  type BrowserSessionHighlight,
} from "@/lib/browser-session";
import { useToastStore } from "@/components/ui/Toast";
import { HIGHLIGHT_COLORS } from "@/lib/defaults";
import { buildWebProxyUrl } from "@/lib/web-proxy";
import { hostnameOf, normalizeNavInput } from "@/lib/url";
import { isElectronEnvironment } from "@/lib/runtime";
import type { LinkNodeData } from "@/lib/types";
import { EmptyStateCard } from "@/components/ui/EmptyStateCard";
import { SelectionColorToolbar } from "@/components/ui/SelectionColorToolbar";
import { HighlightsListPanel } from "@/components/highlights/HighlightsListPanel";
import { BrowserChrome } from "./browser/BrowserChrome";
import { useWebviewPreload } from "./browser/useWebviewPreload";
import { useCloudFrameBridge } from "./browser/useCloudFrameBridge";
import type {
  IpcMessageEvent,
  SelectionPayload,
  WebviewElement,
} from "./browser/types";

const DEFAULT_HOMEPAGE = "https://www.google.com";

export function BrowserWindow() {
  const open = useBrowserSession((s) => s.open);
  if (!open) return null;
  return <BrowserWindowMounted />;
}

function BrowserWindowMounted() {
  const inputUrl = useBrowserSession((s) => s.inputUrl);
  const currentUrl = useBrowserSession((s) => s.currentUrl);
  const pageTitle = useBrowserSession((s) => s.pageTitle);
  const highlights = useBrowserSession((s) => s.highlights);
  const flash = useBrowserSession((s) => s.flash);

  const closeBrowser = useBrowserSession((s) => s.closeBrowser);
  const setInputUrl = useBrowserSession((s) => s.setInputUrl);
  const commitNavigation = useBrowserSession((s) => s.commitNavigation);
  const setPageTitle = useBrowserSession((s) => s.setPageTitle);
  const addHighlight = useBrowserSession((s) => s.addHighlight);
  const removeHighlight = useBrowserSession((s) => s.removeHighlight);
  const clearHighlights = useBrowserSession((s) => s.clearHighlights);
  const setFlash = useBrowserSession((s) => s.setFlash);
  const reset = useBrowserSession((s) => s.reset);

  const addNode = useStore((s) => s.addNode);
  const addWebHighlight = useStore((s) => s.addWebHighlight);
  const selectedWorkspaceId = useStore((s) => s.selectedWorkspaceId);
  const pushToast = useToastStore((s) => s.push);

  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<WebviewElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const currentUrlRef = useRef(currentUrl);
  // <webview>.loadURL() throws "must be attached to the DOM and dom-ready
  // emitted" if it lands before Chromium has finished wiring up the
  // embedded WebContents. Track readiness and stash a URL the user
  // requested before then so we can drain it when dom-ready fires.
  const domReadyRef = useRef(false);
  const pendingUrlRef = useRef<string | null>(null);
  // Cleanup callback for the listeners we attach inside handleWebviewRef.
  // Stored on a ref because the ref callback itself is fire-and-forget;
  // when the node really does change we call this to detach old listeners
  // so they don't pile up across re-attaches.
  const webviewCleanupRef = useRef<(() => void) | null>(null);

  const [cloudFrameSrc, setCloudFrameSrc] = useState<string | null>(null);
  const [navState, setNavState] = useState({ canBack: false, canForward: false });
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<SelectionPayload | null>(null);
  // Pre-computed absolute screen position for the floating color picker.
  // Captured at the moment the IPC selection event lands so we never have
  // to read the webview ref during render (which the React linter
  // rightfully forbids).
  const [selectionAnchor, setSelectionAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [activeColor, setActiveColor] = useState<string>(HIGHLIGHT_COLORS[0]);

  const isElectron = useMemo(() => isElectronEnvironment(), []);
  const { url: preloadUrl, error: preloadError } = useWebviewPreload(isElectron);

  useEffect(() => {
    currentUrlRef.current = currentUrl;
  }, [currentUrl]);

  const syncCloudNavState = useCallback(() => {
    setNavState({
      canBack: historyIndexRef.current > 0,
      canForward:
        historyIndexRef.current >= 0 &&
        historyIndexRef.current < historyRef.current.length - 1,
    });
  }, []);

  const postToCloudFrame = useCallback((channel: string, ...args: unknown[]) => {
    // The cloud iframe is sandboxed without `allow-same-origin`, so the
    // document inside lives in a unique opaque origin. postMessage will
    // refuse a fixed targetOrigin against that — and the messages here
    // carry no secrets (highlight color, transient ids) so "*" is fine.
    iframeRef.current?.contentWindow?.postMessage(
      { type: "pg-browser-host", channel, args },
      "*"
    );
  }, []);

  const navigateRef = useRef<
    (raw: string, options?: { replace?: boolean }) => void
  >(() => {});

  const handleBrowserChannel = useCallback(
    (
      channel: string,
      args: unknown[],
      surface?: {
        getURL: () => string;
        getTitle: () => string;
        getRect: () => DOMRect;
      }
    ) => {
      if (channel === "pg-selection") {
        const payload = (args[0] as SelectionPayload | null) ?? null;
        setSelection(payload);
        if (payload && surface) {
          const viewRect = surface.getRect();
          setSelectionAnchor({
            top: viewRect.top + payload.rect.top + payload.rect.height + 8,
            left:
              viewRect.left + payload.rect.left + payload.rect.width / 2,
          });
        } else {
          setSelectionAnchor(null);
        }
        return;
      }
      if (channel === "pg-page-info") {
        const info = args[0] as { url: string; title: string };
        if (info?.url) commitNavigation(info.url, info.title);
        return;
      }
      if (channel === "pg-highlight-applied") {
        const payload = args[0] as {
          id: string;
          color: string;
          text: string;
          prefix: string;
          suffix: string;
        };
        addHighlight({
          text: payload.text,
          prefix: payload.prefix,
          suffix: payload.suffix,
          color: payload.color,
          url: surface?.getURL() ?? currentUrlRef.current,
          pageTitle: surface?.getTitle() ?? "",
        });
        setSelection(null);
        return;
      }
      if (channel === "pg-highlight-failed") {
        setFlash({
          kind: "error",
          message: "Couldn't anchor that highlight — try selecting again.",
        });
        window.setTimeout(() => setFlash(null), 2200);
        return;
      }
      if (channel === "pg-navigate") {
        const href = args[0] as string;
        if (href) navigateRef.current(href);
      }
    },
    [addHighlight, commitNavigation, setFlash]
  );

  // -- webview lifecycle (Electron) ------------------------------------

  const handleWebviewRef = useCallback(
    (node: HTMLElement | null) => {
      // React fires callback refs whenever the function identity changes,
      // not just when the underlying DOM node changes. Without this guard,
      // every parent re-render would teardown+rewire the listeners and —
      // worse — reset `domReadyRef.current` to false, which silently
      // routes every subsequent navigate() into the pending queue. Skip
      // the dance when the incoming node is already the one we have wired.
      if (node && webviewRef.current === node) return;

      // Real detach (or replacement) — drop old listeners so they don't
      // accumulate across reattaches.
      if (webviewCleanupRef.current) {
        webviewCleanupRef.current();
        webviewCleanupRef.current = null;
      }

      if (!node) {
        webviewRef.current = null;
        domReadyRef.current = false;
        return;
      }
      const view = node as WebviewElement;
      webviewRef.current = view;

      const onDomReady = () => {
        domReadyRef.current = true;
        setNavState({
          canBack: view.canGoBack(),
          canForward: view.canGoForward(),
        });
        // Drain any URL the user (or the auto-homepage effect) asked for
        // before the webview was attached.
        const pending = pendingUrlRef.current;
        if (pending) {
          pendingUrlRef.current = null;
          try {
            void view.loadURL(pending);
          } catch (err) {
            console.warn("[browser] queued loadURL failed", err);
          }
        }
      };
      const onDidNavigate = (event: Event & { url?: string }) => {
        const u = event.url ?? view.getURL();
        commitNavigation(u, view.getTitle());
        setNavState({
          canBack: view.canGoBack(),
          canForward: view.canGoForward(),
        });
        setSelection(null);
        setSelectionAnchor(null);
      };
      const onDidNavigateInPage = (event: Event & { url?: string }) => {
        const u = event.url ?? view.getURL();
        commitNavigation(u, view.getTitle());
      };
      const onPageTitle = (event: Event & { title?: string }) => {
        if (event.title) setPageTitle(event.title);
      };
      const onDidStartLoading = () => setLoading(true);
      const onDidStopLoading = () => setLoading(false);
      // Surface real load failures to the user. Without this, a blocked
      // navigation (CSP, ERR_BLOCKED_BY_RESPONSE, ERR_ABORTED, etc.)
      // would silently leave the previous page on screen even though the
      // address bar has already moved on — exactly the "I pressed Enter
      // and nothing happened" symptom. We ignore -3 (user aborted) and
      // sub-frame failures, since those fire all the time during normal
      // page loads.
      const onDidFailLoad = (event: Event & {
        errorCode?: number;
        errorDescription?: string;
        validatedURL?: string;
        isMainFrame?: boolean;
      }) => {
        if (event.isMainFrame === false) return;
        if (event.errorCode === -3) return;
        setLoading(false);
        const desc = event.errorDescription || "failed to load";
        setFlash({
          kind: "error",
          message: `Couldn't load page: ${desc}`,
        });
        window.setTimeout(() => setFlash(null), 3200);
      };
      const onIpc = (event: Event) => {
        const e = event as IpcMessageEvent;
        handleBrowserChannel(e.channel, e.args, {
          getURL: () => view.getURL(),
          getTitle: () => view.getTitle(),
          getRect: () => view.getBoundingClientRect(),
        });
      };

      view.addEventListener("dom-ready", onDomReady);
      view.addEventListener("did-navigate", onDidNavigate as EventListener);
      view.addEventListener(
        "did-navigate-in-page",
        onDidNavigateInPage as EventListener
      );
      view.addEventListener(
        "page-title-updated",
        onPageTitle as EventListener
      );
      view.addEventListener("did-start-loading", onDidStartLoading);
      view.addEventListener("did-stop-loading", onDidStopLoading);
      view.addEventListener("did-fail-load", onDidFailLoad as EventListener);
      view.addEventListener("ipc-message", onIpc);

      webviewCleanupRef.current = () => {
        view.removeEventListener("dom-ready", onDomReady);
        view.removeEventListener(
          "did-navigate",
          onDidNavigate as EventListener
        );
        view.removeEventListener(
          "did-navigate-in-page",
          onDidNavigateInPage as EventListener
        );
        view.removeEventListener(
          "page-title-updated",
          onPageTitle as EventListener
        );
        view.removeEventListener("did-start-loading", onDidStartLoading);
        view.removeEventListener("did-stop-loading", onDidStopLoading);
        view.removeEventListener(
          "did-fail-load",
          onDidFailLoad as EventListener
        );
        view.removeEventListener("ipc-message", onIpc);
      };
    },
    [commitNavigation, handleBrowserChannel, setPageTitle]
  );

  // -- navigation actions ----------------------------------------------

  const navigate = useCallback(
    (raw: string, options?: { replace?: boolean }) => {
      const url = normalizeNavInput(raw);
      if (!url) return;
      setSelection(null);
      setSelectionAnchor(null);

      if (isElectron) {
        const view = webviewRef.current;
        if (view) {
          try {
            void view.loadURL(url);
            pendingUrlRef.current = null;
          } catch (err) {
            console.warn("[browser] loadURL threw, queueing instead", err);
            pendingUrlRef.current = url;
          }
        } else {
          pendingUrlRef.current = url;
        }
        commitNavigation(url);
        return;
      }

      const history = historyRef.current;
      const idx = historyIndexRef.current;
      if (options?.replace && idx >= 0) {
        history[idx] = url;
      } else {
        historyRef.current = history.slice(0, idx + 1);
        historyRef.current.push(url);
        historyIndexRef.current = historyRef.current.length - 1;
      }
      setCloudFrameSrc(buildWebProxyUrl(url));
      setLoading(true);
      commitNavigation(url);
      syncCloudNavState();
    },
    [commitNavigation, isElectron, syncCloudNavState]
  );

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const cloudGoBack = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const url = historyRef.current[historyIndexRef.current];
    setCloudFrameSrc(buildWebProxyUrl(url));
    setLoading(true);
    commitNavigation(url);
    syncCloudNavState();
  }, [commitNavigation, syncCloudNavState]);

  const cloudGoForward = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const url = historyRef.current[historyIndexRef.current];
    setCloudFrameSrc(buildWebProxyUrl(url));
    setLoading(true);
    commitNavigation(url);
    syncCloudNavState();
  }, [commitNavigation, syncCloudNavState]);

  useCloudFrameBridge({
    isElectron,
    iframeRef,
    currentUrlRef,
    onChannel: handleBrowserChannel,
  });

  // Auto-navigate on first mount if the browser has no URL yet.
  useEffect(() => {
    if (currentUrl) return;
    if (isElectron) {
      if (!preloadUrl) return;
      if (!webviewRef.current) return;
    }
    queueMicrotask(() => navigate(DEFAULT_HOMEPAGE));
  }, [currentUrl, isElectron, navigate, preloadUrl]);

  // Close on Escape, but only when no selection is active so the first
  // Escape clears the picker rather than tearing down the window.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;
        if (selection) {
          setSelection(null);
          setSelectionAnchor(null);
          return;
        }
        event.preventDefault();
        closeBrowser();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeBrowser, selection]);

  // -- highlight application -------------------------------------------

  const applyHighlight = useCallback(
    (color: string) => {
      if (!selection) return;
      const payload = {
        id: `pending-${Date.now()}`,
        color,
      };
      if (isElectron) {
        webviewRef.current?.send("pg-apply-highlight", payload);
      } else {
        postToCloudFrame("pg-apply-highlight", payload);
      }
      setActiveColor(color);
    },
    [isElectron, postToCloudFrame, selection]
  );

  // -- save as cite-able link ------------------------------------------

  const saveAsLink = useCallback(() => {
    if (!selectedWorkspaceId) {
      setFlash({
        kind: "error",
        message: "Pick a workspace before saving the page.",
      });
      window.setTimeout(() => setFlash(null), 2200);
      return;
    }
    if (!currentUrl) {
      setFlash({
        kind: "error",
        message: "Navigate to a page first.",
      });
      window.setTimeout(() => setFlash(null), 2200);
      return;
    }

    // If highlights came from multiple URLs (the user navigated mid-
    // session), bucket them by URL and create one link node per page so
    // each highlight ends up anchored to the right article snapshot.
    const buckets = new Map<string, BrowserSessionHighlight[]>();
    if (highlights.length === 0) {
      buckets.set(currentUrl, []);
    } else {
      for (const h of highlights) {
        const list = buckets.get(h.url) ?? [];
        list.push(h);
        buckets.set(h.url, list);
      }
      // Make sure the currently-viewed page is represented even if it
      // has no highlights — so "Save" on a fresh page still cites it.
      if (!buckets.has(currentUrl)) buckets.set(currentUrl, []);
    }

    const createdNodeIds: string[] = [];
    let firstNodeId: string | null = null;
    let positionOffset = 0;
    for (const [url, items] of buckets) {
      const title =
        items[0]?.pageTitle ||
        (url === currentUrl ? pageTitle : "") ||
        hostnameOf(url) ||
        "Saved page";
      const data: LinkNodeData = {
        kind: "link",
        url,
        title,
        highlights: [],
      };
      const position = {
        x: 160 + Math.random() * 60 + positionOffset,
        y: 160 + Math.random() * 60 + positionOffset,
      };
      positionOffset += 32;
      const nodeId = addNode(selectedWorkspaceId, data, position);
      createdNodeIds.push(nodeId);
      if (!firstNodeId) firstNodeId = nodeId;
      for (const h of items) {
        addWebHighlight(nodeId, h.text, h.prefix, h.suffix, h.color);
      }
    }

    pushToast({
      message:
        createdNodeIds.length === 1
          ? `Saved "${pageTitle || hostnameOf(currentUrl) || "page"}" with ${
              highlights.length
            } highlight${highlights.length === 1 ? "" : "s"}`
          : `Saved ${createdNodeIds.length} pages`,
      actionLabel: firstNodeId ? "Open" : undefined,
      onAction: firstNodeId
        ? () => {
            useStore.getState().openPanel(firstNodeId!);
          }
        : undefined,
    });
    reset();
  }, [
    addNode,
    addWebHighlight,
    currentUrl,
    highlights,
    pageTitle,
    pushToast,
    reset,
    selectedWorkspaceId,
    setFlash,
  ]);

  // Clamp the projected anchor (computed in the IPC handler above) into
  // the viewport so the picker can't render past the screen edges.
  const selectionToolbarStyle = useMemo(() => {
    if (!selection || !selectionAnchor) return null;
    if (typeof window === "undefined") return null;
    return {
      top: Math.max(
        64,
        Math.min(window.innerHeight - 60, selectionAnchor.top)
      ),
      left: Math.max(
        120,
        Math.min(window.innerWidth - 120, selectionAnchor.left)
      ),
    };
  }, [selection, selectionAnchor]);

  // -- render -----------------------------------------------------------

  const hostLabel = hostnameOf(currentUrl);
  const cannotRenderBrowser = isElectron && !!preloadError;
  const browserInitializing =
    isElectron && !preloadUrl && !preloadError && !cannotRenderBrowser;
  const cloudInitializing =
    !isElectron && !cloudFrameSrc && !cannotRenderBrowser;

  return (
    <div className="fixed inset-0 z-[64] flex items-center justify-center bg-[rgba(11,11,16,0.55)] backdrop-blur-[2px]">
      <div
        ref={containerRef}
        className="flex h-[min(94vh,940px)] w-[min(94vw,1280px)] flex-col overflow-hidden rounded-xl border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] shadow-[var(--pg-shadow-lg)]"
      >
        <BrowserChrome
          hostLabel={hostLabel}
          pageTitle={pageTitle}
          inputUrl={inputUrl}
          setInputUrl={setInputUrl}
          loading={loading}
          navState={navState}
          highlightCount={highlights.length}
          canSaveAsLink={!!currentUrl && !cannotRenderBrowser}
          onSaveAsLink={saveAsLink}
          onClose={closeBrowser}
          onBack={() => {
            if (isElectron) webviewRef.current?.goBack();
            else cloudGoBack();
          }}
          onForward={() => {
            if (isElectron) webviewRef.current?.goForward();
            else cloudGoForward();
          }}
          onReloadOrStop={() => {
            if (isElectron) {
              const view = webviewRef.current;
              if (!view) return;
              if (loading) view.stop();
              else view.reload();
              return;
            }
            if (loading) {
              setCloudFrameSrc("about:blank");
              setLoading(false);
              return;
            }
            iframeRef.current?.contentWindow?.location.reload();
          }}
          onNavigate={navigate}
        />

        {/* -- main split ------------------------------------------ */}
        <div className="flex min-h-0 flex-1">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white">
            {cannotRenderBrowser ? (
              <BrowserUnavailableState message={preloadError!} />
            ) : browserInitializing || cloudInitializing ? (
              <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--pg-muted)]">
                Initializing browser…
              </div>
            ) : isElectron ? (
              <webview
                ref={handleWebviewRef as unknown as Ref<HTMLElement>}
                src="about:blank"
                preload={preloadUrl!}
                partition="persist:browser"
                style={{
                  display: "inline-flex",
                  width: "100%",
                  height: "100%",
                }}
              />
            ) : (
              <iframe
                ref={iframeRef}
                src={cloudFrameSrc ?? undefined}
                className="pg-cloud-browser-iframe h-full w-full border-0 bg-white"
                title="In-app browser"
                // No `allow-same-origin`: the proxied page lives at our
                // origin, so without sandboxing its scripts could read
                // Supabase tokens from localStorage. Stripping it forces
                // an opaque origin and isolates the page. Some sites
                // (anything that needs to read its own cookies) will
                // render in logged-out state — acceptable tradeoff.
                sandbox="allow-scripts allow-popups allow-forms"
                onLoad={() => setLoading(false)}
              />
            )}
            {flash ? (
              <div
                className={clsx(
                  "pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border px-3 py-1.5 text-[12px] shadow-[var(--pg-shadow)]",
                  flash.kind === "error"
                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                    : "border-[var(--pg-border-strong)] bg-[var(--pg-bg-elevated)] text-[var(--pg-fg)]"
                )}
              >
                {flash.message}
              </div>
            ) : null}
          </div>

          <HighlightSidebar
            highlights={highlights}
            onRemove={removeHighlight}
            onClear={() => {
              clearHighlights();
              if (isElectron) {
                webviewRef.current?.send("pg-clear-highlights");
              } else {
                postToCloudFrame("pg-clear-highlights");
              }
            }}
          />
        </div>
      </div>

      {selection && selectionToolbarStyle ? (
        <SelectionColorToolbar
          top={selectionToolbarStyle.top}
          left={selectionToolbarStyle.left}
          onPickColor={applyHighlight}
          activeColor={activeColor ?? undefined}
          fixed
        />
      ) : null}
    </div>
  );
}

function BrowserUnavailableState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-8">
      <EmptyStateCard icon={Globe} title="Browser unavailable" hint={message} />
    </div>
  );
}

function HighlightSidebar({
  highlights,
  onRemove,
  onClear,
}: {
  highlights: BrowserSessionHighlight[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="w-[300px] shrink-0 border-l border-[var(--pg-border)] bg-[var(--pg-bg)]">
      <HighlightsListPanel
        highlights={highlights.map((h) => ({
          id: h.id,
          color: h.color,
          text: h.text,
          sortKey: h.createdAt,
          locator: hostnameOf(h.url) || "page",
        }))}
        onDelete={onRemove}
        emptyHint="Select text on the page, then pick a color to capture it."
        previewLength={140}
        headerAction={
          highlights.length > 0
            ? {
                label: "Clear",
                onClick: onClear,
                title: "Clear all highlights from this session",
              }
            : undefined
        }
        footer={
          highlights.length > 0 ? (
            <footer className="border-t border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2 text-[11px] leading-relaxed text-[var(--pg-muted)]">
              When you click{" "}
              <strong className="text-[var(--pg-fg-soft)]">Save as link</strong>,
              a new Link node lands in your workspace with each highlight
              attached and ready to <code>/cite</code>.
            </footer>
          ) : null
        }
      />
    </div>
  );
}
