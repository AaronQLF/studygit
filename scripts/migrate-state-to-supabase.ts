import { promises as fs } from "fs";
import path from "path";
import { loadEnvConfig } from "@next/env";
import { createSupabaseDriver } from "../lib/persistence/supabase";
import type { AppState, CanvasNode, PdfNodeData } from "../lib/types";

const projectDir = process.cwd();
const DATA_STATE_PATH = path.join(projectDir, "data", "state.json");
const LOCAL_UPLOADS_DIR = path.join(projectDir, "public", "uploads");

loadEnvConfig(projectDir);

function extractLocalUploadKey(src: string): string | null {
  if (!src.startsWith("/uploads/")) return null;
  return decodeURIComponent(src.slice("/uploads/".length));
}

async function readLocalState(): Promise<AppState> {
  const raw = await fs.readFile(DATA_STATE_PATH, "utf8");
  return JSON.parse(raw) as AppState;
}

async function migratePdfNode(
  node: CanvasNode,
  driver: ReturnType<typeof createSupabaseDriver>
): Promise<boolean> {
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
  const uploaded = await driver.uploadFile(buffer, extension, "application/pdf");
  const stableUrl = await driver.getFileUrl(uploaded.key);
  pdfData.src = stableUrl;
  pdfData.fileName = originalName;
  return true;
}

async function run(): Promise<void> {
  if (process.env.PERSISTENCE && process.env.PERSISTENCE !== "supabase") {
    throw new Error(
      "PERSISTENCE must be `supabase` for migration, or be unset."
    );
  }

  process.env.PERSISTENCE = "supabase";

  const driver = createSupabaseDriver();
  const state = await readLocalState();
  let migratedPdfCount = 0;

  for (const node of state.nodes) {
    const changed = await migratePdfNode(node, driver);
    if (changed) migratedPdfCount += 1;
  }

  await driver.saveState(state);

  console.log(
    `Migration complete. Migrated ${migratedPdfCount} PDF node(s) and saved state to Supabase.`
  );
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
