import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { INITIAL_STATE } from "@/lib/defaults";
import type { AppState } from "@/lib/types";
import type { PersistenceDriver, UploadedFile } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

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
