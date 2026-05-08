import {
  app,
  BrowserWindow,
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
const APP_NAME = "personalGit";
const DEV_URL = process.env.ELECTRON_DEV_URL ?? null;

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;
let resolvedAppUrl: string | null = null;

// --------------------------------------------------------------------------
// Single-instance lock — desktop apps should only ever have one running
// instance per user; second launches just focus the existing window.
// --------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
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
    //   macOS  — Apple-drawn close/minimise buttons fade in when the cursor
    //            enters the top-left corner ("customButtonsOnHover").
    //   win/lx — a thin titleBarOverlay paints native min/max/close buttons
    //            on the right edge of our header.
    ...(process.platform === "darwin"
      ? ({
          frame: false,
          titleBarStyle: "customButtonsOnHover",
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
    },
  });

  win.once("ready-to-show", () => {
    win.show();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
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

  void win.loadURL(`${appUrl}/app`);
  return win;
}

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

function wireAutoUpdate(): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (status: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("personalgit:update-status", status);
    }
  };

  autoUpdater.on("checking-for-update", () => send({ kind: "checking" }));
  autoUpdater.on("update-available", (info) =>
    send({ kind: "available", version: info.version })
  );
  autoUpdater.on("update-not-available", () => send({ kind: "not-available" }));
  autoUpdater.on("download-progress", (p) =>
    send({ kind: "downloading", percent: p.percent })
  );
  autoUpdater.on("update-downloaded", (info) =>
    send({ kind: "ready", version: info.version })
  );
  autoUpdater.on("error", (err) =>
    send({ kind: "error", message: err.message })
  );

  ipcMain.on("personalgit:install-update", () => {
    autoUpdater.quitAndInstall();
  });

  const tick = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn("[updater] check failed:", err.message);
    });
  };
  setTimeout(tick, 10_000);
  setInterval(tick, 6 * 60 * 60 * 1000);
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
    mainWindow = createMainWindow(appUrl);
    wireAutoUpdate();
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

ipcMain.on("personalgit:noop", (_evt: IpcMainEvent) => {
  // Reserved channel; kept so the preload's API surface is exercised in dev.
});
