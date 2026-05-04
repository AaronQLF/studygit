import { promises as fs } from "fs";
import path from "path";
import { loadEnvConfig } from "@next/env";
import { supabaseFileOperations } from "../lib/persistence/supabase";
import { getSupabaseAdminClient } from "../lib/server/supabase/admin";
import type { AppState, CanvasNode, PdfNodeData } from "../lib/types";

const projectDir = process.cwd();
const DATA_STATE_PATH = path.join(projectDir, "data", "state.json");
const LOCAL_UPLOADS_DIR = path.join(projectDir, "public", "uploads");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

loadEnvConfig(projectDir);

function parseUserId(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--user-id" || a === "-u") {
      const v = args[i + 1];
      if (v) return v;
    }
    if (a.startsWith("--user-id=")) return a.slice("--user-id=".length);
  }
  const fromEnv = process.env.MIGRATE_USER_ID;
  if (fromEnv) return fromEnv;
  throw new Error(
    "Missing user id. Pass --user-id <uuid> or set MIGRATE_USER_ID. " +
      "Find the value under Authentication → Users in the Supabase dashboard."
  );
}

function extractLocalUploadKey(src: string): string | null {
  if (!src.startsWith("/uploads/")) return null;
  return decodeURIComponent(src.slice("/uploads/".length));
}

async function readLocalState(): Promise<AppState> {
  const raw = await fs.readFile(DATA_STATE_PATH, "utf8");
  return JSON.parse(raw) as AppState;
}

async function migratePdfNode(node: CanvasNode): Promise<boolean> {
  if (node.data.kind !== "pdf") return false;
  const pdfData = node.data as PdfNodeData;

  const alreadyMigrated =
    pdfData.src.startsWith("/api/files/") || /^https?:\/\//.test(pdfData.src);
  if (alreadyMigrated) return false;

  const localKey = extractLocalUploadKey(pdfData.src);
  if (!localKey) return false;

  const localPath = path.join(LOCAL_UPLOADS_DIR, localKey);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(localPath);
  } catch (error) {
    const missingFile = (error as NodeJS.ErrnoException).code === "ENOENT";
    if (missingFile) {
      console.warn(
        `Skipping missing local file for node ${node.id}: ${localPath}`
      );
      return false;
    }
    throw error;
  }
  const extension = path.extname(localKey) || ".pdf";
  const originalName = pdfData.fileName || localKey;
  const uploaded = await supabaseFileOperations.uploadFile(
    buffer,
    extension,
    "application/pdf"
  );
  const stableUrl = await supabaseFileOperations.getFileUrl(uploaded.key);
  pdfData.src = stableUrl;
  pdfData.fileName = originalName;
  return true;
}

async function writeStateAsAdmin(
  state: AppState,
  userId: string
): Promise<void> {
  const supabase = getSupabaseAdminClient();

  if (state.workspaces.length > 0) {
    const { error } = await supabase.from("workspaces").upsert(
      state.workspaces.map((w) => ({
        id: w.id,
        user_id: userId,
        name: w.name,
        created_at: w.createdAt,
      })),
      { onConflict: "id" }
    );
    if (error) throw new Error(`workspaces upsert: ${error.message}`);
  }

  if (state.nodes.length > 0) {
    const { error } = await supabase.from("nodes").upsert(
      state.nodes.map((n) => ({
        id: n.id,
        workspace_id: n.workspaceId,
        user_id: userId,
        position: n.position,
        width: n.width ?? null,
        height: n.height ?? null,
        data: n.data,
      })),
      { onConflict: "id" }
    );
    if (error) throw new Error(`nodes upsert: ${error.message}`);
  }

  if (state.edges.length > 0) {
    const { error } = await supabase.from("edges").upsert(
      state.edges.map((e) => ({
        id: e.id,
        workspace_id: e.workspaceId,
        user_id: userId,
        source: e.source,
        target: e.target,
      })),
      { onConflict: "id" }
    );
    if (error) throw new Error(`edges upsert: ${error.message}`);
  }

  const { error: metaError } = await supabase.from("app_meta").upsert(
    {
      user_id: userId,
      selected_workspace_id: state.selectedWorkspaceId,
      version: state.version ?? 1,
    },
    { onConflict: "user_id" }
  );
  if (metaError) throw new Error(`app_meta upsert: ${metaError.message}`);
}

async function run(): Promise<void> {
  if (process.env.PERSISTENCE && process.env.PERSISTENCE !== "supabase") {
    throw new Error(
      "PERSISTENCE must be `supabase` for migration, or be unset."
    );
  }
  process.env.PERSISTENCE = "supabase";

  const userId = parseUserId();
  if (!UUID_RE.test(userId)) {
    throw new Error(`--user-id must be a UUID, got: ${userId}`);
  }

  const state = await readLocalState();
  let migratedPdfCount = 0;

  for (const node of state.nodes) {
    const changed = await migratePdfNode(node);
    if (changed) migratedPdfCount += 1;
  }

  await writeStateAsAdmin(state, userId);

  console.log(
    `Migration complete. Migrated ${migratedPdfCount} PDF node(s) and saved state for user ${userId}.`
  );
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
