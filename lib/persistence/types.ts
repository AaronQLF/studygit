import type { AppState } from "@/lib/types";

export type PersistenceMode = "file" | "supabase";

export type UploadedFile = {
  key: string;
};

// Optimistic-concurrency result for saveState. A "version-conflict" means
// the store already holds a snapshot with version >= the incoming one
// (another tab/device saved first); the caller should re-load and tell the
// user instead of silently clobbering the newer data. Real failures
// (network, SQL errors) still throw.
export type SaveStateResult =
  | { ok: true }
  | { ok: false; reason: "version-conflict" };

export type PersistenceDriver = {
  loadState: () => Promise<AppState>;
  saveState: (state: AppState) => Promise<SaveStateResult>;
  uploadFile: (
    buffer: Buffer,
    extension: string,
    mimeType: string,
    // Auth user id that owns the upload, when the persistence mode has a
    // notion of users (supabase). File mode ignores it.
    ownerId?: string | null
  ) => Promise<UploadedFile>;
  getFileUrl: (key: string) => Promise<string>;
};
