/**
 * One-shot migration: copy a file-mode (`PERSISTENCE=file`) Studygit state
 * into the cloud (`PERSISTENCE=supabase`) for a single user. Designed to
 * handle three shapes of local state:
 *
 *   1. In-repo dev:            data/state.json  +  public/uploads/<key>
 *   2. External storage:       <root>/data/state.json  +  <root>/uploads/<key>
 *   3. Electron desktop app:   <userData>/data/state.json  +  <userData>/uploads/<key>
 *
 * In (2) and (3), the persisted upload URLs are `/api/files/<key>` (because
 * `lib/persistence/file.ts:getLocalFileUrl` switches to that prefix when
 * `STORAGE_ROOT` is set). In (1) they're `/uploads/<key>`. We handle both.
 *
 * The script:
 *   - Reads workspaces/nodes/edges/meta from the local state file.
 *   - Re-uploads every PDF and image whose URL points at a local file,
 *     routing the bytes through the R2 chunk store and rewriting the
 *     in-memory node to the new `/api/files/<new-key>` cloud URL.
 *   - Upserts the (possibly rewritten) state into Supabase under the
 *     given user id, bypassing RLS via the service-role key.
 *
 * It never deletes anything. Re-runs are idempotent: PDFs/images already
 * pointing at a cloud URL (http(s) or /api/files/) are left alone.
 *
 * Usage:
 *   tsx scripts/migrate-state-to-supabase.ts --user-id <uuid>           # uses repo defaults
 *   tsx scripts/migrate-state-to-supabase.ts --user-id <uuid> --electron
 *   tsx scripts/migrate-state-to-supabase.ts --user-id <uuid> --electron-dev
 *   tsx scripts/migrate-state-to-supabase.ts --user-id <uuid> \
 *       --state-path /path/to/state.json --uploads-dir /path/to/uploads
 *
 * Required env (via .env.local or the shell): SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, and the R2_* set used by the chunk store.
 */

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { loadEnvConfig } from "@next/env";
import { nanoid } from "nanoid";
import { storeFile } from "../lib/persistence/compression/chunk-store";
import { getSupabaseAdminClient } from "../lib/server/supabase/admin-core";
import type {
  AppState,
  CanvasNode,
  ImageNodeData,
  PdfNodeData,
} from "../lib/types";

// We intentionally do NOT import from `../lib/persistence/supabase` here.
// That module pulls in `getSupabaseServerClient`, which uses
// `import "server-only"` — a Next.js virtual module that tsx can't
// resolve outside the framework's bundle. The upload pipeline we need
// lives in `chunk-store` directly, so we replicate the tiny "generate a
// key, store the bytes" wrapper inline below.

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ----------------------------------------------------------------------
// CLI parsing
// ----------------------------------------------------------------------

type CliFlags = {
  userId: string;
  statePath: string;
  uploadsDir: string;
  source: "repo" | "electron" | "electron-dev" | "custom";
};

// Path the packaged Electron app writes to (mirrors `electron/main.ts`'s
// `app.getPath("userData")` for `productName: Studygit`).
function electronUserDataDir(variant: "packaged" | "dev"): string {
  const suffix = variant === "dev" ? "StudygitDev" : "Studygit";
  const platform = os.platform();
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", suffix);
  }
  if (platform === "win32") {
    return path.join(process.env.APPDATA ?? "", suffix);
  }
  // Linux + everything else fall back to the XDG default.
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
    suffix
  );
}

function parseFlags(): CliFlags {
  const args = process.argv.slice(2);
  let userId = process.env.MIGRATE_USER_ID ?? "";
  let statePath = "";
  let uploadsDir = "";
  let source: CliFlags["source"] = "repo";

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--user-id" || a === "-u") {
      userId = args[i + 1] ?? "";
      i += 1;
    } else if (a.startsWith("--user-id=")) {
      userId = a.slice("--user-id=".length);
    } else if (a === "--state-path") {
      statePath = args[i + 1] ?? "";
      i += 1;
      source = "custom";
    } else if (a.startsWith("--state-path=")) {
      statePath = a.slice("--state-path=".length);
      source = "custom";
    } else if (a === "--uploads-dir") {
      uploadsDir = args[i + 1] ?? "";
      i += 1;
      source = "custom";
    } else if (a.startsWith("--uploads-dir=")) {
      uploadsDir = a.slice("--uploads-dir=".length);
      source = "custom";
    } else if (a === "--electron") {
      source = "electron";
    } else if (a === "--electron-dev") {
      source = "electron-dev";
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!userId) {
    throw new Error(
      "Missing user id. Pass --user-id <uuid> or set MIGRATE_USER_ID. " +
        "Find the value under Authentication → Users in the Supabase dashboard."
    );
  }
  if (!UUID_RE.test(userId)) {
    throw new Error(`--user-id must be a UUID, got: ${userId}`);
  }

  // Resolve defaults for whichever source we ended up on. Explicit
  // --state-path / --uploads-dir always win.
  if (source === "electron" || source === "electron-dev") {
    const root = electronUserDataDir(source === "electron" ? "packaged" : "dev");
    if (!statePath) statePath = path.join(root, "data", "state.json");
    if (!uploadsDir) uploadsDir = path.join(root, "uploads");
  } else if (source === "repo") {
    if (!statePath) statePath = path.join(projectDir, "data", "state.json");
    if (!uploadsDir) uploadsDir = path.join(projectDir, "public", "uploads");
  } else {
    // source === "custom" — fail loudly if only one half was given so we
    // never silently mix a custom state file with the repo uploads dir.
    if (!statePath || !uploadsDir) {
      throw new Error(
        "When using --state-path or --uploads-dir, pass both. " +
          "Use --electron / --electron-dev to get OS-aware defaults."
      );
    }
  }

  return { userId, statePath, uploadsDir, source };
}

