// Supabase + R2 driver. Postgres holds canvas state (workspaces / nodes /
// edges / meta), R2 holds the uploaded blobs (PDFs, etc) — but R2 doesn't
// see your bytes verbatim. Every upload flows through the
// content-addressable, deduplicating, zstd-compressed chunk store under
// `lib/persistence/compression/`. See `chunk-store.ts` for the details.

import { nanoid } from "nanoid";
import { INITIAL_STATE } from "@/lib/defaults";
import { getSupabaseServerClient } from "@/lib/server/supabase/server";
import type { AnyNodeData, AppState, CanvasEdge, CanvasNode, Workspace } from "@/lib/types";
import {
  storeFile,
  type StoreReport,
} from "./compression/chunk-store";
import type { PersistenceDriver, UploadedFile } from "./types";

function cloneInitialState(): AppState {
  return JSON.parse(JSON.stringify(INITIAL_STATE)) as AppState;
}

function sanitizeExtension(extension: string): string {
  const cleaned = extension.toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (!cleaned) return ".pdf";
  if (cleaned.startsWith(".")) return cleaned;
  return `.${cleaned}`;
}

type WorkspaceRow = {
  id: string;
  name: string;
  created_at: number;
};

type NodeRow = {
  id: string;
  workspace_id: string;
  position: { x: number; y: number };
  width: number | null;
  height: number | null;
  data: AnyNodeData;
};

type EdgeRow = {
  id: string;
  workspace_id: string;
  source: string;
  target: string;
};

type AppMetaRow = {
  selected_workspace_id: string | null;
  version: number;
};

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

function mapNode(row: NodeRow): CanvasNode {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    position: row.position,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    data: row.data,
  };
}

function mapEdge(row: EdgeRow): CanvasEdge {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    source: row.source,
    target: row.target,
  };
}

async function loadStateFromSupabase(): Promise<AppState> {
  // Per-request authed client. RLS scopes every read to auth.uid().
  const supabase = await getSupabaseServerClient();

  const [workspacesRes, nodesRes, edgesRes, metaRes] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id,name,created_at")
      .order("created_at", { ascending: true }),
    supabase.from("nodes").select("id,workspace_id,position,width,height,data"),
    supabase.from("edges").select("id,workspace_id,source,target"),
    supabase
      .from("app_meta")
      .select("selected_workspace_id,version")
      .maybeSingle(),
  ]);

  if (workspacesRes.error) throw new Error(workspacesRes.error.message);
  if (nodesRes.error) throw new Error(nodesRes.error.message);
  if (edgesRes.error) throw new Error(edgesRes.error.message);
  if (metaRes.error) throw new Error(metaRes.error.message);

  const workspaces = (workspacesRes.data ?? []).map((row) =>
    mapWorkspace(row as WorkspaceRow)
  );
  const nodes = (nodesRes.data ?? []).map((row) => mapNode(row as NodeRow));
  const edges = (edgesRes.data ?? []).map((row) => mapEdge(row as EdgeRow));
  const meta = (metaRes.data as AppMetaRow | null) ?? null;

  if (workspaces.length === 0 && nodes.length === 0 && edges.length === 0 && !meta) {
    return cloneInitialState();
  }

  const selectedWorkspaceId =
    meta?.selected_workspace_id ?? workspaces[0]?.id ?? null;
  const version = meta?.version ?? 1;

  return {
    workspaces,
    nodes,
    edges,
    selectedWorkspaceId,
    version,
  };
}

async function saveStateToSupabase(state: AppState): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("save_state", {
    payload: state as unknown as Record<string, unknown>,
  });
  if (error) {
    throw new Error(error.message);
  }
}

async function uploadToR2(
  buffer: Buffer,
  extension: string,
  mimeType: string
): Promise<UploadedFile> {
  // The "key" is the public-facing identifier — a short opaque token that
  // appears in /api/files/<key>. The actual bytes live across many R2
  // objects (one per unique chunk) plus a single manifests/<key>.json that
  // glues them back together.
  const key = `${nanoid(12)}${sanitizeExtension(extension)}`;
  const report = await storeFile(
    key,
    buffer,
    mimeType || "application/pdf",
    undefined
  );
  logStoreReport(report);
  return { key };
}

function logStoreReport(r: StoreReport): void {
  // Surface dedup/compression stats in dev so you can see the savings without
  // wiring up a metrics backend. The numbers are also what makes for a fun
  // blog post: cold uploads vs. warm re-uploads vs. shared course PDFs.
  if (process.env.NODE_ENV === "production") return;
  const ratio =
    r.plaintextBytes > 0 ? r.compressedBytes / r.plaintextBytes : 1;
  const dedupPct =
    r.totalChunks > 0 ? (r.dedupedChunks / r.totalChunks) * 100 : 0;
  // Pre-compress segment: only print when meaningful (a PDF was attempted).
  let pre = "";
  if (r.precompress) {
    const p = r.precompress;
    const preRatio = p.inSize > 0 ? p.outSize / p.inSize : 1;
    pre =
      ` precompress=${p.alg} ${p.inSize}→${p.outSize} (ratio=${preRatio.toFixed(3)})`;
  } else if (r.precompressSkipReason && r.precompressSkipReason !== "not-pdf") {
    pre = ` precompress=skip(${r.precompressSkipReason})`;
  }
  console.log(
    `[r2-store] ${r.key}: ` +
      `original=${r.originalBytes} ` +
      `plaintext=${r.plaintextBytes} ` +
      `compressed=${r.compressedBytes} (ratio=${ratio.toFixed(3)}) ` +
      `uploaded=${r.uploadedBytes} ` +
      `chunks=${r.totalChunks} dedup=${r.dedupedChunks} (${dedupPct.toFixed(1)}%)` +
      pre
  );
}

export function createSupabaseDriver(): PersistenceDriver {
  return {
    loadState: loadStateFromSupabase,
    saveState: saveStateToSupabase,
    uploadFile: uploadToR2,
    getFileUrl: async (key: string) => `/api/files/${encodeURIComponent(key)}`,
  };
}

// Exposed for the one-shot migration script which runs outside the request
// lifecycle. Same R2 store, same chunk dedup, just bypasses RLS for the
// state writes.
export const supabaseFileOperations = {
  uploadFile: uploadToR2,
  getFileUrl: async (key: string) => `/api/files/${encodeURIComponent(key)}`,
};
