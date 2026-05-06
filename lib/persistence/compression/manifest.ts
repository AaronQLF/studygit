// A "logical file" in our store is just a manifest. The manifest is a tiny
// JSON object that lists the content-addressed chunks (by sha256 of plaintext)
// in order, plus enough metadata to reconstitute the bytes verbatim and to
// detect tampering or version drift.
//
// Storage layout in R2:
//   manifests/<key>.json      — one per logical file
//   chunks/<aa>/<rest-of-hash> — zstd-compressed plaintext chunk
//
// The two-level chunk prefix keeps R2 list/scan cardinality reasonable
// (~256 second-level prefixes max) without a full sharding scheme.

export const MANIFEST_VERSION = 1 as const;

export type ChunkRef = {
  /** sha256(plaintext_chunk), lowercase hex. */
  h: string;
  /** Plaintext (decompressed) length in bytes. */
  n: number;
};

export type Manifest = {
  v: typeof MANIFEST_VERSION;
  /** Original filename (best-effort, may be undefined). */
  name?: string;
  /** MIME type to use as Content-Type on the way out. */
  mime: string;
  /** Total decompressed (logical) size in bytes — pre-chunking total. */
  size: number;
  /** sha256 of the entire concatenated plaintext, lowercase hex. */
  sha256: string;
  /** The chunker that produced these chunks — captured to enable migrations. */
  chunker: {
    alg: "fastcdc";
    min: number;
    avg: number;
    max: number;
  };
  /** Per-chunk compression metadata. dictId !== null implies a trained dict. */
  compression: {
    alg: "zstd";
    level: number;
    dictId: string | null;
  };
  /** Ordered list of chunks. Concatenating their plaintext yields the file. */
  chunks: ChunkRef[];
  /** Wall-clock time the manifest was written, ms since epoch. */
  createdAt: number;
};

export function encodeManifest(m: Manifest): Buffer {
  return Buffer.from(JSON.stringify(m), "utf8");
}

export function decodeManifest(buf: Buffer): Manifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(buf.toString("utf8"));
  } catch (err) {
    throw new Error(
      `Failed to parse manifest JSON: ${(err as Error).message}`
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { v?: unknown }).v !== MANIFEST_VERSION
  ) {
    throw new Error(
      `Unsupported manifest version: ${(parsed as { v?: unknown })?.v ?? "<missing>"}`
    );
  }
  return parsed as Manifest;
}

/** Cumulative byte offsets — index 0 is 0, index N is the total size. */
export function chunkOffsets(m: Manifest): number[] {
  const offsets = new Array<number>(m.chunks.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < m.chunks.length; i++) {
    offsets[i + 1] = offsets[i] + m.chunks[i].n;
  }
  return offsets;
}
