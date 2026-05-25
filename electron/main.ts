import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  Menu,
  type IpcMainEvent,
} from "electron";
import { autoUpdater } from "electron-updater";
import * as path from "node:path";
import * as fs from "node:fs";

// --------------------------------------------------------------------------
// Constants and runtime mode
// --------------------------------------------------------------------------

const APP_NAME = "Studygit";

// `ELECTRON_DEV_URL` is set by `npm run electron:dev` so the shell points
// at the developer's local `next dev` server instead of the production
// deployment. `STUDYGIT_HOSTED_URL` lets ops point preview builds at a
// staging URL (e.g. a Vercel preview deployment) without recompiling.
// Falls back to the stable production alias.
const DEV_URL = process.env.ELECTRON_DEV_URL ?? null;
const HOSTED_URL =
  process.env.STUDYGIT_HOSTED_URL ?? "https://studygit-tau.vercel.app";

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let resolvedAppUrl: string | null = null;

// Keep the dev electron's Chromium state (singleton lock, cookies, cache)
// separate from the packaged build's. Otherwise launching the packaged
// app while `npm run electron:dev` is running denies the new singleton
// lock and dispatches `second-instance` to the dev process — which is
// fine, except any subtle bug there crashes the dev session.
if (!app.isPackaged) {
  app.setPath("userData", path.join(app.getPath("appData"), `${APP_NAME}Dev`));
}

// Install global error handlers as early as possible. Anything that fires
// before `whenReady()` (e.g. `second-instance` while the window is still
// being created) would otherwise take the process down with Electron's
// default uncaught-exception dialog.
process.on("uncaughtException", (err) => {
  console.error("[main] uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[main] unhandled rejection:", reason);
});

// --------------------------------------------------------------------------
// Single-instance lock — desktop apps should only ever have one running
// instance per user; second launches just focus the existing window.
// --------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // The JS reference to a BrowserWindow can outlive the underlying
    // native window: once that's torn down, *any* method call on the
    // wrapper throws "Object has been destroyed". Guard for both the
    // null-out path and the stale-reference path before touching it.
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

// --------------------------------------------------------------------------
// Offline fallback
// --------------------------------------------------------------------------
//
// The shell is a thin window over the hosted Vercel deployment, so it
// depends on a working network connection to do anything. When the page
// fails to load (offline, DNS failure, Vercel outage, certificate
// error), we replace Chromium's default "this site can't be reached"
// chrome with something that matches the app's aesthetic and offers a
// one-click retry. The page is inlined as a data URL so it works even
// when nothing else does.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function offlineDataUrl(retryUrl: string, message: string): string {
  // Both interpolations are HTML-escaped; the retry URL is *also*
  // JSON-encoded so it survives being assigned to `location.href` from a
  // string literal without breaking on the quote characters that legal
  // URLs sometimes contain (encoded brackets, etc.).
  const safeRetry = JSON.stringify(retryUrl);
  const safeMsg = escapeHtml(message || "");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Studygit — offline</title>
