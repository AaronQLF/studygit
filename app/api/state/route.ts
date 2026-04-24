import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { INITIAL_STATE } from "@/lib/defaults";
import type { AppState } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");

async function ensureStateFile(): Promise<AppState> {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    return JSON.parse(raw) as AppState;
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify(INITIAL_STATE, null, 2));
    return INITIAL_STATE;
  }
}

export async function GET() {
  const state = await ensureStateFile();
  return NextResponse.json(state);
}

export async function PUT(request: Request) {
  const body = (await request.json()) as AppState;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(body, null, 2));
  return NextResponse.json({ ok: true });
}
