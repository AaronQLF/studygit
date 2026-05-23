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
import { ChildProcess, fork } from "node:child_process";
import { createServer } from "node:net";
import * as http from "node:http";
import * as path from "node:path";
import * as fs from "node:fs";

// --------------------------------------------------------------------------
// Constants and runtime mode
// --------------------------------------------------------------------------

const PREFERRED_PORT = 47821;
const APP_NAME = "Studygit";
const DEV_URL = process.env.ELECTRON_DEV_URL ?? null;

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;
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

// Hard cap on how long we wait for the embedded Next server to become
// reachable. If we hit this, something is very wrong (port already taken
// by a non-Next process, native module rebuild missing, etc.) and we
// surface a real error rather than a perpetual splash.
const SERVER_READY_TIMEOUT_MS = 30_000;

// --------------------------------------------------------------------------
// Port discovery
// --------------------------------------------------------------------------

function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

function ephemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen({ port: 0, host: "127.0.0.1", exclusive: true }, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("Failed to acquire ephemeral port"));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
  });
}

async function pickPort(): Promise<number> {
  if (await probePort(PREFERRED_PORT)) return PREFERRED_PORT;
  return ephemeralPort();
}

// --------------------------------------------------------------------------
// Embedded Next.js standalone server
// --------------------------------------------------------------------------

function resolveStandaloneServerEntry(): string {
  // When packaged with `asarUnpack: ["**/.next/standalone/**"]`, the
  // standalone build lives outside the asar so child_process.fork can load
  // it directly.
  const candidates = app.isPackaged
    ? [
        path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          ".next",
          "standalone",
          "server.js"
        ),
        path.join(process.resourcesPath, "app", ".next", "standalone", "server.js"),
      ]
    : [path.join(__dirname, "..", "..", ".next", "standalone", "server.js")];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Could not locate Next.js standalone server. Looked in:\n${candidates.join(
      "\n"
    )}`
  );
}

function startNextServer(port: number): ChildProcess {
  const serverEntry = resolveStandaloneServerEntry();
  const storageRoot = app.getPath("userData");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    PERSISTENCE: "file",
    STORAGE_ROOT: storageRoot,
    // Preserve the original PATH but strip variables that would let the
    // embedded server try to reach the public internet for things it
    // shouldn't (e.g. Next telemetry).
    NEXT_TELEMETRY_DISABLED: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_DEV_URL;

  const child = fork(serverEntry, [], {
    cwd: path.dirname(serverEntry),
    env,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[next] ${chunk}`);
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[next] ${chunk}`);
  });
  child.on("exit", (code, signal) => {
    console.error(`[next] exited (code=${code}, signal=${signal})`);
    nextProcess = null;
    if (!app.isQuitting) {
      // If the embedded server dies under us, take the whole app down so
      // the user gets a clean restart rather than a half-broken window.
      app.quit();
    }
  });

  return child;
}

function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          retry();
        }
      });
      req.on("error", retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(attempt, 250);
    };
    attempt();
  });
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
    if (isInternalUrl(url)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  win.webContents.on("did-finish-load", () => {
    // Re-prompt when the page finishes loading if a download completed
    // while the splash was up, or if the user relaunched with a staged
    // update still sitting in ~/Library/Caches/studygit-updater/.
    maybePromptPendingUpdate();
  });

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
    let appUrl: string;
    if (DEV_URL) {
      // Dev mode: the user already started `next dev` on a known URL and
      // we just attach to it.
      appUrl = DEV_URL;
      await waitForServer(appUrl, SERVER_READY_TIMEOUT_MS);
    } else {
      const port = await pickPort();
      nextProcess = startNextServer(port);
      appUrl = `http://127.0.0.1:${port}`;
      await waitForServer(appUrl, SERVER_READY_TIMEOUT_MS);
    }
    resolvedAppUrl = appUrl;
    // Preload reads this when the window is constructed.
    process.env.STUDYGIT_APP_VERSION = app.getVersion();
    wireAutoUpdate();
    mainWindow = createMainWindow(appUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[main] failed to start embedded server:", message);
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    app.quit();
  }
}

app.on("before-quit", () => {
  app.isQuitting = true;
  if (nextProcess && !nextProcess.killed) {
    nextProcess.kill();
  }
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
