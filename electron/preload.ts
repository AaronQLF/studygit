import { contextBridge, ipcRenderer } from "electron";

// Minimal renderer surface. The renderer is just a Next.js app loaded over
// HTTP, so almost everything goes through the embedded server. This bridge
// only exposes what the page literally cannot get from `window.location` —
// the packaged app version and the updater channel.

// Mirror of the union main.ts broadcasts on `studygit:update-status`. Keep
// the field names identical (in particular, both `available` and
// `not-available` carry a `version`) so the UpdateBanner doesn't have to
// branch differently from the main process.
type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "not-available"; version: string }
  | { kind: "downloading"; percent: number; version?: string }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string };

// Mirrors the result shape of the `studygit:ai-fetch` IPC handler in
// electron/main.ts. Kept inline (rather than imported) because the
// preload TS project doesn't compile against the rest of the app.
type AiFetchRequest = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: unknown;
  temperature?: number;
};
type AiFetchResult =
  | { ok: true; json: unknown }
  | {
      ok: false;
      kind: "provider" | "network" | "timeout" | "bad-input";
      status?: number;
      message: string;
      details?: string;
    };

contextBridge.exposeInMainWorld("studygit", {
  appVersion: process.env.STUDYGIT_APP_VERSION ?? "dev",
  platform: process.platform,
  // Subscribe to live updater events. Returns an unsubscribe fn.
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, status: UpdateStatus) =>
      callback(status);
    ipcRenderer.on("studygit:update-status", listener);
    return () => ipcRenderer.removeListener("studygit:update-status", listener);
  },
  // The 'ready' event can fire before any renderer has mounted (the auto
  // check fires 10s after launch and again every 6h). Without this getter,
  // a fresh page load would never see a download that completed in a
  // previous renderer lifetime — the user would be stuck on an outdated
  // version with the update silently sitting on disk.
  getUpdateStatus: (): Promise<UpdateStatus> =>
    ipcRenderer.invoke("studygit:get-update-status"),
  // Manual "Check for updates…" path; main.ts gracefully short-circuits
  // this in unpackaged dev builds.
  checkForUpdates: (): Promise<void> =>
    ipcRenderer.invoke("studygit:check-for-updates"),
  // Triggers electron-updater's quitAndInstall(). On macOS this is the
  // ONLY way the staged update actually gets applied — MacUpdater does
  // NOT install on quit despite `autoInstallOnAppQuit` being true (see
  // electron-updater MacUpdater.js: that flag only gates whether
  // Squirrel.Mac's own checkForUpdates is auto-triggered post-download).
  installUpdateAndRestart: () => ipcRenderer.send("studygit:install-update"),
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke("studygit:get-app-version"),
  // file:// URL the in-app Browser <webview> attaches as its preload.
  // Returned async because the path is only known to the main process —
  // it depends on whether we're running packaged (out of asar.unpacked)
  // or unpackaged (out of electron/dist next to this file).
  getWebviewPreloadUrl: (): Promise<string> =>
    ipcRenderer.invoke("studygit:get-webview-preload-url"),

  // Make the AI chat-completions call from the main process instead of
  // the renderer's /api/ai → Vercel function path. The packaged app's
  // hosted backend cannot resolve corp/private hostnames (e.g.
  // `*.stingray-private.com`), so when the user is in Electron we
  // bypass Vercel entirely and let Node in the main process talk to
  // whichever endpoint the user has configured. The renderer is still
  // responsible for citation post-processing (it calls /api/ai with
  // `mode: "process-only"` afterwards).
  aiFetch: (args: AiFetchRequest): Promise<AiFetchResult> =>
    ipcRenderer.invoke("studygit:ai-fetch", args),
});
