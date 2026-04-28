import type { AppState } from "@/lib/types";

export type PersistenceMode = "file" | "supabase";

export type UploadedFile = {
  key: string;
};

export type PersistenceDriver = {
  loadState: () => Promise<AppState>;
  saveState: (state: AppState) => Promise<void>;
  uploadFile: (
    buffer: Buffer,
    extension: string,
    mimeType: string
  ) => Promise<UploadedFile>;
  getFileUrl: (key: string) => Promise<string>;
};
