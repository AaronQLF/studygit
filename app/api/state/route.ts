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