function printHelp(): void {
  console.log(`
migrate-state-to-supabase — move file-mode state into a Supabase user account.

Required:
  --user-id <uuid>           Target Supabase user id (or set MIGRATE_USER_ID).

Source selection (defaults to the repo's data/ + public/uploads/):
  --electron                 Read from the packaged desktop app's userData dir.
  --electron-dev             Read from the dev variant (StudygitDev).
  --state-path <file>        Explicit state.json path (must pair with --uploads-dir).
  --uploads-dir <dir>        Explicit uploads dir (must pair with --state-path).

Other:
  -h, --help                 Show this help.

Resolved paths for the known sources:
  macOS    ~/Library/Application Support/Studygit
  Windows  %APPDATA%\\Studygit
  Linux    ~/.config/Studygit
  (the dev variant appends "Dev" to the product name)
`);
}

// ----------------------------------------------------------------------
// URL + upload helpers
// ----------------------------------------------------------------------

// Strip either of the two known local-upload URL prefixes and return
// the remaining decoded key. Returns null for external (http/https)
// URLs or anything that doesn't look like a local upload.
function extractLocalKey(url: string): string | null {
  for (const prefix of ["/api/files/", "/uploads/"]) {
    if (!url.startsWith(prefix)) continue;
    return decodeURIComponent(url.slice(prefix.length));
  }
  return null;
}

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

// Inline equivalents of `supabaseFileOperations.uploadFile` and
// `getFileUrl` (defined in `lib/persistence/supabase.ts`). Kept here so
// the migration script doesn't transitively import `server-only`. The
// behaviour must stay byte-for-byte equivalent or migrated state will
// point at URLs the running app can't resolve.
function sanitizeExtension(extension: string): string {
  const cleaned = extension.toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (!cleaned) return ".pdf";
  return cleaned.startsWith(".") ? cleaned : `.${cleaned}`;
}

async function uploadAsset(
  buffer: Buffer,
  extension: string,
  mimeType: string
): Promise<{ key: string }> {
  const key = `${nanoid(12)}${sanitizeExtension(extension)}`;
  await storeFile(key, buffer, mimeType || "application/pdf", undefined);
  return { key };
}

function cloudUrlFor(key: string): string {
  return `/api/files/${encodeURIComponent(key)}`;
}

function mimeForExtension(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  switch (e) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

// ----------------------------------------------------------------------
// Per-node migration
// ----------------------------------------------------------------------

type AssetOutcome =
  | { kind: "skipped"; reason: "not-uploadable" | "already-cloud" | "no-local-key" }
  | { kind: "missing"; localPath: string }
  | { kind: "migrated"; bytes: number };

async function migrateAssetUrl(
  node: CanvasNode,
  uploadsDir: string,
  setUrl: (next: string) => void,
  currentUrl: string
): Promise<AssetOutcome> {
  if (!currentUrl) {
    return { kind: "skipped", reason: "not-uploadable" };
  }
  if (isExternalUrl(currentUrl)) {
    return { kind: "skipped", reason: "already-cloud" };
  }
  const localKey = extractLocalKey(currentUrl);
  if (!localKey) {
    return { kind: "skipped", reason: "no-local-key" };
  }

  const localPath = path.join(uploadsDir, localKey);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(localPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "missing", localPath };
    }
    throw error;
  }

  const extension = path.extname(localKey) || ".pdf";
  const mime = mimeForExtension(extension);
  const uploaded = await uploadAsset(buffer, extension, mime);
  setUrl(cloudUrlFor(uploaded.key));
  // The cloud URL shape (`/api/files/<key>`) matches what the route
  // handler in `app/api/files/[key]/route.ts` serves out of the chunk
  // store, so the migrated state slots straight in.
  void node;
  return { kind: "migrated", bytes: buffer.length };
}

