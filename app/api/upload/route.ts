import { NextResponse } from "next/server";
import path from "path";
import { getDriver, getPersistenceMode } from "@/lib/persistence";
import { getCurrentUser } from "@/lib/server/auth";

export const runtime = "nodejs";

// Hard cap on a single upload. The whole file is buffered in memory for
// chunking/compression, so an unbounded upload is a trivial OOM vector.
// 100 MB comfortably covers textbook-sized PDFs.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  let ownerId: string | null = null;
  if (getPersistenceMode() === "supabase") {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    ownerId = user.id;
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "expected multipart/form-data" },
      { status: 400 }
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing file field" },
      { status: 400 }
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `file too large — max ${Math.round(
          MAX_UPLOAD_BYTES / 1024 / 1024
        )} MB`,
      },
      { status: 413 }
    );
  }

  const originalName = file.name || "upload.pdf";
  const extension = path.extname(originalName) || ".pdf";
  const mimeType = file.type || "application/pdf";
  const buffer = Buffer.from(await file.arrayBuffer());

  const uploaded = await getDriver().uploadFile(
    buffer,
    extension,
    mimeType,
    ownerId
  );
  const url = await getDriver().getFileUrl(uploaded.key);

  return NextResponse.json({
    url,
    key: uploaded.key,
    name: originalName,
    size: file.size,
  });
}
