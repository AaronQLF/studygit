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

contextBridge.exposeInMainWorld("personalGit", {
  appVersion: process.env.PERSONAL_GIT_APP_VERSION ?? "dev",
  platform: process.platform,
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, status: UpdateStatus) =>
      callback(status);
    ipcRenderer.on("personalgit:update-status", listener);
    return () => ipcRenderer.removeListener("personalgit:update-status", listener);
  },
  installUpdateAndRestart: () => ipcRenderer.send("personalgit:install-update"),
});
