// Scan the compiled Next.js server bundle for npm atomic-install
// temp-dir references like `@mongodb-js/zstd-5b2bb1aa46db9d26`. Such
// strings indicate Turbopack resolved a require to a transient
// directory that npm later renamed away — at runtime the require
// fails with "Cannot find module ..." and the embedded server 500s on
// every request (v0.2.3 macOS regression).
//
// Runs after `next build` produced .next/standalone/. If anything
// matches, we fail the build rather than ship a broken installer.
// scripts/prune-npm-temp-dirs.mjs is the prevention; this is the
// detection layer.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
// Override for tests; production builds use the repo's standalone tree.
const standaloneDir =
  process.env.PERSONALGIT_STANDALONE_DIR ??
  path.join(repoRoot, ".next", "standalone");

// Match `<pkg>-<exactly-16-hex>` inside string literals in the
// compiled chunks. The character class allows `@` as the very first
// character to cover npm scope prefixes like `@mongodb-js/...`.
// Anchoring on quote characters keeps us off long source-map hashes
// that aren't real require specifiers.
const TEMP_REF_RE =
  /["'](?:@[a-z0-9._-]+\/)?(?:[a-z0-9._-]+\/)*[a-z0-9._-]+-[0-9a-f]{16}["'/]/gi;

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && /\.(?:js|cjs|mjs|json)$/i.test(entry.name)) {
      yield full;
    }
  }
}

const hits = [];
for await (const file of walk(path.join(standaloneDir, ".next", "server"))) {
  let src;
  try {
    src = await fs.readFile(file, "utf8");
  } catch {
    continue;
  }
  // Cheap rejection first — exact regex is expensive on multi-MB chunks.
  if (!/-[0-9a-f]{16}/.test(src)) continue;
  const matches = new Set();
  for (const m of src.matchAll(TEMP_REF_RE)) {
    // Strip the surrounding quote characters for readability.
    matches.add(m[0].replace(/^["']|["'/]$/g, ""));
  }
  if (matches.size > 0) {
    hits.push({ file: path.relative(repoRoot, file), matches: [...matches] });
  }
}

if (hits.length > 0) {
  console.error(
    `\nerror: ${hits.length} compiled file(s) reference npm atomic-install temp dirs:\n`
  );
  for (const { file, matches } of hits) {
    console.error(`  ${file}`);
    for (const m of matches) console.error(`      → ${m}`);
  }
  console.error(
    "\nThis means Turbopack saw a transient `<pkg>-<16hex>/` directory in node_modules\n" +
      "during `next build` and baked its name into the compiled bundle. The packaged\n" +
      "app would crash with `Cannot find module ...` on first request.\n\n" +
      "scripts/prune-npm-temp-dirs.mjs should have prevented this — check whether it\n" +
      "ran before `next build` and whether `node_modules` was rewritten between them.\n"
  );
  process.exit(1);
}

console.log(
  "ok: no npm atomic-install temp-dir references found in compiled .next/server/"
);
