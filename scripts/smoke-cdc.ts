// Quick smoke test for the FastCDC + zstd + content-addressing pipeline.
// Not a unit test framework — just a runnable script that prints whether
// the algorithmic invariants hold on synthetic inputs:
//
//   1. Determinism — same input bytes → same chunk hashes (critical for
//      cross-instance dedup).
//   2. Round-trip — concatenating the chunks reproduces the original.
//   3. Bounds — non-tail chunks fall inside [CHUNK_MIN, CHUNK_MAX].
//   4. Edit resilience — inserting one byte mid-file invalidates exactly one
//      chunk (the property that makes content-defined chunking worth doing).
//   5. zstd correctness — compress(b) → decompress → b.
//   6. End-to-end compressibility on PDF-shaped data.
//
// Run with: npx tsx scripts/smoke-cdc.ts

import crypto from "node:crypto";
import { chunkRanges } from "../lib/persistence/compression/fastcdc";
import { compress, decompress } from "../lib/persistence/compression/zstd";

function sha(b: Buffer): string {
  return crypto.createHash("sha256").update(b).digest("hex");
}

function chunksOf(buf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  for (const r of chunkRanges(buf)) out.push(buf.subarray(r.start, r.end));
  return out;
}

function ok(label: string, cond: boolean, extra: string = ""): void {
  const tag = cond ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  console.log("# FastCDC + zstd smoke test");

  // Synthesize a 5 MiB blob that has *some* internal correlation, similar in
  // texture to a PDF or a binary doc — fully random data is incompressible
  // and won't exercise zstd meaningfully.
  const A = Buffer.alloc(5 * 1024 * 1024);
  crypto.randomFillSync(A);
  for (let i = 100; i < A.length; i++) {
    A[i] = (A[i - 100] + A[i]) & 0xff;
  }

  const c1 = chunksOf(A).map(sha);
  const c2 = chunksOf(Buffer.from(A)).map(sha);
  ok("determinism", JSON.stringify(c1) === JSON.stringify(c2));

  const concat = Buffer.concat(chunksOf(A));
  ok("roundtrip", Buffer.compare(concat, A) === 0);

  const sizes = chunksOf(A).map((c) => c.length);
  const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  const inBounds = sizes
    .slice(0, -1)
    .every((s) => s >= 64 * 1024 && s <= 1024 * 1024);
  ok(
    "chunk size bounds (non-tail)",
    inBounds,
    `count=${sizes.length}, avg=${avg.toFixed(0)}B`
  );

  // Insert one byte at the 1 MiB boundary — content-defined chunking should
  // re-sync within ~one chunk, so only ~1/N chunks differ.
  const B = Buffer.concat([
    A.subarray(0, 1024 * 1024),
    Buffer.from([0x42]),
    A.subarray(1024 * 1024),
  ]);
  const cB = chunksOf(B).map(sha);
  const shared = cB.filter((h) => c1.includes(h)).length;
  ok(
    "edit resilience (1 byte insert)",
    shared >= cB.length - 2,
    `${shared}/${cB.length} chunks shared with original`
  );

  // zstd round-trip on a single chunk.
  const small = chunksOf(A)[0];
  const z = await compress(small);
  const dz = await decompress(z);
  ok("zstd roundtrip", Buffer.compare(small, dz) === 0);

  // End-to-end compressibility on text-shaped data (PDFs are mostly
  // FlateDecoded streams plus repeated XML/UTF-8, so this is a reasonable
  // stand-in for real workloads).
  const fakeText = Buffer.from(
    "The quick brown fox jumps over the lazy dog.\n".repeat(20000) +
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(10000)
  );
  let totalCompressed = 0;
  for (const c of chunksOf(fakeText)) totalCompressed += (await compress(c)).length;
  const ratio = totalCompressed / fakeText.length;
  ok(
    "zstd compresses repetitive text",
    ratio < 0.05,
    `${fakeText.length}B → ${totalCompressed}B (ratio=${ratio.toFixed(4)})`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
