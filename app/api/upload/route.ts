import { NextResponse } from "next/server";
import path from "path";
import { getDriver } from "@/lib/persistence";

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

  const originalName = file.name || "upload.pdf";
  const extension = path.extname(originalName) || ".pdf";
  const mimeType = file.type || "application/pdf";
  const buffer = Buffer.from(await file.arrayBuffer());

  const uploaded = await getDriver().uploadFile(
    buffer,
    extension,
    mimeType
  );
  const url = await getDriver().getFileUrl(uploaded.key);

  return NextResponse.json({
    url,
    key: uploaded.key,
    name: originalName,
    size: file.size,
  });
}