async function migratePdfNode(
  node: CanvasNode,
  uploadsDir: string
): Promise<AssetOutcome> {
  if (node.data.kind !== "pdf") {
    return { kind: "skipped", reason: "not-uploadable" };
  }
  const pdf = node.data as PdfNodeData;
  const original = pdf.src;
  const outcome = await migrateAssetUrl(
    node,
    uploadsDir,
    (next) => {
      pdf.src = next;
      // Preserve the user's original filename for the cloud copy — the
      // file mode never stored one separately because it could derive
      // it from the on-disk path. The cloud copy needs it explicitly
      // so download/share UIs aren't naming everything `<key>.pdf`.
      if (!pdf.fileName) {
        const localKey = extractLocalKey(original);
        if (localKey) pdf.fileName = localKey;
      }
    },
    original
  );
  return outcome;
}

async function migrateImageNode(
  node: CanvasNode,
  uploadsDir: string
): Promise<AssetOutcome> {
  if (node.data.kind !== "image") {
    return { kind: "skipped", reason: "not-uploadable" };
  }
  const img = node.data as ImageNodeData;
  return migrateAssetUrl(node, uploadsDir, (next) => (img.url = next), img.url);
}

// ----------------------------------------------------------------------
// State load / write
// ----------------------------------------------------------------------

async function readLocalState(statePath: string): Promise<AppState> {
  let raw: string;
  try {
    raw = await fs.readFile(statePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `state.json not found at ${statePath}. ` +
          `Pass --electron / --electron-dev or --state-path to point at a real file.`
      );
    }
    throw error;
  }
  return JSON.parse(raw) as AppState;
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

// ----------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------

type Counters = {
  pdfMigrated: number;
  pdfSkipped: number;
  pdfMissing: number;
  imageMigrated: number;
  imageSkipped: number;
  imageMissing: number;
  bytesUploaded: number;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function run(): Promise<void> {
  if (process.env.PERSISTENCE && process.env.PERSISTENCE !== "supabase") {
    throw new Error(
      "PERSISTENCE must be `supabase` for migration, or be unset."
    );
  }
  process.env.PERSISTENCE = "supabase";

  const flags = parseFlags();

  console.log(`source:      ${flags.source}`);
  console.log(`state.json:  ${flags.statePath}`);
  console.log(`uploads dir: ${flags.uploadsDir}`);
  console.log(`target user: ${flags.userId}`);
  console.log("");

  const state = await readLocalState(flags.statePath);
  console.log(
    `Loaded ${state.workspaces.length} workspace(s), ` +
      `${state.nodes.length} node(s), ${state.edges.length} edge(s).`
  );

  const counters: Counters = {
    pdfMigrated: 0,
    pdfSkipped: 0,
    pdfMissing: 0,
    imageMigrated: 0,
    imageSkipped: 0,
    imageMissing: 0,
    bytesUploaded: 0,
  };

  for (const node of state.nodes) {
    if (node.data.kind === "pdf") {
      const outcome = await migratePdfNode(node, flags.uploadsDir);
      record(counters, "pdf", outcome, node.id);
    } else if (node.data.kind === "image") {
      const outcome = await migrateImageNode(node, flags.uploadsDir);
      record(counters, "image", outcome, node.id);
    }
  }

  await writeStateAsAdmin(state, flags.userId);

  console.log("");
  console.log("--- Migration summary ---");
  console.log(
    `PDFs:   migrated ${counters.pdfMigrated}, ` +
      `skipped ${counters.pdfSkipped}, missing ${counters.pdfMissing}`
  );
  console.log(
    `Images: migrated ${counters.imageMigrated}, ` +
      `skipped ${counters.imageSkipped}, missing ${counters.imageMissing}`
  );
  console.log(`Bytes uploaded (pre-chunking): ${formatBytes(counters.bytesUploaded)}`);
  console.log(`State saved for user ${flags.userId}.`);
}

function record(
  counters: Counters,
  kind: "pdf" | "image",
  outcome: AssetOutcome,
  nodeId: string
): void {
  const migratedKey = kind === "pdf" ? "pdfMigrated" : "imageMigrated";
  const skippedKey = kind === "pdf" ? "pdfSkipped" : "imageSkipped";
  const missingKey = kind === "pdf" ? "pdfMissing" : "imageMissing";
  if (outcome.kind === "migrated") {
    counters[migratedKey] += 1;
    counters.bytesUploaded += outcome.bytes;
    console.log(`  migrated ${kind} ${nodeId} (${formatBytes(outcome.bytes)})`);
    return;
  }
  if (outcome.kind === "missing") {
    counters[missingKey] += 1;
    console.warn(`  missing ${kind} for ${nodeId}: ${outcome.localPath}`);
    return;
  }
  // skipped — only noisy for the not-uploadable case if the caller passed
  // a non-pdf/image; the iteration in run() never calls us with one, so
  // we just collect the count silently for already-cloud entries.
  counters[skippedKey] += 1;
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
