import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import { INITIAL_STATE } from "@/lib/defaults";
import type { AnyNodeData, AppState, CanvasEdge, CanvasNode, Workspace } from "@/lib/types";
import type { PersistenceDriver, UploadedFile } from "./types";

const APP_META_USER_ID = "00000000-0000-0000-0000-000000000000";
const S3_KEY_PREFIX = "uploads";
const PRESIGNED_URL_TTL_SECONDS = 60 * 60;

let cachedSupabase: SupabaseClient | null = null;
let cachedS3: S3Client | null = null;

function cloneInitialState(): AppState {
  return JSON.parse(JSON.stringify(INITIAL_STATE)) as AppState;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sanitizeExtension(extension: string): string {
  const cleaned = extension.toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (!cleaned) return ".pdf";
  if (cleaned.startsWith(".")) return cleaned;
  return `.${cleaned}`;
}

function s3ObjectKeyFromFileKey(key: string): string {
  return `${S3_KEY_PREFIX}/${key}`;
}

function getSupabaseClient(): SupabaseClient {
  if (!cachedSupabase) {
    cachedSupabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }
  return cachedSupabase;
}

function getS3Client(): S3Client {
  if (!cachedS3) {
    const region = requireEnv("AWS_REGION");
    const accessKeyId = requireEnv("AWS_ACCESS_KEY_ID");
    const secretAccessKey = requireEnv("AWS_SECRET_ACCESS_KEY");
    cachedS3 = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return cachedS3;
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
  const supabase = getSupabaseClient();

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
      .eq("user_id", APP_META_USER_ID)
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
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("save_state", {
    payload: state as unknown as Record<string, unknown>,
  });
  if (error) {
    throw new Error(error.message);
  }
}

async function uploadToS3(
  buffer: Buffer,
  extension: string,
  mimeType: string
): Promise<UploadedFile> {
  const key = `${nanoid(12)}${sanitizeExtension(extension)}`;
  const s3Key = s3ObjectKeyFromFileKey(key);
  const bucket = requireEnv("AWS_S3_BUCKET");
  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType || "application/pdf",
    })
  );
  return {
    key,
  };
}

export async function getSupabaseSignedFileUrl(key: string): Promise<string> {
  const bucket = requireEnv("AWS_S3_BUCKET");
  const s3 = getS3Client();
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: s3ObjectKeyFromFileKey(key),
    }),
    { expiresIn: PRESIGNED_URL_TTL_SECONDS }
  );
}

export function createSupabaseDriver(): PersistenceDriver {
  return {
    loadState: loadStateFromSupabase,
    saveState: saveStateToSupabase,
    uploadFile: uploadToS3,
    getFileUrl: async (key: string) => `/api/files/${encodeURIComponent(key)}`,
  };
}
