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
import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Globe,
  Highlighter,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  useBrowserSession,
  type BrowserSessionHighlight,
} from "@/lib/browser-session";
import { useToastStore } from "./Toast";
import { HIGHLIGHT_COLORS } from "@/lib/defaults";
import type { LinkNodeData } from "@/lib/types";

// React's built-in `<webview>` JSX element is just a generic HTML
// element. Electron tacks a real Chromium browser API on top of it at
// runtime — those imperative methods aren't in the type defs, so we
// describe the surface we actually use here.
type WebviewElement = HTMLElement & {
  src: string;
  loadURL: (url: string) => Promise<void>;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stop: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  send: (channel: string, ...args: unknown[]) => void;
  getURL: () => string;
  getTitle: () => string;
  openDevTools: () => void;
};

type SelectionPayload = {
  text: string;
  prefix: string;
  suffix: string;
  rect: { top: number; left: number; width: number; height: number };
};

type IpcMessageEvent = Event & {
  channel: string;
  args: unknown[];
};

const DEFAULT_HOMEPAGE = "https://www.google.com";

function normalizeNavInput(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  // If it looks like a URL with a protocol, take it as-is.
  if (/^https?:\/\//i.test(value)) return value;
  // Bare hostname (contains a dot, no spaces) → assume https.
  if (!/\s/.test(value) && /\./.test(value)) return `https://${value}`;
  // Anything else: treat as a search query.
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isElectronEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  const pg = (window as unknown as {
    studygit?: { getWebviewPreloadUrl?: () => Promise<string> };
  }).studygit;
  return !!pg?.getWebviewPreloadUrl;
}

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

  const [preloadUrl, setPreloadUrl] = useState<string | null>(null);
  const [preloadError, setPreloadError] = useState<string | null>(null);
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

  // -- preload URL discovery -------------------------------------------

  useEffect(() => {
    let cancelled = false;
    if (!isElectron) {
      // Defer to a microtask so the setState doesn't fire synchronously
      // during the effect body — same pattern used elsewhere in the
      // codebase for the "read once at mount" idiom.
      queueMicrotask(() => {
        if (!cancelled) {
          setPreloadError(
            "The in-app browser only runs inside the Studygit desktop app."
          );
        }
      });
      return () => {
        cancelled = true;
      };
    }
    const pg = (window as unknown as {
      studygit?: { getWebviewPreloadUrl?: () => Promise<string> };
    }).studygit;
    pg?.getWebviewPreloadUrl?.()
      .then((url) => {
        if (!cancelled) setPreloadUrl(url);
      })
      .catch((err: Error) => {
        if (!cancelled) setPreloadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [isElectron]);

  // -- webview lifecycle ------------------------------------------------

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
        if (e.channel === "pg-selection") {
          const payload = (e.args[0] as SelectionPayload | null) ?? null;
          setSelection(payload);
          if (payload) {
            // Project the webview-local selection rect into screen
            // coords *now* (in the event handler) so render never has to
            // touch the ref. The picker re-pins itself on every fresh
            // selection event, which mirrors how user selections work.
            const viewRect = view.getBoundingClientRect();
            setSelectionAnchor({
              top:
                viewRect.top +
                payload.rect.top +
                payload.rect.height +
                8,
              left:
                viewRect.left +
                payload.rect.left +
                payload.rect.width / 2,
            });
          } else {
            setSelectionAnchor(null);
          }
        } else if (e.channel === "pg-page-info") {
          const info = e.args[0] as { url: string; title: string };
          if (info?.url) commitNavigation(info.url, info.title);
        } else if (e.channel === "pg-highlight-applied") {
          const payload = e.args[0] as {
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
            url: view.getURL(),
            pageTitle: view.getTitle(),
          });
          setSelection(null);
        } else if (e.channel === "pg-highlight-failed") {
          setFlash({
            kind: "error",
            message: "Couldn't anchor that highlight — try selecting again.",
          });
          window.setTimeout(() => setFlash(null), 2200);
        }
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
    [addHighlight, commitNavigation, setFlash, setPageTitle]
  );

  // -- navigation actions ----------------------------------------------

  const navigate = useCallback(
    (raw: string) => {
      const url = normalizeNavInput(raw);
      if (!url) return;
      const view = webviewRef.current;
      setSelection(null);
      setSelectionAnchor(null);
      // Optimistically try loadURL whenever we have a view ref. The
      // previously-used `domReadyRef.current` gate was unreliable —
      // React's callback-ref churn could leave the flag false even
      // after the webview was fully alive, which silently routed every
      // address-bar Enter into pendingUrlRef and never drained it.
      // Electron only refuses loadURL before the very first dom-ready
      // wiring, so a try/catch covers the cold-start case cleanly.
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
    },
    [commitNavigation]
  );

  // Auto-navigate on first mount if the webview has no URL yet. The
  // homepage launch is wrapped in a microtask so the cascade of state
  // updates (commitNavigation -> setInputUrl/setCurrentUrl) doesn't fire
  // synchronously inside the effect body — same pattern used for theme
  // / titlebar setup elsewhere in the app.
  useEffect(() => {
    if (!preloadUrl) return;
    const view = webviewRef.current;
    if (!view) return;
    if (currentUrl) return;
    queueMicrotask(() => navigate(DEFAULT_HOMEPAGE));
  }, [preloadUrl, currentUrl, navigate]);

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
      const view = webviewRef.current;
      if (!view || !selection) return;
      // The id is just for round-trip correlation between host + webview.
      // The persisted highlight id comes from `addHighlight` (nanoid).
      view.send("pg-apply-highlight", {
        id: `pending-${Date.now()}`,
        color,
      });
      setActiveColor(color);
    },
    [selection]
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
  const cannotRenderWebview = !!preloadError;

  return (
    <div className="fixed inset-0 z-[64] flex items-center justify-center bg-[rgba(11,11,16,0.55)] backdrop-blur-[2px]">
      <div
        ref={containerRef}
        className="flex h-[min(94vh,940px)] w-[min(94vw,1280px)] flex-col overflow-hidden rounded-xl border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] shadow-[var(--pg-shadow-lg)]"
      >
        {/* -- titlebar --------------------------------------------- */}
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2.5">
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--pg-fg-soft)]">
            <Globe size={13} className="text-[var(--pg-muted)]" />
            <span className="pg-section-label">Browser</span>
            {hostLabel ? (
              <>
                <span className="text-[var(--pg-muted-soft)]">·</span>
                <span className="truncate text-[12px] text-[var(--pg-fg)]">
                  {pageTitle || hostLabel}
                </span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={saveAsLink}
              disabled={!currentUrl || cannotRenderWebview}
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--pg-accent)] px-2.5 text-[12px] text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              title="Save the current page as a cite-able link node"
            >
              <BookmarkPlus size={12} />
              Save as link
              {highlights.length > 0 ? (
                <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white/25 px-1 text-[10px]">
                  {highlights.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={closeBrowser}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              title="Close browser (Esc)"
            >
              <X size={13} />
            </button>
          </div>
        </header>

        {/* -- nav bar ---------------------------------------------- */}
        <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-[var(--pg-border)] px-2">
          <button
            type="button"
            onClick={() => webviewRef.current?.goBack()}
            disabled={!navState.canBack}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)] disabled:opacity-40"
            title="Back"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => webviewRef.current?.goForward()}
            disabled={!navState.canForward}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)] disabled:opacity-40"
            title="Forward"
          >
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              const view = webviewRef.current;
              if (!view) return;
              if (loading) view.stop();
              else view.reload();
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            title={loading ? "Stop" : "Reload"}
          >
            {loading ? (
              <X size={14} />
            ) : (
              <RefreshCw size={14} />
            )}
          </button>
          <form
            className="flex flex-1 items-center"
            onSubmit={(event) => {
              event.preventDefault();
              navigate(inputUrl);
            }}
          >
            <input
              value={inputUrl}
              onChange={(event) => setInputUrl(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="Search or paste a URL"
              className="h-7 w-full rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2.5 font-mono text-[12px] text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)] focus:border-[var(--pg-accent)] focus:bg-[var(--pg-bg)]"
            />
          </form>
          <span
            className={clsx(
              "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[10.5px]",
              loading
                ? "bg-[var(--pg-bg-subtle)] text-[var(--pg-muted)]"
                : "text-[var(--pg-muted-soft)]"
            )}
            title={loading ? "Loading…" : "Idle"}
          >
            {loading ? "loading…" : "idle"}
          </span>
        </div>

        {/* -- main split ------------------------------------------ */}
        <div className="flex min-h-0 flex-1">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white">
            {cannotRenderWebview ? (
              <DesktopOnlyState message={preloadError!} />
            ) : !preloadUrl ? (
              <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--pg-muted)]">
                Initializing browser…
              </div>
            ) : (
              <webview
                ref={handleWebviewRef as unknown as Ref<HTMLElement>}
                src="about:blank"
                preload={preloadUrl}
                partition="persist:browser"
                style={{
                  display: "inline-flex",
                  width: "100%",
                  height: "100%",
                }}
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
              webviewRef.current?.send("pg-clear-highlights");
            }}
          />
        </div>
      </div>

      {selection && selectionToolbarStyle ? (
        <div
          className="fixed z-[80] -translate-x-1/2 rounded-lg border border-[var(--pg-border-strong)] bg-[var(--pg-bg-elevated)] p-1 shadow-[var(--pg-shadow-lg)]"
          style={selectionToolbarStyle}
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="flex items-center gap-0.5">
            <Highlighter
              size={12}
              className="ml-1 mr-0.5 text-[var(--pg-muted)]"
            />
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => applyHighlight(color)}
                className={clsx(
                  "h-5 w-5 rounded-full border border-white/20 transition-transform hover:scale-110",
                  activeColor === color && "ring-1 ring-[var(--pg-accent)]"
                )}
                style={{ backgroundColor: color }}
                aria-label={`Highlight ${color}`}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DesktopOnlyState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-8">
      <div className="max-w-md text-center">
        <Globe size={28} className="mx-auto mb-2 text-[var(--pg-muted)]" />
        <div className="mb-1 text-sm font-semibold text-[var(--pg-fg)]">
          Browser unavailable
        </div>
        <p className="text-[12px] text-[var(--pg-fg-soft)]">{message}</p>
        <p className="mt-3 text-[11px] text-[var(--pg-muted)]">
          You can still add a Link node from the dock and paste a URL — the
          reader-view + highlight flow works in the browser too.
        </p>
      </div>
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
  const sorted = useMemo(
    () => highlights.slice().sort((a, b) => a.createdAt - b.createdAt),
    [highlights]
  );

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-[var(--pg-border)] bg-[var(--pg-bg)]">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--pg-border)] px-3">
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--pg-muted)]">
          <Highlighter size={12} />
          Highlights
          {highlights.length ? (
            <span className="text-[var(--pg-fg-soft)]">{highlights.length}</span>
          ) : null}
        </div>
        {highlights.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-1.5 py-0.5 text-[10.5px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            title="Clear all highlights from this session"
          >
            Clear
          </button>
        ) : null}
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {sorted.length === 0 ? (
          <div className="mt-8 px-3 text-center">
            <div className="mx-auto mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] text-[var(--pg-muted)]">
              <Highlighter size={14} />
            </div>
            <p className="text-[12px] text-[var(--pg-fg-soft)]">
              No highlights yet
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--pg-muted)]">
              Select text on the page, then pick a color to capture it.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {sorted.map((h) => {
              const preview =
                h.text.length > 140
                  ? h.text.slice(0, 140).trimEnd() + "…"
                  : h.text;
              return (
                <div
                  key={h.id}
                  className="group relative overflow-hidden rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-2 pl-3 text-left"
                >
                  <span
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ backgroundColor: h.color }}
                    aria-hidden
                  />
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--pg-muted)]">
                    <span className="truncate">{hostnameOf(h.url) || "page"}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(h.id)}
                      className="opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                      title="Remove highlight"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                  <p className="line-clamp-3 text-[12.5px] leading-relaxed text-[var(--pg-fg)]">
                    {preview}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {highlights.length > 0 ? (
        <footer className="border-t border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2 text-[11px] leading-relaxed text-[var(--pg-muted)]">
          When you click <strong className="text-[var(--pg-fg-soft)]">Save as link</strong>,
          a new Link node lands in your workspace with each highlight attached
          and ready to <code>/cite</code>.
        </footer>
      ) : null}
    </aside>
  );
}
