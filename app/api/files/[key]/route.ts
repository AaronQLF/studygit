import { NextResponse } from "next/server";
import { getPersistenceMode } from "@/lib/persistence";
import { getSupabaseSignedFileUrl } from "@/lib/persistence/supabase";
import { getCurrentUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string }> }
) {
  const { key } = await context.params;
  if (!key) {
    return NextResponse.json({ error: "missing file key" }, { status: 400 });
  }

  if (getPersistenceMode() === "supabase") {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const signedUrl = await getSupabaseSignedFileUrl(key);
    return NextResponse.redirect(signedUrl, { status: 302 });
  }

  const localUrl = `/uploads/${encodeURIComponent(key)}`;
  return NextResponse.redirect(localUrl, { status: 302 });
}
