// Cloudflare R2 client. R2 is S3-API-compatible, so we reuse the AWS SDK
// with a custom endpoint and the magic region "auto". The credentials are
// R2 API tokens minted in the Cloudflare dashboard, not AWS IAM keys.
//
// We expose a tiny `BlobStore` shape on top of the SDK so the rest of the
// persistence layer never imports `@aws-sdk/*` directly. That keeps the
// chunk store testable (you can hand it an in-memory implementation) and
// frees us to swap providers later (R2 → S3 → MinIO) without touching the
// compression code.

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

let cached: { client: S3Client; bucket: string } | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export function getR2(): { client: S3Client; bucket: string } {
  if (cached) return cached;
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const bucket = requireEnv("R2_BUCKET");
  const endpoint =
    process.env.R2_ENDPOINT ||
    `https://${accountId}.r2.cloudflarestorage.com`;
  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // Force path-style even though Cloudflare supports virtual-hosted-style;
    // path-style works against custom endpoints (MinIO, localstack) too,
    // which is convenient for local dev/tests.
    forcePathStyle: true,
  });
  cached = { client, bucket };
  return cached;
}

export type BlobObject = {
  key: string;
  size: number;
  lastModified: Date;
};

export type BlobStore = {
  exists(key: string): Promise<boolean>;
  put(
    key: string,
    body: Buffer,
    contentType?: string,
    metadata?: Record<string, string>
  ): Promise<void>;
  getBuffer(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /**
   * Stream every object under `prefix`, paginating transparently. Yields
   * `BlobObject`s with size + lastModified so callers (e.g. the GC) can
   * filter by age without an extra HEAD round-trip.
   */
  list(prefix: string): AsyncIterable<BlobObject>;
  /**
   * Delete up to ~1000 keys per request. The S3 batch API caps each call at
   * 1000 keys, so this implementation chunks larger inputs internally.
   * Returns the keys that failed to delete with their error messages.
   */
  deleteMany(keys: string[]): Promise<{ key: string; error: string }[]>;
};

function isNotFound(err: unknown): boolean {
  if (err instanceof S3ServiceException) {
    return err.name === "NotFound" || err.$metadata?.httpStatusCode === 404;
  }
  // Older SDK shapes also surface a generic "NotFound" / "NoSuchKey".
  const name = (err as { name?: string })?.name;
  const status = (err as { $metadata?: { httpStatusCode?: number } })
    ?.$metadata?.httpStatusCode;
  return name === "NotFound" || name === "NoSuchKey" || status === 404;
}

export const r2BlobStore: BlobStore = {
  async exists(key) {
    const { client, bucket } = getR2();
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  },

  async put(key, body, contentType, metadata) {
    const { client, bucket } = getR2();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      })
    );
  },

  async getBuffer(key) {
    const { client, bucket } = getR2();
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    const body = res.Body;
    if (!body) throw new Error(`R2 object ${key} returned empty body`);
    if (body instanceof Readable) {
      const parts: Buffer[] = [];
      for await (const piece of body) {
        parts.push(
          typeof piece === "string"
            ? Buffer.from(piece)
            : Buffer.from(piece as Uint8Array)
        );
      }
      return Buffer.concat(parts);
    }
    // Web stream / Blob fallback — Next.js may swap Readable for a web stream
    // depending on runtime.
    if (typeof (body as ReadableStream).getReader === "function") {
      const reader = (body as ReadableStream<Uint8Array>).getReader();
      const parts: Buffer[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) parts.push(Buffer.from(value));
      }
      return Buffer.concat(parts);
    }
    throw new Error("Unsupported R2 response body type");
  },

  async delete(key) {
    const { client, bucket } = getR2();
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key })
    );
  },

  async *list(prefix) {
    const { client, bucket } = getR2();
    let continuationToken: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );
      for (const obj of res.Contents ?? []) {
        if (!obj.Key) continue;
        yield {
          key: obj.Key,
          size: obj.Size ?? 0,
          // S3 always sets LastModified on listed objects; fall back to
          // epoch defensively so the GC's grace check stays well-defined.
          lastModified: obj.LastModified ?? new Date(0),
        };
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);
  },

  async deleteMany(keys) {
    if (keys.length === 0) return [];
    const { client, bucket } = getR2();
    const failures: { key: string; error: string }[] = [];
    // S3 caps DeleteObjects at 1000 keys per request.
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      try {
        const res = await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: batch.map((k) => ({ Key: k })),
              Quiet: true,
            },
          })
        );
        for (const err of res.Errors ?? []) {
          if (err.Key) {
            failures.push({
              key: err.Key,
              error: err.Message ?? err.Code ?? "unknown error",
            });
          }
        }
      } catch (err) {
        // Whole-batch failure (network, auth, etc). Mark every key failed
        // so the caller can decide whether to retry the whole pass.
        const msg = (err as Error).message;
        for (const k of batch) failures.push({ key: k, error: msg });
      }
    }
    return failures;
  },
};
