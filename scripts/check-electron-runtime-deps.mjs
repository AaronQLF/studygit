// Static check: every package required at runtime by the Electron main /
// preload bundles must live in package.json `dependencies`, not
// `devDependencies`. electron-builder ships only `dependencies` in the
// packaged .app — anything missed lands as a "Cannot find module ..."
// crash on first launch (the v0.2.0 incident with electron-updater).
//
// Run after `npm run electron:build` so electron/dist/*.js exist.

import { promises as fs } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const require = createRequire(import.meta.url);
const pkg = require(path.join(repoRoot, "package.json"));
const prodDeps = new Set(Object.keys(pkg.dependencies ?? {}));
const devDeps = new Set(Object.keys(pkg.devDependencies ?? {}));
const builtins = new Set(builtinModules);

const TARGETS = ["electron/dist/main.js", "electron/dist/preload.js"];

// Compiled output uses both top-level and inlined `require("…")` calls.
// We deliberately scan the whole file (not just the header) so a lazy
// `require("foo")` deeper in the file is still validated.
const REQUIRE_RE = /\brequire\(\s*["']([^"']+)["']\s*\)/g;

function rootOf(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return name ? `${scope}/${name}` : scope;
  }
  return specifier.split("/")[0];
}

const errors = [];
let scanned = 0;

for (const rel of TARGETS) {
  const abs = path.join(repoRoot, rel);
  let src;
  try {
    src = await fs.readFile(abs, "utf8");
  } catch (err) {
    errors.push(
      `${rel}: not found — did you run \`npm run electron:build\` first? (${err.code ?? err.message})`
    );
    continue;
  }

  const seen = new Set();
  for (const match of src.matchAll(REQUIRE_RE)) {
    const spec = match[1];
    if (spec.startsWith(".") || spec.startsWith("/")) continue;
    if (spec.startsWith("node:")) continue;
    const root = rootOf(spec);
    if (builtins.has(root)) continue;
    if (root === "electron") continue; // provided by the Electron runtime
    if (seen.has(root)) continue;
    seen.add(root);
    scanned++;

    if (prodDeps.has(root)) continue;

    if (devDeps.has(root)) {
      errors.push(
        `${rel}: requires "${spec}" but "${root}" is in devDependencies — ` +
          `electron-builder will prune it from the packaged app. ` +
          `Move it to "dependencies" in package.json.`
      );
    } else {
      errors.push(
        `${rel}: requires "${spec}" but "${root}" is not in package.json at all — ` +
          `add it to "dependencies".`
      );
    }
  }
}

if (errors.length > 0) {
  for (const line of errors) console.error(`error: ${line}`);
  console.error(
    `\nRefusing to release: ${errors.length} runtime dependency issue(s) detected.`
  );
  process.exit(1);
}

console.log(
  `ok: all ${scanned} runtime require()s in electron/dist/{main,preload}.js are declared as production dependencies.`
);
