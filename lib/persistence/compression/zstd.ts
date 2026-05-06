import * as zstd from "@mongodb-js/zstd";

// Default compression level. zstd's level 19 is the high end of the "regular"
// (non-ultra) range — much slower than the default 3 but typically 5–15%
// smaller. Since we only compress *unique* chunks (CAS dedup happens first),
// paying for level 19 once per chunk is a great trade.
//
// Override at deploy time via ZSTD_LEVEL if you want to tune for the
// upload-throughput vs. storage-cost ratio of your workload.
function readLevel(): number {
  const raw = process.env.ZSTD_LEVEL;
  if (!raw) return 19;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 22) {
    throw new Error(
      `Invalid ZSTD_LEVEL=${raw}; expected an integer in [1, 22] (use 1–9 for fast, 19+ for ultra).`
    );
  }
  return Math.trunc(n);
}

export const ZSTD_LEVEL = readLevel();

export const COMPRESSION_INFO = {
  alg: "zstd" as const,
  level: ZSTD_LEVEL,
  // dictId is reserved for the upcoming trained-dictionary path. The current
  // @mongodb-js/zstd binding doesn't surface dictionary APIs, but we already
  // record the field in every manifest so we can flip on dict mode without
  // a manifest version bump.
  dictId: null as string | null,
};

export async function compress(
  data: Buffer,
  level: number = ZSTD_LEVEL
): Promise<Buffer> {
  return zstd.compress(data, level);
}

export async function decompress(data: Buffer): Promise<Buffer> {
  return zstd.decompress(data);
}
