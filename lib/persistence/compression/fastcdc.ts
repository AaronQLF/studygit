// FastCDC content-defined chunking, after:
//   Xia et al., "FastCDC: a Fast and Efficient Content-Defined Chunking
//   Approach for Data Deduplication", USENIX ATC '16.
// https://www.usenix.org/conference/atc16/technical-sessions/presentation/xia
//
// FastCDC walks bytes one at a time, maintaining a rolling Gear hash and
// emitting a cut whenever (hash & MASK) === 0. Two masks ("strict" before the
// average target, "loose" after it) keep chunk sizes tightly distributed
// around `avgSize` while staying robust to insertions/deletions: editing a
// few bytes invalidates only the immediately surrounding chunk, never the
// rest of the file. That property is what makes content-addressed dedup
// across revisions and across users actually work.
//
// We use a 32-bit Gear hash for V8-friendliness (no BigInt) and 32-bit masks.
// Both the gear table and masks are seeded so chunking is deterministic
// across processes — critical for cross-instance dedup.

export type FastCDCConfig = {
  /** Smallest possible chunk. The roller never cuts below this. */
  minSize: number;
  /** Average chunk size target — sets the bit count of the masks. */
  avgSize: number;
  /** Hard upper bound. Forces a cut even if no boundary was found. */
  maxSize: number;
};

export const DEFAULT_FASTCDC_CONFIG: FastCDCConfig = {
  minSize: 64 * 1024, // 64 KiB
  avgSize: 256 * 1024, // 256 KiB
  maxSize: 1024 * 1024, // 1 MiB
};

// Tiny xorshift32. Used only to derive the gear table + masks from fixed
// seeds so every node, every process, every replay computes the same cuts.
function xorshift32(seed: number): () => number {
  let s = seed >>> 0;
  if (s === 0) s = 0x9E3779B9; // Avoid the all-zero fixed point.
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s >>>= 0;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
}

const GEAR_SEED = 0xC0DEC0DE;
const MASK_S_SEED = 0xA5A5A5A5;
const MASK_L_SEED = 0x5A5A5A5A;

function buildGearTable(seed: number): Uint32Array {
  const rng = xorshift32(seed);
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) t[i] = rng();
  return t;
}

// Build a 32-bit mask with exactly `bits` 1-bits, scattered using the seeded
// PRNG. Probability of a random hash matching the mask is ~2^-bits per byte,
// so the expected boundary distance is 2^bits bytes. We cap to 30 to avoid
// touching the sign bit and to keep the strict-mask phase reasonable.
function buildMask(bits: number, seed: number): number {
  const rng = xorshift32(seed);
  let mask = 0;
  let placed = 0;
  const cap = Math.min(bits, 30);
  while (placed < cap) {
    const bitPos = rng() % 30;
    const bitVal = 1 << bitPos;
    if ((mask & bitVal) === 0) {
      mask |= bitVal;
      placed++;
    }
  }
  return mask >>> 0;
}

const GEAR = buildGearTable(GEAR_SEED);

// Cache masks per (avgSize) so we don't rebuild them every chunkBuffer call.
const maskCache = new Map<number, { S: number; L: number }>();
function masksForAvg(avgSize: number): { S: number; L: number } {
  const cached = maskCache.get(avgSize);
  if (cached) return cached;
  // log2(avgSize) is the "natural" bit count. Strict mask sets ~+2 more bits
  // (4× rarer cuts → reluctance to cut early) and loose mask ~-2 (4× more
  // common cuts → eagerness to cut late). This is the normalized chunking
  // trick from §3.3 of the paper.
  const log2 = Math.round(Math.log2(avgSize));
  const S = Math.min(Math.max(log2 + 2, 8), 28);
  const L = Math.min(Math.max(log2 - 2, 8), 28);
  const masks = {
    S: buildMask(S, MASK_S_SEED),
    L: buildMask(L, MASK_L_SEED),
  };
  maskCache.set(avgSize, masks);
  return masks;
}

export type ChunkRange = { start: number; end: number };

// Find the cut offset for a chunk that starts at `start` in `data`.
// Returns the absolute end offset (exclusive). Chunk length = end - start.
function findCutOffset(
  data: Uint8Array,
  start: number,
  cfg: FastCDCConfig,
  maskS: number,
  maskL: number
): number {
  const remaining = data.length - start;
  if (remaining <= cfg.minSize) return data.length;

  const limit = Math.min(cfg.maxSize, remaining);
  const normal = Math.min(cfg.avgSize, limit);

  let hash = 0;
  // FastCDC seeds the rolling hash at 0 at every chunk boundary and refuses
  // to consider cuts inside the first minSize bytes — this is the part that
  // makes the boundaries content-defined yet bounded.
  let i = cfg.minSize;

  // Phase 1 (strict mask): from minSize up to avgSize. Cuts here are
  // deliberately rare so undersized chunks are pushed toward avgSize.
  while (i < normal) {
    hash = ((hash << 1) + GEAR[data[start + i]]) >>> 0;
    if ((hash & maskS) === 0) return start + i;
    i++;
  }
  // Phase 2 (loose mask): from avgSize up to maxSize. Cuts are common here,
  // so oversized chunks are pulled back toward avgSize.
  while (i < limit) {
    hash = ((hash << 1) + GEAR[data[start + i]]) >>> 0;
    if ((hash & maskL) === 0) return start + i;
    i++;
  }
  return start + limit;
}

/**
 * Yield the (start, end) ranges of FastCDC chunks for `data`. Pure function
 * of `data` and `cfg` — call it twice with the same inputs and you get the
 * same cuts.
 */
export function* chunkRanges(
  data: Uint8Array,
  cfg: FastCDCConfig = DEFAULT_FASTCDC_CONFIG
): Generator<ChunkRange> {
  const { S, L } = masksForAvg(cfg.avgSize);
  let pos = 0;
  while (pos < data.length) {
    const end = findCutOffset(data, pos, cfg, S, L);
    yield { start: pos, end };
    pos = end;
  }
}

/** Convenience wrapper that returns concrete Buffer slices instead of ranges. */
export function chunkBuffer(
  data: Buffer,
  cfg: FastCDCConfig = DEFAULT_FASTCDC_CONFIG
): Buffer[] {
  const out: Buffer[] = [];
  for (const { start, end } of chunkRanges(data, cfg)) {
    out.push(data.subarray(start, end));
  }
  return out;
}
