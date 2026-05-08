// Sweep `node_modules` for npm atomic-install temp entries before
// `next build` runs. npm 10+ extracts each tarball into
// `<pkg>-<16hex>/` then atomically renames it to `<pkg>/`. On macOS
// (Spotlight) and Windows (Defender) the rename can succeed while the
// old directory entry briefly persists — long enough for Turbopack to
// scan it during `next build` and bake the temp-dir name into the
// compiled chunks (`@mongodb-js/zstd-5b2bb1aa46db9d26` etc.). When the
// installed app runs, that hashed name doesn't resolve and the
// embedded Next server crashes with "Cannot find module ..." on the
// first request — exactly the v0.2.3 macOS regression.
//
// This script must run AFTER `npm ci`/`npm install` and BEFORE
// `next build`. The `electron:build` npm script wires it in.
//
// We also clean any orphan entries inside `.next/standalone/` for
// belt-and-suspenders, but the primary value is preventing Turbopack
// from ever seeing a temp dir in the first place.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const ATOMIC_TEMP_RE = /-[0-9a-f]{16}$/;

async function pruneAtomicTempEntries(root) {
  const removed = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (ATOMIC_TEMP_RE.test(entry.name)) {
        await fs.rm(full, { recursive: true, force: true });
        removed.push(path.relative(repoRoot, full));
        continue;
      }
      if (entry.isDirectory()) {
        await walk(full);
      }
    }
  }
  await walk(root);
  return removed;
}

const targets = [
  path.join(repoRoot, "node_modules"),
  // .next/standalone may not exist yet on a clean build; pruneAtomicTempEntries
  // is a no-op for non-existent paths.
  path.join(repoRoot, ".next", "standalone"),
];

let total = 0;
for (const target of targets) {
  const removed = await pruneAtomicTempEntries(target);
  if (removed.length > 0) {
    console.log(
      `[prune-npm-temp-dirs] removed ${removed.length} entr${
        removed.length === 1 ? "y" : "ies"
      } from ${path.relative(repoRoot, target)}:`
    );
    for (const rel of removed) console.log(`  ${rel}`);
    total += removed.length;
  }
}

if (total === 0) {
  console.log(
    "[prune-npm-temp-dirs] no atomic-install temp entries found (clean tree)"
  );
}
