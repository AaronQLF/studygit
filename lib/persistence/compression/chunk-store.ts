// Content-addressable, deduplicating, zstd-compressed chunk store.
//
// Pipeline on the way in (storeFile):
//   1. Walk the input buffer with FastCDC → variable-size content-defined chunks.
//   2. Hash each chunk's plaintext with sha256. The hash *is* the chunk's name.
//   3. Look up the hash in the local on-disk cache. Hit → skip everything.
//   4. Look up the hash in R2 (HEAD). Hit → another upload (this one or
//      someone else's) already stored it; just record the reference.
//   5. Miss → zstd-compress and PUT to chunks/<aa>/<rest>. Populate the cache.
//   6. Write a manifests/<key>.json that records the ordered chunk hashes.
//
// Pipeline on the way out (streamFileBytes / streamRange):
//   1. Load manifests/<key>.json.
//   2. For each chunk reference, fetch the compressed payload (cache → R2),
//      zstd-decompress, and yield. Range reads slice the first/last chunk
//      and skip everything outside the requested byte window.
//
// Dedup wins:
//   - A student re-uploading a slightly edited PDF only stores the changed
//     chunks (the rest are identified by the same sha256).
//   - Two students sharing a course-pack PDF physically share its chunks.
//   - Slides that share a common header/footer share those chunks across
//     every deck.
// The savings compound across users without any extra coordination, because
// content addressing is by definition globally consistent.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  chunkRanges,
  DEFAULT_FASTCDC_CONFIG,
  type FastCDCConfig,
} from "./fastcdc";
import { compress, decompress, COMPRESSION_INFO } from "./zstd";
import {
  decodeManifest,
  encodeManifest,
  MANIFEST_VERSION,
  type ChunkRef,
  type Manifest,
} from "./manifest";
import { r2BlobStore, type BlobStore } from "../r2-client";

const CHUNK_PREFIX = "chunks/";
const MANIFEST_PREFIX = "manifests/";
const LOCAL_CACHE_DIR = path.join(
  process.cwd(),
  "lib",
  "persistence",
  "cache",
  "shards"
);

// Read chunk-size knobs from env once. Bytes. Defaults are tuned for PDFs
// (the dominant payload here): 64 KiB / 256 KiB / 1 MiB gives a healthy
// dedup-vs-overhead balance per the FastCDC paper's evaluation in §4.
function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error(`Invalid ${name}=${raw}; expected a positive integer.`);
  }
  return n;
}

const CHUNK_CONFIG: FastCDCConfig = {
  minSize: readPositiveIntEnv("CHUNK_MIN", DEFAULT_FASTCDC_CONFIG.minSize),
  avgSize: readPositiveIntEnv("CHUNK_AVG", DEFAULT_FASTCDC_CONFIG.avgSize),
  maxSize: readPositiveIntEnv("CHUNK_MAX", DEFAULT_FASTCDC_CONFIG.maxSize),
};
if (
  CHUNK_CONFIG.minSize > CHUNK_CONFIG.avgSize ||
  CHUNK_CONFIG.avgSize > CHUNK_CONFIG.maxSize
) {
  throw new Error(
    `Invalid chunker config: expected CHUNK_MIN <= CHUNK_AVG <= CHUNK_MAX, got ` +
      `${CHUNK_CONFIG.minSize}/${CHUNK_CONFIG.avgSize}/${CHUNK_CONFIG.maxSize}`
  );
}

