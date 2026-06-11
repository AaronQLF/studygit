import { NextResponse } from "next/server";
import { getDriver, getPersistenceMode } from "@/lib/persistence";
import { getCurrentUser } from "@/lib/server/auth";
import type { AppState } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAuthIfSupabase(): Promise<Response | null> {
  if (getPersistenceMode() !== "supabase") return null;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const unauthorized = await requireAuthIfSupabase();
  if (unauthorized) return unauthorized;
  return NextResponse.json(await getDriver().loadState());
}

async function handleSave(request: Request): Promise<Response> {
  const unauthorized = await requireAuthIfSupabase();
  if (unauthorized) return unauthorized;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  const result = await getDriver().saveState(body as AppState);
  if (!result.ok) {
    // Another tab/device saved a newer snapshot first. The client
    // re-loads and reconciles; nothing was overwritten.
    return NextResponse.json({ error: "version_conflict" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  return handleSave(request);
}

// Unload-time flush path. `navigator.sendBeacon` only speaks POST, so the
// client uses this method when the user is closing the window with dirty
// state. The semantics are identical to PUT — overwrite the persisted
// snapshot. Kept as a thin alias so the regular save path stays on PUT
// and HTTP semantics stay clean.
export async function POST(request: Request) {
  return handleSave(request);
}
