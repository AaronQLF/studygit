// Shared types for the in-app browser surfaces. Electron's `<webview>`
// tag is just a generic HTML element to React; Chromium tacks a real
// browser API on top of it at runtime, and the IPC bridge it speaks
// over isn't covered by any built-in DOM type either — both surfaces
// are described here.

export type WebviewElement = HTMLElement & {
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

export type SelectionPayload = {
  text: string;
  prefix: string;
  suffix: string;
  rect: { top: number; left: number; width: number; height: number };
};

export type IpcMessageEvent = Event & {
  channel: string;
  args: unknown[];
};

/**
 * Surface a browser channel handler can interrogate to look up the
 * current URL/title/viewport rect of whichever runtime fired the
 * event. Lets the Electron and cloud-iframe paths share one router.
 */
export type BrowserChannelSurface = {
  getURL: () => string;
  getTitle: () => string;
  getRect: () => DOMRect;
};

export type BrowserNavState = {
  canBack: boolean;
  canForward: boolean;
};
