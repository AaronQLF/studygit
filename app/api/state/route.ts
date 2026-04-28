import { NextResponse } from "next/server";
import { getDriver } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getDriver().loadState());
}

export async function PUT(request: Request) {
  await getDriver().saveState(await request.json());
  return NextResponse.json({ ok: true });
}
