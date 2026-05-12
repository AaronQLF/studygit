import { contextBridge, ipcRenderer } from "electron";

// Minimal renderer surface. The renderer is just a Next.js app loaded over
// HTTP, so almost everything goes through the embedded server. This bridge
// only exposes what the page literally cannot get from `window.location` —
// the packaged app version and a subscription channel for updater status.

type UpdateStatus =
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "not-available" }
  | { kind: "downloading"; percent: number }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string };

contextBridge.exposeInMainWorld("studygit", {
  appVersion: process.env.STUDYGIT_APP_VERSION ?? "dev",
  platform: process.platform,
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, status: UpdateStatus) =>
      callback(status);
    ipcRenderer.on("studygit:update-status", listener);
    return () => ipcRenderer.removeListener("studygit:update-status", listener);
  },
  installUpdateAndRestart: () => ipcRenderer.send("studygit:install-update"),
  // file:// URL the in-app Browser <webview> attaches as its preload.
  // Returned async because the path is only known to the main process —
  // it depends on whether we're running packaged (out of asar.unpacked)
  // or unpackaged (out of electron/dist next to this file).
  getWebviewPreloadUrl: (): Promise<string> =>
    ipcRenderer.invoke("studygit:get-webview-preload-url"),
});
