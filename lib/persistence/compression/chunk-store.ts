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
  type PrecompressMeta,
} from "./manifest";
import { maybePrecompressPdf } from "./pdf-precompress";
import { r2BlobStore, type BlobObject, type BlobStore } from "../r2-client";

const CHUNK_PREFIX = "chunks/";
const MANIFEST_PREFIX = "manifests/";
function resolveLocalCacheDir(): string | null {
  const explicit = process.env.LOCAL_CHUNK_CACHE_DIR?.trim();
  if (explicit) return explicit;
  if (process.env.DISABLE_LOCAL_CHUNK_CACHE === "1") return null;
  // Vercel lambdas run from a read-only source tree (`/var/task`) and are
  // ephemeral, so this cache both fails on write and has poor hit rates.
  if (process.env.VERCEL === "1") return null;
  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "lib",
    "persistence",
    "cache",
    "shards"
  );
}

const LOCAL_CACHE_DIR = resolveLocalCacheDir();

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

function localCachePath(hash: string): string | null {
  if (!LOCAL_CACHE_DIR) return null;
  return path.join(LOCAL_CACHE_DIR, hash.slice(0, 2), hash.slice(2));
}

async function localCacheGet(hash: string): Promise<Buffer | null> {
  const cachePath = localCachePath(hash);
  if (!cachePath) return null;
  try {
    return await fs.readFile(cachePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function localCachePut(hash: string, compressed: Buffer): Promise<void> {
  const cachePath = localCachePath(hash);
  if (!cachePath) return;
  const dir = path.dirname(cachePath);
  // Best-effort: fail silently for cache writes — the cache is just a latency
  // optimization, not a correctness primitive.
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(cachePath, compressed);
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
  /** Logical (plaintext) size — bytes handed to the chunker. */
  plaintextBytes: number;
  /** As-uploaded size, before any pre-compression layer. */
  originalBytes: number;
  /** Pre-chunk content-aware optimization applied (PDF only, today). */
  precompress: PrecompressMeta | null;
  /** Set when pre-compression was attempted but skipped/no-op. */
  precompressSkipReason?: string;
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
  const originalBytes = buffer.length;

  // Content-aware pre-compression. For PDFs this re-emits the file with
  // object streams + xref streams, which is the only layer that *actually*
  // shrinks already-internally-compressed PDFs (zstd over JPEG/FlateDecode
  // streams gives near-zero gain). Returns the original buffer untouched
  // for non-PDFs, encrypted PDFs, parse errors, or when re-saving wouldn't
  // be smaller — so this is a strict best-of(original, optimized).
  const precompressed = await maybePrecompressPdf(buffer, mime);
  const inputBuf = precompressed.buffer;
  const totalSha = sha256Hex(inputBuf);

  const refs: ChunkRef[] = [];
  let uploadedBytes = 0;
  let compressedBytes = 0;
  let dedupedChunks = 0;
  let totalChunks = 0;

  for (const { start, end } of chunkRanges(inputBuf, CHUNK_CONFIG)) {
    totalChunks++;
    const slice = inputBuf.subarray(start, end);
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
    size: inputBuf.length,
    sha256: totalSha,
    chunker: {
      alg: "fastcdc",
      min: CHUNK_CONFIG.minSize,
      avg: CHUNK_CONFIG.avgSize,
      max: CHUNK_CONFIG.maxSize,
    },
    compression: { ...COMPRESSION_INFO },
    precompress: precompressed.applied,
    chunks: refs,
    createdAt: Date.now(),
  };
  const manifestBuf = encodeManifest(manifest);
  await store.put(manifestKey(key), manifestBuf, "application/json", {
    "plaintext-size": String(inputBuf.length),
    "chunk-count": String(refs.length),
  });
  uploadedBytes += manifestBuf.length;

  return {
    key,
    manifest,
    uploadedBytes,
    compressedBytes,
    plaintextBytes: inputBuf.length,
    originalBytes,
    precompress: precompressed.applied,
    precompressSkipReason: precompressed.skipReason,
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

/**
 * Delete a logical file by removing its manifest. Chunks are intentionally
 * left in place because they are shared across files via content addressing
 * — eagerly removing them here would corrupt every other file that
 * referenced the same bytes. Reclaim orphan chunks periodically with
 * `gcOrphanChunks` (mark-and-sweep over manifests with a grace period to
 * cover the in-flight upload race).
 */
export async function deleteFile(
  key: string,
  opts?: ChunkStoreOpts
): Promise<void> {
  await blob(opts).delete(manifestKey(key));
}

// Default 24h grace period: the upload pipeline writes chunks before the
// manifest, so a chunk could be unreferenced for the duration of an upload.
// 24h is comfortably longer than any plausible single upload, even on a slow
// link, and protects against clock skew between the GC host and R2.
const DEFAULT_GRACE_MS = 24 * 60 * 60 * 1000;

export type GcOptions = {
  blob?: BlobStore;
  /** Skip objects newer than `now - graceMs`. Defaults to 24h. */
  graceMs?: number;
  /** When true, compute the report but don't actually delete anything. */
  dryRun?: boolean;
  /** Optional progress callback (for CLI logging). */
  onProgress?: (msg: string) => void;
};

export type GcChunkReport = {
  /** Manifest objects walked from R2. */
  manifestsScanned: number;
  /** Manifests we couldn't parse (skipped — they keep their chunks alive). */
  manifestsCorrupt: number;
  /** Distinct chunk hashes referenced by some live manifest. */
  reachableChunks: number;
  /** Chunk objects walked from R2. */
  chunksScanned: number;
  /** Chunks not referenced by any manifest. */
  orphanCandidates: number;
  /** Orphans newer than the grace cutoff (skipped this run). */
  protectedByGrace: number;
  /** Chunks that were (or would be, in dry-run) deleted. */
  deletedChunks: number;
  /** Bytes reclaimed (or that would be reclaimed in dry-run). */
  deletedBytes: number;
  /** Per-key delete failures from the bucket layer. */
  errors: { key: string; error: string }[];
};

function chunkHashFromKey(key: string): string | null {
  if (!key.startsWith(CHUNK_PREFIX)) return null;
  const rest = key.slice(CHUNK_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  return rest.slice(0, slash) + rest.slice(slash + 1);
}

function manifestKeyToFileKey(objectKey: string): string | null {
  if (!objectKey.startsWith(MANIFEST_PREFIX)) return null;
  const rest = objectKey.slice(MANIFEST_PREFIX.length);
  if (!rest.endsWith(".json")) return null;
  return rest.slice(0, -".json".length);
}

/**
 * Mark-and-sweep over the chunk store. Reads every manifest, builds the
 * reachable set of chunk hashes, lists every chunk, and deletes the unreached
 * ones older than the grace period. Safe to interleave with normal uploads:
 * the grace period covers the window between writing a chunk and writing
 * the manifest that references it.
 */
export async function gcOrphanChunks(opts?: GcOptions): Promise<GcChunkReport> {
  const store = blob(opts);
  const graceMs = opts?.graceMs ?? DEFAULT_GRACE_MS;
  const dryRun = opts?.dryRun ?? false;
  const log = opts?.onProgress ?? (() => {});

  const reachable = new Set<string>();
  let manifestsScanned = 0;
  let manifestsCorrupt = 0;

  log(`Scanning manifests (prefix=${MANIFEST_PREFIX})...`);
  for await (const obj of store.list(MANIFEST_PREFIX)) {
    manifestsScanned++;
    try {
      const buf = await store.getBuffer(obj.key);
      const m = decodeManifest(buf);
      for (const ref of m.chunks) reachable.add(ref.h);
    } catch (err) {
      manifestsCorrupt++;
      log(`  ! corrupt manifest ${obj.key}: ${(err as Error).message}`);
    }
  }
  log(
    `Manifests: ${manifestsScanned} scanned (${manifestsCorrupt} corrupt), ` +
      `reachable chunks: ${reachable.size}`
  );

  const cutoff = Date.now() - graceMs;
  const toDelete: BlobObject[] = [];
  let chunksScanned = 0;
  let orphanCandidates = 0;
  let protectedByGrace = 0;

  log(`Scanning chunks (prefix=${CHUNK_PREFIX})...`);
  for await (const obj of store.list(CHUNK_PREFIX)) {
    chunksScanned++;
    const hash = chunkHashFromKey(obj.key);
    if (!hash) continue;
    if (reachable.has(hash)) continue;
    orphanCandidates++;
    if (obj.lastModified.getTime() > cutoff) {
      protectedByGrace++;
      continue;
    }
    toDelete.push(obj);
  }
  log(
    `Chunks: ${chunksScanned} scanned, ${orphanCandidates} orphan ` +
      `(${protectedByGrace} protected by grace, ${toDelete.length} eligible)`
  );

  let deletedBytes = 0;
  for (const obj of toDelete) deletedBytes += obj.size;

  const errors: { key: string; error: string }[] = [];
  if (!dryRun && toDelete.length > 0) {
    log(`Deleting ${toDelete.length} chunks...`);
    const failures = await store.deleteMany(toDelete.map((o) => o.key));
    errors.push(...failures);
    if (failures.length) {
      // Don't claim bytes we didn't actually free.
      const failedKeys = new Set(failures.map((f) => f.key));
      deletedBytes = toDelete
        .filter((o) => !failedKeys.has(o.key))
        .reduce((sum, o) => sum + o.size, 0);
    }
  }

  return {
    manifestsScanned,
    manifestsCorrupt,
    reachableChunks: reachable.size,
    chunksScanned,
    orphanCandidates,
    protectedByGrace,
    deletedChunks: toDelete.length - errors.length,
    deletedBytes,
    errors,
  };
}

export type GcManifestOptions = GcOptions & {
  /**
   * Set of file keys (the `<key>` in `manifests/<key>.json`) that are still
   * referenced by application state. Anything in R2 not in this set is an
   * orphan candidate.
   */
  liveKeys: Set<string>;
};

export type GcManifestReport = {
  manifestsScanned: number;
  /** Manifests whose key is not in `liveKeys`. */
  orphanCandidates: number;
  /** Orphans newer than the grace cutoff (skipped). */
  protectedByGrace: number;
  /** Manifests that were (or would be, in dry-run) deleted. */
  deletedManifests: number;
  errors: { key: string; error: string }[];
};

/**
 * Sweep manifests whose file key is no longer referenced by application
 * state. Caller provides the live key set (typically derived from a DB
 * query over node `data.src` URLs); anything in R2 not in that set and
 * older than the grace period is removed.
 *
 * Run this BEFORE `gcOrphanChunks` so the chunk sweep sees the up-to-date
 * reachability set.
 */
export async function gcOrphanManifests(
  opts: GcManifestOptions
): Promise<GcManifestReport> {
  const store = blob(opts);
  const graceMs = opts.graceMs ?? DEFAULT_GRACE_MS;
  const dryRun = opts.dryRun ?? false;
  const log = opts.onProgress ?? (() => {});
  const cutoff = Date.now() - graceMs;

  const toDelete: BlobObject[] = [];
  let manifestsScanned = 0;
  let orphanCandidates = 0;
  let protectedByGrace = 0;

  log(
    `Scanning manifests against live key set (size=${opts.liveKeys.size})...`
  );
  for await (const obj of store.list(MANIFEST_PREFIX)) {
    manifestsScanned++;
    const fileKey = manifestKeyToFileKey(obj.key);
    if (!fileKey) continue;
    if (opts.liveKeys.has(fileKey)) continue;
    orphanCandidates++;
    if (obj.lastModified.getTime() > cutoff) {
      protectedByGrace++;
      continue;
    }
    toDelete.push(obj);
  }
  log(
    `Manifests: ${manifestsScanned} scanned, ${orphanCandidates} orphan ` +
      `(${protectedByGrace} protected by grace, ${toDelete.length} eligible)`
  );

  const errors: { key: string; error: string }[] = [];
  if (!dryRun && toDelete.length > 0) {
    log(`Deleting ${toDelete.length} manifests...`);
    const failures = await store.deleteMany(toDelete.map((o) => o.key));
    errors.push(...failures);
  }

  return {
    manifestsScanned,
    orphanCandidates,
    protectedByGrace,
    deletedManifests: toDelete.length - errors.length,
    errors,
  };
}

export const __internals = {
  CHUNK_CONFIG,
  CHUNK_PREFIX,
  MANIFEST_PREFIX,
  chunkKey,
  manifestKey,
  chunkHashFromKey,
  manifestKeyToFileKey,
};