<style>
  :root { color-scheme: dark; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0b0b10;
    color: #ede4d3;
    font: 14px/1.5 -apple-system, "SF Pro Text", system-ui, sans-serif;
    -webkit-app-region: drag;
  }
  .card {
    -webkit-app-region: no-drag;
    max-width: 360px;
    padding: 24px;
    text-align: center;
  }
  h1 { margin: 0 0 8px; font-size: 16px; font-weight: 600; }
  p { margin: 0 0 16px; color: #a9997f; }
  .reason {
    font-family: ui-monospace, "SF Mono", monospace;
    font-size: 12px;
    opacity: 0.7;
    word-break: break-word;
  }
  button {
    background: #c44a2b; color: white; border: 0;
    padding: 8px 14px; border-radius: 6px;
    font-size: 13px; font-weight: 500; cursor: pointer;
  }
  button:hover { opacity: 0.9; }
</style>
</head>
<body>
  <div class="card">
    <h1>Can't reach Studygit</h1>
    <p>Studygit needs an internet connection to load your workspace.</p>
    <p class="reason">${safeMsg}</p>
    <button onclick="location.href = ${safeRetry}">Try again</button>
  </div>
</body>
</html>`;
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

// --------------------------------------------------------------------------
// Windows
// --------------------------------------------------------------------------

function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 240,
    frame: false,
    transparent: false,
    resizable: false,
    movable: true,
    show: true,
    backgroundColor: "#0b0b10",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.on("closed", () => {
    splashWindow = null;
  });
  void win.loadFile(path.join(__dirname, "..", "splash.html"));
  return win;
}

function createMainWindow(appUrl: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: "#0b0b10",
    title: APP_NAME,
    // Drop the native title bar in favour of our in-app header (see
    // AppShell.tsx). Window controls are still reachable:
    //   macOS  — Apple-drawn traffic lights are kept permanently visible
    //            ("hidden" titleBarStyle keeps them painted while removing
    //            the native title bar). We nudge them down so they vertically
    //            centre inside our 40px header; AppShell reserves 72px of
    //            left padding for them.
    //   win/lx — a thin titleBarOverlay paints native min/max/close buttons
    //            on the right edge of our header.
    ...(process.platform === "darwin"
      ? ({
          frame: false,
          titleBarStyle: "hidden",
          trafficLightPosition: { x: 12, y: 14 },
        } as const)
      : ({
          frame: false,
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: "#0b0b10",
            symbolColor: "#9ca3af",
            height: 40,
          },
        } as const)),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Keep the renderer locked to the embedded loopback origin. Anything
      // else opens in the OS browser (see setWindowOpenHandler below).
      webSecurity: true,
      // Allow <webview> tags so the in-app Browser feature can host live
      // third-party pages. The actual attach is policed in
      // `will-attach-webview` below — we force-pin the preload path,
      // strip nodeIntegration, and confine each webview to its own
      // partition so cookies don't bleed back into the app shell.
      webviewTag: true,
    },
  });

  // Lock down every webview the renderer tries to attach. Without this,
  // a compromised page (or a careless attribute) could opt out of
  // sandboxing or load arbitrary preload code.
  win.webContents.on("will-attach-webview", (_event, webPreferences, params) => {
    // Force the preload to our trusted file regardless of what the
    // renderer attribute says — Electron's `webPreferences` carries the
    // legacy `preloadURL` slot and the modern `preload` path; clobber
    // both so a tampered renderer can't smuggle a different script.
    const wp = webPreferences as Record<string, unknown>;
    delete wp.preloadURL;
    delete wp.preload;
    wp.preload = resolveWebviewPreloadPath();
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = false;
    params.allowpopups = "false";
    if (!params.partition || !params.partition.startsWith("persist:browser")) {
      params.partition = "persist:browser";
    }
  });

  win.once("ready-to-show", () => {
    win.show();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  });

  win.on("closed", () => {
    // Drop the dead reference so anything that fires after the window is
    // torn down (second-instance, autoUpdater broadcast, etc.) doesn't
    // crash on `Object has been destroyed`.
    mainWindow = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url) || isAuthFlowUrl(url)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isInternalUrl(url) || isAuthFlowUrl(url)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  win.webContents.on("did-finish-load", () => {
    // Re-prompt when the page finishes loading if a download completed
    // while the splash was up, or if the user relaunched with a staged
    // update still sitting in ~/Library/Caches/studygit-updater/.
    maybePromptPendingUpdate();
  });

  // Network-failure fallback. Catches the cases where the hosted page
  // can't load at all (offline, DNS failure, Vercel outage, TLS error,
  // sandbox is up but firewall blocks the domain). We ignore:
  //   -3  ABORTED — user-initiated navigation interruption (e.g. clicked
  //                 another link before the first one finished). Showing
  //                 the offline page here would clobber the legitimate
  //                 in-flight navigation.
  //   subframe failures — only main-frame failures break the whole UX.
  win.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      if (errorCode === -3) return;
      // Don't recurse if the offline page itself fails to load.
      if (validatedURL.startsWith("data:")) return;
      const retry = validatedURL || `${appUrl}/app`;
      const reason = errorDescription
        ? `${errorDescription} (${errorCode})`
        : `Network error (${errorCode})`;
      void win.loadURL(offlineDataUrl(retry, reason));
    }
  );

  void win.loadURL(`${appUrl}/app`);
  return win;
}

// Resolve the path the in-app browser <webview> uses as its preload
// script. The compiled webview-preload.js sits next to this file in
// `electron/dist/`. In the packaged app it's pulled out of asar via
// `asarUnpack` (see electron-builder.yml) so Chromium can load it as a
// plain file:// URL — webview preloads must be on disk, not inside an
// archive.
function resolveWebviewPreloadPath(): string {
  const local = path.join(__dirname, "webview-preload.js");
  if (app.isPackaged) {
    const unpacked = local.replace(
      `${path.sep}app.asar${path.sep}`,
      `${path.sep}app.asar.unpacked${path.sep}`
    );
    return fs.existsSync(unpacked) ? unpacked : local;
  }
  return local;
}

function webviewPreloadFileUrl(): string {
  const p = resolveWebviewPreloadPath();
  // Cross-platform absolute path → file URL (handles Windows drive letters
  // and spaces correctly without pulling in the deprecated `url` helpers).
  const normalized = p.replace(/\\/g, "/");
  const prefix = normalized.startsWith("/") ? "file://" : "file:///";
  return prefix + encodeURI(normalized);
}

ipcMain.handle("studygit:get-webview-preload-url", () =>
  webviewPreloadFileUrl()
);

function isInternalUrl(url: string): boolean {
  if (!resolvedAppUrl) return false;
  try {
    const parsed = new URL(url);
    const base = new URL(resolvedAppUrl);
    return parsed.host === base.host && parsed.protocol === base.protocol;
  } catch {
    return false;
  }
}

// Hosts the Supabase OAuth flow legitimately navigates the main window
// through: Google's sign-in / consent / 2FA pages, Google's OAuth token
// endpoints, and the Supabase project callback. Without this allow-list
// every OAuth redirect would get punted to the OS browser by the
// `will-navigate` handler above, which kills the flow halfway through.
const AUTH_FLOW_HOST_PATTERNS: RegExp[] = [
  /(?:^|\.)accounts\.google\.com$/i,
  /(?:^|\.)accounts\.youtube\.com$/i,
  /(?:^|\.)oauth2\.googleapis\.com$/i,
  /(?:^|\.)myaccount\.google\.com$/i,
  /(?:^|\.)ssl\.gstatic\.com$/i,
  /(?:^|\.)supabase\.co$/i,
  /(?:^|\.)supabase\.in$/i,
];

function isAuthFlowUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    return AUTH_FLOW_HOST_PATTERNS.some((re) => re.test(parsed.hostname));
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------
// Auto-update
// --------------------------------------------------------------------------

type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "not-available"; version: string }
  | { kind: "downloading"; percent: number; version?: string }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string };

// Cached so a renderer that mounts after a status event has already fired
// (e.g. the 6-hour interval check that completes mid-session) can still
// query the latest state via `studygit:get-update-status`.
let latestUpdateStatus: UpdateStatus = { kind: "idle" };
let updaterWired = false;
// Set when an update finishes downloading before the main window exists,
// or when the native prompt is waiting for the page to finish loading.
let pendingUpdatePromptVersion: string | null = null;
let updatePromptOpen = false;

async function promptRestartForUpdate(version: string): Promise<void> {
  if (updatePromptOpen) return;
  const win =
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  if (!win) {
    pendingUpdatePromptVersion = version;
    return;
  }
  updatePromptOpen = true;
  try {
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      title: "Update ready",
      message: `Studygit v${version} is ready to install.`,
      detail:
        "Restart now to finish updating. Your work is saved automatically.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  } finally {
    updatePromptOpen = false;
  }
}

function maybePromptPendingUpdate(): void {
  if (latestUpdateStatus.kind === "ready") {
    void promptRestartForUpdate(latestUpdateStatus.version);
    return;
  }
  if (pendingUpdatePromptVersion) {
    const version = pendingUpdatePromptVersion;
    pendingUpdatePromptVersion = null;
    void promptRestartForUpdate(version);
  }
}

function wireAutoUpdate(): void {
  if (updaterWired) return;
  updaterWired = true;

  // Manual checks are always available so the "Check for updates" menu
  // item works in dev builds too; only the periodic auto-check is gated
  // on `app.isPackaged` since unpackaged builds have no real version to
  // compare against.
  autoUpdater.autoDownload = true;
  // NOTE: this flag is misleading on macOS. MacUpdater extends AppUpdater
  // (not BaseUpdater) and never registers a `before-quit` hook — it only
  // uses this flag to decide whether to auto-trigger Squirrel.Mac's
  // checkForUpdates after the JS-side download finishes. The actual
  // bundle swap on macOS only happens when the renderer explicitly calls
  // `installUpdateAndRestart` (handled below as `studygit:install-update`).
  // See components/UpdateBanner.tsx for the renderer side.
  autoUpdater.autoInstallOnAppQuit = true;
  // Funnel updater chatter into the same console stream as the rest of
  // the main process. Without a logger the unified system log was empty
  // when the auto-updater silently failed to apply a downloaded update —
  // having `[updater] checking for update`, `update-downloaded`, etc.
  // visible in `Console.app` makes the same class of bug debuggable
  // without a source rebuild.
  autoUpdater.logger = {
    info: (msg) => console.log(`[updater] ${String(msg)}`),
    warn: (msg) => console.warn(`[updater] ${String(msg)}`),
    error: (msg) => console.error(`[updater] ${String(msg)}`),
    debug: (msg) => console.log(`[updater:debug] ${String(msg)}`),
  };

  const broadcast = (status: UpdateStatus) => {
    latestUpdateStatus = status;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("studygit:update-status", status);
    }
  };

  autoUpdater.on("checking-for-update", () => broadcast({ kind: "checking" }));
  autoUpdater.on("update-available", (info) =>
    broadcast({ kind: "available", version: info.version })
  );
  autoUpdater.on("update-not-available", (info) =>
    broadcast({ kind: "not-available", version: info.version })
  );
  autoUpdater.on("download-progress", (p) =>
    broadcast({
      kind: "downloading",
      percent: p.percent,
      version:
        latestUpdateStatus.kind === "available"
          ? latestUpdateStatus.version
          : undefined,
    })
  );
  autoUpdater.on("update-downloaded", (info) => {
    broadcast({ kind: "ready", version: info.version });
    // macOS never applies a downloaded update on quit — the user must
    // explicitly restart via quitAndInstall(). A native dialog works even
    // when the renderer hasn't mounted yet or the user isn't signed in
    // (the in-app UserMenu is auth-gated).
    void promptRestartForUpdate(info.version);
  });
  autoUpdater.on("error", (err) =>
    broadcast({ kind: "error", message: err.message })
  );

  ipcMain.on("studygit:install-update", () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle("studygit:get-app-version", () => app.getVersion());

  ipcMain.handle("studygit:get-update-status", () => latestUpdateStatus);

  ipcMain.handle("studygit:check-for-updates", async () => {
    if (!app.isPackaged) {
      // electron-updater throws on unpackaged dev builds; surface a
      // friendlier message to the renderer so the manual-check button
      // doesn't look broken in dev.
      broadcast({
        kind: "error",
        message: "Auto-update is only available in packaged builds.",
      });
      return;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      broadcast({ kind: "error", message });
    }
  });

  if (app.isPackaged) {
    const tick = () => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.warn("[updater] check failed:", err.message);
      });
    };
    setTimeout(tick, 3_000);
    setInterval(tick, 6 * 60 * 60 * 1000);
  }
}

// --------------------------------------------------------------------------
// App lifecycle
// --------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Electron {
    interface App {
      isQuitting?: boolean;
    }
  }
}

async function bootstrap(): Promise<void> {
  app.setName(APP_NAME);
  Menu.setApplicationMenu(null);

  splashWindow = createSplashWindow();

  try {
    // Thin shell. The renderer lives on Vercel (or wherever
    // STUDYGIT_HOSTED_URL points). The dev override lets `electron:dev`
    // attach to a local `next dev` for fast iteration. There is no
    // embedded Next server in the packaged build — every API route,
    // every Supabase call, every R2 upload runs on the hosted backend.
    // That keeps R2 credentials and the service-role key out of the
    // installer.
    const appUrl = DEV_URL ?? HOSTED_URL;
    resolvedAppUrl = appUrl;
    console.log(`[main] pointing main window at ${appUrl}`);
    // Preload reads this when the window is constructed.
    process.env.STUDYGIT_APP_VERSION = app.getVersion();
    wireAutoUpdate();
    mainWindow = createMainWindow(appUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[main] failed to start:", message);
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    app.quit();
  }
}

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }
  if (resolvedAppUrl) {
    mainWindow = createMainWindow(resolvedAppUrl);
  }
});

app.whenReady().then(bootstrap).catch((err) => {
  console.error("[main] bootstrap failed:", err);
  app.quit();
});

// Tighten the default web-contents permissions: deny all by default, allow
// only what the renderer demonstrably needs.
app.on("web-contents-created", (_evt, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });
});

ipcMain.on("studygit:noop", (_evt: IpcMainEvent) => {
  // Reserved channel; kept so the preload's API surface is exercised in dev.
});
