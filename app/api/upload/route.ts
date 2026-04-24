import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";

const MAX_BYTES = 40 * 1024 * 1024; // 40 MB
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export const runtime = "nodejs";

export async function POST(request: Request) {
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

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large; max ${MAX_BYTES / (1024 * 1024)}MB` },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const id = nanoid(12);
  const originalName = file.name || "upload.pdf";
  const safeExt =
    path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "") ||
    ".pdf";
  const storedName = `${id}${safeExt}`;
  const target = path.join(UPLOAD_DIR, storedName);
  await fs.writeFile(target, buffer);

  return NextResponse.json({
    url: `/uploads/${storedName}`,
    name: originalName,
    size: file.size,
  });
}
