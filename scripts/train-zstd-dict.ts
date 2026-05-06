// Train a zstd dictionary from the chunks already in R2 (or from a local
// directory of sample files). The trained dictionary is uploaded to
// `dicts/<id>` and is *not* yet wired into the live compress path —
// `@mongodb-js/zstd` doesn't expose dictionary APIs, and we don't want to
// gate this whole feature on swapping codecs. The script is here so the
// architecture story is end-to-end and so anyone who *does* swap to a
// dict-aware binding (e.g. zstd-napi) can flip the toggle in 10 lines.
//
// Why dictionaries help:
//   On small chunks (≤ a few KiB), zstd's frame header and adaptive entropy
//   model dominate the compressed size — there isn't enough data in a single
//   chunk for the algorithm to learn the redundancy patterns. A trained
//   dictionary primes the entropy model with patterns extracted from a
//   representative *corpus*, so each individual chunk reaps the
//   corpus-level redundancy. The Yann-Collet zstd paper reports 2-5×
//   better ratios on small payloads with a trained dict.
//
// Algorithm:
//   We download N random chunks from R2 (ranging the chunks/ prefix) up to a
//   total budget of ~10 MiB, decompress them to plaintext, write each to a
//   tempdir, and then shell out to the `zstd --train` CLI if it's available.
//   That keeps the training path tiny (no native binding, no Rust toolchain),
//   while giving us the same dict format zstd-napi/libzstd expect.
//
// Usage:
//   npx tsx scripts/train-zstd-dict.ts            # train from R2
//   npx tsx scripts/train-zstd-dict.ts ./samples  # train from a local dir

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { decompress } from "../lib/persistence/compression/zstd";
import { getR2, r2BlobStore } from "../lib/persistence/r2-client";

loadEnvConfig(process.cwd());

const TRAIN_BUDGET_BYTES = 64 * 1024 * 1024; // 64 MiB of plaintext samples.
const DICT_SIZE_BYTES = 64 * 1024; // 64 KiB output dictionary.

async function ensureZstdCli(): Promise<void> {
  const probe = spawnSync("zstd", ["--version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    throw new Error(
      "Couldn't find the `zstd` CLI on PATH. Install it (brew install zstd / " +
        "apt-get install zstd) and rerun. The CLI is only used for training; " +
        "the runtime uses @mongodb-js/zstd."
    );
  }
}

async function gatherSamplesFromR2(targetDir: string): Promise<number> {
  const { client, bucket } = getR2();
  let continuationToken: string | undefined;
  let written = 0;
  let totalBytes = 0;
  while (totalBytes < TRAIN_BUDGET_BYTES) {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "chunks/",
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    const keys = (res.Contents ?? []).map((o) => o.Key!).filter(Boolean);
    for (const key of keys) {
      if (totalBytes >= TRAIN_BUDGET_BYTES) break;
      const compressed = await r2BlobStore.getBuffer(key);
      const plain = await decompress(compressed);
      const samplePath = path.join(targetDir, `s${written.toString(36)}.bin`);
      await fs.writeFile(samplePath, plain);
      written += 1;
      totalBytes += plain.length;
    }
    if (!res.IsTruncated) break;
    continuationToken = res.NextContinuationToken;
  }
  return totalBytes;
}

async function gatherSamplesFromDir(
  src: string,
  targetDir: string
): Promise<number> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  let written = 0;
  let totalBytes = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (totalBytes >= TRAIN_BUDGET_BYTES) break;
    const buf = await fs.readFile(path.join(src, entry.name));
    const samplePath = path.join(targetDir, `s${written.toString(36)}.bin`);
    await fs.writeFile(samplePath, buf);
    written += 1;
    totalBytes += buf.length;
  }
  return totalBytes;
}

async function trainDictionary(
  sampleDir: string,
  dictPath: string
): Promise<void> {
  // `zstd --train -B<bytes> --maxdict=<bytes> -o <out> <files>`
  // -B = expected sample size; using our chunk avg gives the trainer a hint.
  const files = (await fs.readdir(sampleDir)).map((f) =>
    path.join(sampleDir, f)
  );
  if (files.length === 0) {
    throw new Error("No sample files were collected — nothing to train on.");
  }
  const args = [
    "--train",
    `--maxdict=${DICT_SIZE_BYTES}`,
    "-B262144",
    "-o",
    dictPath,
    ...files,
  ];
  const result = spawnSync("zstd", args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`zstd --train failed with status ${result.status}`);
  }
}

async function uploadDictionary(dictPath: string): Promise<string> {
  const buf = await fs.readFile(dictPath);
  const id = `v${Date.now().toString(36)}`;
  await r2BlobStore.put(`dicts/${id}`, buf, "application/octet-stream", {
    "trained-at": new Date().toISOString(),
    "dict-size": String(buf.length),
  });
  // Also write a "current" pointer for the runtime to discover.
  await r2BlobStore.put(
    "dicts/current",
    Buffer.from(JSON.stringify({ id, size: buf.length })),
    "application/json"
  );
  return id;
}

async function run(): Promise<void> {
  await ensureZstdCli();

  const localSrc = process.argv[2];
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "zstd-train-"));
  console.log(`Collecting samples into ${tmpDir} …`);

  const totalBytes = localSrc
    ? await gatherSamplesFromDir(path.resolve(localSrc), tmpDir)
    : await gatherSamplesFromR2(tmpDir);
  console.log(`Collected ${totalBytes.toLocaleString()} bytes of samples.`);

  const dictPath = path.join(tmpDir, "dict.bin");
  console.log("Training dictionary …");
  await trainDictionary(tmpDir, dictPath);

  const dictBytes = (await fs.stat(dictPath)).size;
  console.log(`Trained dictionary: ${dictBytes.toLocaleString()} bytes.`);

  if (localSrc) {
    console.log(`Dict written to ${dictPath} (skipped upload — local mode).`);
    return;
  }

  const id = await uploadDictionary(dictPath);
  console.log(`Uploaded dict to dicts/${id} (and dicts/current pointer).`);
  console.log(
    "Note: runtime compression doesn't use this dict yet — see the comment " +
      "at the top of this script for the wiring step."
  );
}

run().catch((err) => {
  console.error("Training failed:", err);
  process.exitCode = 1;
});
