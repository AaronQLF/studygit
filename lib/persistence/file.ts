import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { INITIAL_STATE } from "@/lib/defaults";
import type { AppState } from "@/lib/types";
import type { PersistenceDriver, UploadedFile } from "./types";

// In Electron the install dir is read-only (inside an asar). The main
// process sets STORAGE_ROOT to app.getPath('userData') so all writable
// state lives under the user's OS-conventional app-data directory. In
// `npm run dev` STORAGE_ROOT is unset and we fall back to the repo root,
// preserving the original `data/state.json` + `public/uploads` layout.
const STORAGE_ROOT = process.env.STORAGE_ROOT
  ? path.resolve(process.env.STORAGE_ROOT)
  : process.cwd();
const USING_EXTERNAL_STORAGE = Boolean(process.env.STORAGE_ROOT);

const DATA_DIR = path.join(STORAGE_ROOT, "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");
// When STORAGE_ROOT is set we write uploads to <root>/uploads; otherwise we
// keep the original public/uploads layout so Next can serve them statically
// in dev. The route handler streams from disk in the external-storage case.
const UPLOAD_DIR = USING_EXTERNAL_STORAGE
  ? path.join(STORAGE_ROOT, "uploads")
  : path.join(STORAGE_ROOT, "public", "uploads");

export const FILE_STORAGE_PATHS = {
  root: STORAGE_ROOT,
  dataDir: DATA_DIR,
  statePath: STATE_PATH,
  uploadDir: UPLOAD_DIR,
  external: USING_EXTERNAL_STORAGE,
};

function cloneInitialState(): AppState {
  return JSON.parse(JSON.stringify(INITIAL_STATE)) as AppState;
}

function sanitizeExtension(extension: string): string {
  const cleaned = extension.toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (!cleaned) return ".pdf";
  if (cleaned.startsWith(".")) return cleaned;
  return `.${cleaned}`;
}

async function ensureStateFile(): Promise<AppState> {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    return JSON.parse(raw) as AppState;
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    if (!missing) throw error;
    const initial = cloneInitialState();
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
}

async function saveStateFile(state: AppState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

async function saveUploadFile(
  buffer: Buffer,
  extension: string
): Promise<UploadedFile> {
  const key = `${nanoid(12)}${sanitizeExtension(extension)}`;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, key), buffer);
  return { key };
}

async function getLocalFileUrl(key: string): Promise<string> {
  return `/uploads/${encodeURIComponent(key)}`;
}

export function createFileDriver(): PersistenceDriver {
  return {
    loadState: ensureStateFile,
    saveState: saveStateFile,
    uploadFile: async (
      buffer: Buffer,
      extension: string,
      _mimeType: string
    ) => saveUploadFile(buffer, extension),
    getFileUrl: getLocalFileUrl,
  };
}
