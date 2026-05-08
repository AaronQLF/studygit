import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getPersistenceMode } from "@/lib/persistence";
import { FILE_STORAGE_PATHS } from "@/lib/persistence/file";
import {
  loadManifest,
  streamFileBytes,
  streamFileRange,
} from "@/lib/persistence/compression/chunk-store";
import type { Manifest } from "@/lib/persistence/compression/manifest";
import { getCurrentUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string }> }
) {
  const { key } = await context.params;
  if (!key) {
    return NextResponse.json({ error: "missing file key" }, { status: 400 });
  }

  // File-mode dev: no auth, no R2, just hand off to the local uploads dir.
  if (getPersistenceMode() !== "supabase") {
    if (FILE_STORAGE_PATHS.external) {
      // In Electron the uploads dir is outside the Next public/ tree, so we
      // can't 302 to /uploads/<key>; stream the file from disk directly.
      return serveLocalFile(key);
    }
    const localUrl = `/uploads/${encodeURIComponent(key)}`;
    return NextResponse.redirect(new URL(localUrl, request.url), {
      status: 302,
    });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let manifest: Manifest;
  try {
    manifest = await loadManifest(key);
  } catch (err) {
    return NextResponse.json(
      { error: "not_found", detail: (err as Error).message },
      { status: 404 }
    );
  }

  const range = parseRangeHeader(request.headers.get("range"), manifest.size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${manifest.size}` },
    });
  }

  // ETag is `manifest.sha256` quoted — strong validator since the file is
  // immutable for a given key. Lets the browser short-circuit with 304.
  const etag = `"${manifest.sha256}"`;
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": manifest.mime,
    "Accept-Ranges": "bytes",
    ETag: etag,
    // Per-user content; kept short to keep deletes responsive.
    "Cache-Control": "private, max-age=300",
  };

  if (range) {
    const [start, end] = range;
    const length = end - start + 1;
    const stream = toReadableStream(
      streamFileRange(manifest, start, end)
    );
    return new Response(stream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(length),
        "Content-Range": `bytes ${start}-${end}/${manifest.size}`,
      },
    });
  }

  const stream = toReadableStream(streamFileBytes(manifest));
  return new Response(stream, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(manifest.size),
    },
  });
}

// Parse a `Range: bytes=START-END` header. We support a single range only,
// which is what PDF.js, video tags, and curl all need; multipart ranges are
// out of scope.
function parseRangeHeader(
  header: string | null,
  totalSize: number
): [number, number] | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;
  if (rawStart === "" && rawEnd === "") return "invalid";
  if (rawStart === "") {
    // Suffix range: last N bytes.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? totalSize - 1 : Number(rawEnd);
  }
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    end >= totalSize
  ) {
    return "invalid";
  }
  return [start, end];
}

function toReadableStream(
  source: AsyncIterable<Buffer>
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const buf of source) {
          // Buffer is a Uint8Array, but enqueue wants the plain shape.
          controller.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

// Stream a file out of FILE_STORAGE_PATHS.uploadDir for the Electron build,
// where uploads live outside the read-only install dir. The key has already
// been routed through Next's URL parser so it can't escape the segment, but
// we still resolve and assert containment as a defense-in-depth check
// against `..` smuggled through alternate encodings.
async function serveLocalFile(key: string): Promise<Response> {
  const decoded = decodeURIComponent(key);
  const fullPath = path.resolve(FILE_STORAGE_PATHS.uploadDir, decoded);
  const root = path.resolve(FILE_STORAGE_PATHS.uploadDir) + path.sep;
  if (fullPath !== path.resolve(FILE_STORAGE_PATHS.uploadDir) && !fullPath.startsWith(root)) {
    return NextResponse.json({ error: "invalid key" }, { status: 400 });
  }
  let stat;
  try {
    stat = await fs.stat(fullPath);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!stat.isFile()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const ext = path.extname(decoded).toLowerCase();
  const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const nodeStream = createReadStream(fullPath);
  return new Response(Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=300",
    },
  });
}
