"use client";

// Local-first PDF storage. Bytes never leave the device that uploaded them.
//
// We address files by content (sha256), so the same PDF dropped twice is one
// copy, and a second device can re-attach the same file and continue using
// existing highlights as long as the bytes match.
//
// `src` on a `pdf` node is a URI of the form `local:<sha256-hex>`. Anything
// else (e.g. legacy `/api/files/<key>` URLs) is treated as a remote URL and
// passed straight through to pdf.js.

const OPFS_DIR_NAME = "pdfs";
const IDB_NAME = "studygit-local-pdfs";
const IDB_STORE = "pdfs";
const IDB_VERSION = 1;

export const LOCAL_PDF_SCHEME = "local:";

type Driver = {
  put: (hash: string, blob: Blob) => Promise<void>;
  get: (hash: string) => Promise<Blob | null>;
  has: (hash: string) => Promise<boolean>;
  remove: (hash: string) => Promise<void>;
  size: () => Promise<{ count: number; bytes: number }>;
};

let driverPromise: Promise<Driver> | null = null;

function getDriver(): Promise<Driver> {
  if (!driverPromise) driverPromise = pickDriver();
  return driverPromise;
}

async function pickDriver(): Promise<Driver> {
  if (typeof window === "undefined") {
    throw new Error("local pdf store is browser-only");
  }
  if (canUseOpfs()) {
    try {
      const root = await navigator.storage.getDirectory();
      await root.getDirectoryHandle(OPFS_DIR_NAME, { create: true });
      return makeOpfsDriver();
    } catch (err) {
      console.warn("OPFS unavailable, falling back to IndexedDB:", err);
    }
  }
  return makeIdbDriver();
}

function canUseOpfs(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.storage &&
    typeof navigator.storage.getDirectory === "function" &&
    typeof FileSystemFileHandle !== "undefined" &&
    "createWritable" in FileSystemFileHandle.prototype
  );
}

function filenameFor(hash: string): string {
  return `${hash}.pdf`;
}

function makeOpfsDriver(): Driver {
  async function dir(): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(OPFS_DIR_NAME, { create: true });
  }

  function isNotFound(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      (err as DOMException).name === "NotFoundError"
    );
  }

  return {
    async put(hash, blob) {
      const d = await dir();
      const handle = await d.getFileHandle(filenameFor(hash), { create: true });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    },
    async get(hash) {
      try {
        const d = await dir();
        const handle = await d.getFileHandle(filenameFor(hash));
        return await handle.getFile();
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async has(hash) {
      try {
        const d = await dir();
        await d.getFileHandle(filenameFor(hash));
        return true;
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
    },
    async remove(hash) {
      try {
        const d = await dir();
        await d.removeEntry(filenameFor(hash));
      } catch (err) {
        if (isNotFound(err)) return;
        throw err;
      }
    },
    async size() {
      const d = await dir();
      let count = 0;
      let bytes = 0;
      const iterable = d as unknown as AsyncIterable<
        [string, FileSystemHandle]
      >;
      for await (const [, entry] of iterable) {
        if (entry.kind === "file") {
          const f = await (entry as FileSystemFileHandle).getFile();
          count++;
          bytes += f.size;
        }
      }
      return { count, bytes };
    },
  };
}

function makeIdbDriver(): Driver {
  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    return open().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const t = db.transaction(IDB_STORE, mode);
          const req = run(t.objectStore(IDB_STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        })
    );
  }

  return {
    async put(hash, blob) {
      await tx<IDBValidKey>("readwrite", (s) => s.put(blob, hash));
    },
    async get(hash) {
      const value = await tx<unknown>("readonly", (s) => s.get(hash));
      if (!value) return null;
      return value as Blob;
    },
    async has(hash) {
      const value = await tx<IDBValidKey | undefined>("readonly", (s) =>
        s.getKey(hash)
      );
      return value !== undefined;
    },
    async remove(hash) {
      await tx<undefined>("readwrite", (s) => s.delete(hash));
    },
    async size() {
      const db = await open();
      return new Promise<{ count: number; bytes: number }>(
        (resolve, reject) => {
          const t = db.transaction(IDB_STORE, "readonly");
          const s = t.objectStore(IDB_STORE);
          const req = s.openCursor();
          let count = 0;
          let bytes = 0;
          req.onsuccess = () => {
            const cur = req.result;
            if (!cur) {
              resolve({ count, bytes });
              return;
            }
            count++;
            const v = cur.value as Blob;
            bytes += v.size;
            cur.continue();
          };
          req.onerror = () => reject(req.error);
        }
      );
    },
  };
}