function sha256Hex(buf: Buffer | Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

function chunkKey(hash: string): string {
  // Two-level prefix keeps R2 list cardinality bounded and makes ad-hoc
  // ls/du shell scripts pleasant. The hash is already uniform, so the first
  // byte is a perfectly good shard key.
  return `${CHUNK_PREFIX}${hash.slice(0, 2)}/${hash.slice(2)}`;
}

function manifestKey(key: string): string {
  return `${MANIFEST_PREFIX}${key}.json`;
}

function localCachePath(hash: string): string {
  return path.join(LOCAL_CACHE_DIR, hash.slice(0, 2), hash.slice(2));
}

async function localCacheGet(hash: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(localCachePath(hash));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function localCachePut(hash: string, compressed: Buffer): Promise<void> {
  const dir = path.join(LOCAL_CACHE_DIR, hash.slice(0, 2));
  await fs.mkdir(dir, { recursive: true });
  // Best-effort: fail silently for cache writes — the cache is just a
  // latency optimization, not a correctness primitive.
  try {
    await fs.writeFile(localCachePath(hash), compressed);
  } catch {
    // Ignore — out of disk, permission denied, etc. R2 is the source of truth.
  }
}

export type StoreReport = {
  key: string;
  manifest: Manifest;
  /** Bytes actually PUT to R2 across this upload (chunks + manifest). */
  uploadedBytes: number;
  /** Total compressed footprint of the chunks (regardless of dedup). */
  compressedBytes: number;
  /** Logical (plaintext) size. */
  plaintextBytes: number;
  /** How many chunks were already present (cache or R2) and skipped. */
  dedupedChunks: number;
  /** Total chunks the file decomposed into. */
  totalChunks: number;
};

type ChunkStoreOpts = {
  blob?: BlobStore;
};

function blob(opts: ChunkStoreOpts | undefined): BlobStore {
  return opts?.blob ?? r2BlobStore;
}

/**
 * Chunk → dedup → compress → upload, then write the manifest. Returns a
 * report with both wire bytes (uploadedBytes) and storage bytes
 * (compressedBytes) so callers can log meaningful "cold vs. warm" numbers.
 */
export async function storeFile(
  key: string,
  buffer: Buffer,
  mime: string,
  name: string | undefined,
  opts?: ChunkStoreOpts
): Promise<StoreReport> {
  const store = blob(opts);
  const totalSha = sha256Hex(buffer);

  const refs: ChunkRef[] = [];
  let uploadedBytes = 0;
  let compressedBytes = 0;
  let dedupedChunks = 0;
  let totalChunks = 0;

  for (const { start, end } of chunkRanges(buffer, CHUNK_CONFIG)) {
    totalChunks++;
    const slice = buffer.subarray(start, end);
    const h = sha256Hex(slice);
    refs.push({ h, n: slice.length });

    // Cache hit → fully skip both the compress step and the network round-trip.
    const cached = await localCacheGet(h);
    if (cached) {
      compressedBytes += cached.length;
      dedupedChunks++;
      continue;
    }

    // R2 hit → some other upload already stored this chunk. We only pay a
    // HEAD request, not a PUT.
    if (await store.exists(chunkKey(h))) {
      dedupedChunks++;
      continue;
    }

    const compressed = await compress(slice);
    await store.put(chunkKey(h), compressed, "application/zstd", {
      "plaintext-size": String(slice.length),
      "compressed-size": String(compressed.length),
      "zstd-level": String(COMPRESSION_INFO.level),
    });
    await localCachePut(h, compressed);

    uploadedBytes += compressed.length;
    compressedBytes += compressed.length;
  }

  const manifest: Manifest = {
    v: MANIFEST_VERSION,
    name,
    mime,
    size: buffer.length,
    sha256: totalSha,
    chunker: {
      alg: "fastcdc",
      min: CHUNK_CONFIG.minSize,
      avg: CHUNK_CONFIG.avgSize,
      max: CHUNK_CONFIG.maxSize,
    },
    compression: { ...COMPRESSION_INFO },
    chunks: refs,
    createdAt: Date.now(),
  };
  const manifestBuf = encodeManifest(manifest);
  await store.put(manifestKey(key), manifestBuf, "application/json", {
    "plaintext-size": String(buffer.length),
    "chunk-count": String(refs.length),
  });
  uploadedBytes += manifestBuf.length;

  return {
    key,
    manifest,
    uploadedBytes,
    compressedBytes,
    plaintextBytes: buffer.length,
    dedupedChunks,
    totalChunks,
  };
}

export async function loadManifest(
  key: string,
  opts?: ChunkStoreOpts
): Promise<Manifest> {
  const buf = await blob(opts).getBuffer(manifestKey(key));
  return decodeManifest(buf);
}

async function readChunkPlaintext(
  ref: ChunkRef,
  store: BlobStore
): Promise<Buffer> {
  const cached = await localCacheGet(ref.h);
  let compressed: Buffer;
  if (cached) {
    compressed = cached;
  } else {
    compressed = await store.getBuffer(chunkKey(ref.h));
    // Write-through cache. Don't await — first reader pays a cold-cache
    // round-trip but doesn't block on the cache write.
    void localCachePut(ref.h, compressed);
  }
  const plain = await decompress(compressed);
  if (plain.length !== ref.n) {
    throw new Error(
      `Chunk integrity error: ${ref.h} expected ${ref.n} bytes, decompressed to ${plain.length}`
    );
  }
  return plain;
}

/** Stream the full reconstructed file, chunk by chunk. */
export async function* streamFileBytes(
  manifest: Manifest,
  opts?: ChunkStoreOpts
): AsyncGenerator<Buffer> {
  const store = blob(opts);
  for (const ref of manifest.chunks) {
    yield await readChunkPlaintext(ref, store);
  }
}

/**
 * Stream a byte range [rangeStart, rangeEnd] (inclusive on both ends, like
 * HTTP's `Range: bytes=` header). Skips chunks entirely outside the range
 * and slices the first/last chunk so we never decompress more than necessary.
 */
export async function* streamFileRange(
  manifest: Manifest,
  rangeStart: number,
  rangeEnd: number,
  opts?: ChunkStoreOpts
): AsyncGenerator<Buffer> {
  if (rangeStart < 0 || rangeEnd < rangeStart || rangeEnd >= manifest.size) {
    throw new RangeError(
      `Invalid range ${rangeStart}-${rangeEnd} for file of size ${manifest.size}`
    );
  }
  const store = blob(opts);
  let cumulative = 0;
  for (const ref of manifest.chunks) {
    const chunkStart = cumulative;
    const chunkEnd = cumulative + ref.n - 1;
    cumulative += ref.n;

    if (chunkEnd < rangeStart) continue;
    if (chunkStart > rangeEnd) break;

    const plain = await readChunkPlaintext(ref, store);
    const sliceFrom = Math.max(0, rangeStart - chunkStart);
    const sliceTo = Math.min(ref.n, rangeEnd - chunkStart + 1);
    yield plain.subarray(sliceFrom, sliceTo);
  }
}

export async function deleteFile(
  key: string,
  opts?: ChunkStoreOpts
): Promise<void> {
  // Important: we only delete the manifest, not the chunks. Chunks are shared
  // across files via content addressing — eagerly removing them on a single
  // file delete would corrupt every other file that referenced the same
  // bytes. Garbage-collecting orphan chunks is a periodic batch job (mark
  // every chunk reachable from any manifest, sweep the rest) and is left as
  // future work.
  await blob(opts).delete(manifestKey(key));
}

export const __internals = {
  CHUNK_CONFIG,
  CHUNK_PREFIX,
  MANIFEST_PREFIX,
  chunkKey,
  manifestKey,
};
