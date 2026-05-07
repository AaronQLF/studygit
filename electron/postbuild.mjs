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

console.log("[postbuild] done");