export function makeLocalPdfSrc(hash: string): string {
  return `${LOCAL_PDF_SCHEME}${hash}`;
}

export function parseLocalPdfHash(
  src: string | null | undefined
): string | null {
  if (!src || !src.startsWith(LOCAL_PDF_SCHEME)) return null;
  const rest = src.slice(LOCAL_PDF_SCHEME.length).replace(/\.pdf$/i, "");
  return /^[a-f0-9]{64}$/.test(rest) ? rest : null;
}

export function isLocalPdfSrc(src: string | null | undefined): boolean {
  return parseLocalPdfHash(src) !== null;
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export type StoredLocalPdf = {
  hash: string;
  src: string;
  size: number;
};

// Notify any in-flight `usePdfSource` hooks when a hash becomes locally
// available. This matters for the "re-attach the same file" path: the
// node's `src` doesn't change (same content hash) so an effect keyed on
// `src` would never re-run on its own.
type LocalPdfListener = (hash: string) => void;
const localPdfListeners = new Set<LocalPdfListener>();

export function subscribeLocalPdfAdded(
  listener: LocalPdfListener
): () => void {
  localPdfListeners.add(listener);
  return () => {
    localPdfListeners.delete(listener);
  };
}

function notifyLocalPdfAdded(hash: string): void {
  for (const listener of localPdfListeners) {
    try {
      listener(hash);
    } catch (err) {
      console.warn("local pdf listener threw", err);
    }
  }
}

export async function storeLocalPdf(file: File): Promise<StoredLocalPdf> {
  const buffer = await file.arrayBuffer();
  const hash = await sha256Hex(buffer);
  const driver = await getDriver();
  const exists = await driver.has(hash);
  if (!exists) {
    const blob = new Blob([buffer], {
      type: file.type || "application/pdf",
    });
    await driver.put(hash, blob);
  }
  // Best-effort: ask the browser to keep these files around through eviction.
  // Some browsers prompt; failure is non-fatal — the file is still saved.
  try {
    await navigator.storage?.persist?.();
  } catch {
    // ignore
  }
  notifyLocalPdfAdded(hash);
  return { hash, src: makeLocalPdfSrc(hash), size: buffer.byteLength };
}

export async function hasLocalPdf(hash: string): Promise<boolean> {
  const driver = await getDriver();
  return driver.has(hash);
}

export async function removeLocalPdf(hash: string): Promise<void> {
  const driver = await getDriver();
  await driver.remove(hash);
  const cached = blobUrlCache.get(hash);
  if (cached) {
    URL.revokeObjectURL(cached);
    blobUrlCache.delete(hash);
  }
}

export async function localPdfStats(): Promise<{
  count: number;
  bytes: number;
}> {
  const driver = await getDriver();
  return driver.size();
}

// One blob URL per hash for the lifetime of the page. Both the thumbnail and
// the viewer can share the same URL, and we don't have to refcount revokes
// across components.
const blobUrlCache = new Map<string, string>();

export async function getLocalPdfBlobUrl(hash: string): Promise<string | null> {
  const cached = blobUrlCache.get(hash);
  if (cached) return cached;
  const driver = await getDriver();
  const blob = await driver.get(hash);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(hash, url);
  return url;
}
