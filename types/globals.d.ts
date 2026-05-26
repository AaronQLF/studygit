// Type augmentation for the runtime polyfill in components/PdfViewer.tsx.
// `getOrInsertComputed` is a Stage-3 proposal not yet in the lib types.
interface Map<K, V> {
  getOrInsertComputed(key: K, callbackFn: (key: K) => V): V;
}

// Mirrors the union broadcast by electron/main.ts on `studygit:update-status`
// and exposed by electron/preload.ts. Defined here (rather than imported
// from the preload) because the preload runs in a separate TS project and
// cross-project type imports break the renderer build.
type StudygitUpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "not-available"; version: string }
  | { kind: "downloading"; percent: number; version?: string }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string };

// Mirrors the request/result shapes of the `studygit:ai-fetch` IPC
// handler in electron/main.ts. Kept inline so the renderer can use the
// bridge without importing from the electron-only TS project.
type StudygitAiFetchRequest = {
  baseUrl: string;
  apiKey: string;
  model: string;
  // OpenAI-shaped chat-completions `messages` array, already
  // system-prompted and source-block-decorated by lib/ai-request.ts.
  messages: unknown;
  temperature?: number;
};
type StudygitAiFetchResult =
  | { ok: true; json: unknown }
  | {
      ok: false;
      kind: "provider" | "network" | "timeout" | "bad-input";
      status?: number;
      message: string;
      details?: string;
    };

// Subset of the surface exposed by electron/preload.ts. Marked optional on
// `Window` because the same renderer also runs in a regular browser during
// `next dev`, where there's no preload script and `window.studygit` is
// undefined — every callsite has to null-check this.
interface StudygitBridge {
  appVersion: string;
  platform: NodeJS.Platform;
  onUpdateStatus: (
    callback: (status: StudygitUpdateStatus) => void
  ) => () => void;
  getUpdateStatus: () => Promise<StudygitUpdateStatus>;
  checkForUpdates: () => Promise<void>;
  installUpdateAndRestart: () => void;
  getAppVersion: () => Promise<string>;
  getWebviewPreloadUrl: () => Promise<string>;
  aiFetch: (
    args: StudygitAiFetchRequest
  ) => Promise<StudygitAiFetchResult>;
}

interface Window {
  studygit?: StudygitBridge;
}
