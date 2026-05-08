// After `next build` we have to assemble a self-contained tree under
// .next/standalone/ that the Electron main process can fork directly.
//
// `output: "standalone"` already produces .next/standalone/server.js plus
// a minimal node_modules subtree, but it does NOT copy:
//   - .next/static → must live at .next/standalone/.next/static
//   - public/      → must live at .next/standalone/public
// (per https://nextjs.org/docs/app/api-reference/next-config-js/output)
//
// We also force-include `@mongodb-js/zstd` (a native addon listed in
// serverExternalPackages) in case @vercel/nft missed it.

import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const standaloneDir = path.join(repoRoot, ".next", "standalone");
if (!existsSync(standaloneDir)) {
  console.error(
    `[postbuild] .next/standalone not found at ${standaloneDir}. ` +
      `Did you run \`next build\` with output: "standalone"?`
  );
  process.exit(1);
}

async function copyDir(src, dst) {
  if (!existsSync(src)) {
    console.warn(`[postbuild] skip: ${src} does not exist`);
    return;
  }
  await fs.mkdir(dst, { recursive: true });
  await fs.cp(src, dst, { recursive: true, force: true });
  console.log(`[postbuild] copied ${path.relative(repoRoot, src)} -> ${path.relative(repoRoot, dst)}`);
}

await copyDir(
  path.join(repoRoot, ".next", "static"),
  path.join(standaloneDir, ".next", "static")
);
await copyDir(
  path.join(repoRoot, "public"),
  path.join(standaloneDir, "public")
);

// Belt-and-suspenders: ensure the native zstd addon is present in the
// standalone tree. @vercel/nft sometimes skips files reached only via
// require() with computed paths; missing this one would break uploads.
const zstdSrc = path.join(repoRoot, "node_modules", "@mongodb-js", "zstd");
const zstdDst = path.join(
  standaloneDir,
  "node_modules",
  "@mongodb-js",
  "zstd"
);
if (existsSync(zstdSrc) && !existsSync(zstdDst)) {
  await copyDir(zstdSrc, zstdDst);
}

// Defensive cleanup: strip any `<pkg>-<16hex>` entries from the
// standalone tree before electron-builder packages it. We've seen this
// pattern from two unrelated sources — npm's atomic install temp dirs
// (rare; cleaned up by the OS shortly after extraction) and Turbopack's
// `serverExternalPackages` symlinks (the actual cause of the v0.2.3
// regression — fixed upstream by switching `electron:build` to
// `next build --webpack`). Either way, an entry matching this pattern
// inside the standalone bundle has caused real shipping bugs and never
// represents a real package, so we just remove them.
const ATOMIC_TEMP_RE = /-[0-9a-f]{16}$/;
async function pruneAtomicTempEntries(root) {
  let removed = 0;
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
        removed++;
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

const prunedCount = await pruneAtomicTempEntries(standaloneDir);
if (prunedCount > 0) {
  console.log(
    `[postbuild] pruned ${prunedCount} npm atomic-install temp ` +
      `entr${prunedCount === 1 ? "y" : "ies"} from .next/standalone/`
  );
}

console.log("[postbuild] done");
