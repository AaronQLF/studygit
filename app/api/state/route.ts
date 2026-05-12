import { NextResponse } from "next/server";
import { getDriver, getPersistenceMode } from "@/lib/persistence";
import { getCurrentUser } from "@/lib/server/auth";

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

export async function PUT(request: Request) {
  const unauthorized = await requireAuthIfSupabase();
  if (unauthorized) return unauthorized;
  await getDriver().saveState(await request.json());
  return NextResponse.json({ ok: true });
}

// Unload-time flush path. `navigator.sendBeacon` only speaks POST, so the
// client uses this method when the user is closing the window with dirty
// state. The semantics are identical to PUT — overwrite the persisted
// snapshot. Kept as a thin alias so the regular save path stays on PUT
// and HTTP semantics stay clean.
export async function POST(request: Request) {
  const unauthorized = await requireAuthIfSupabase();
  if (unauthorized) return unauthorized;
  await getDriver().saveState(await request.json());
  return NextResponse.json({ ok: true });
}
