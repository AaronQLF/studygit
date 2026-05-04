import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/server/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeNext(value: string | null): string {
  if (!value) return "/app";
  if (!value.startsWith("/") || value.startsWith("//")) return "/app";
  return value;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"));

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const failure = new URL("/login", req.url);
      failure.searchParams.set("error", error.message);
      return NextResponse.redirect(failure);
    }
  }

  return NextResponse.redirect(new URL(next, req.url));
}
