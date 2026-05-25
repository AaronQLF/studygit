#!/usr/bin/env node
/**
 * Wraps `electron-builder` with a temporary slim package.json so the
 * production-dependency walker only sees `electron-updater` (the one
 * runtime dep the desktop shell needs). All other deps in the real
 * package.json are for the hosted web app on Vercel and would bloat the
 * asar from ~10 MB to 400+ MB if included.
 *
 * We can't fix this with `files` excludes alone — electron-builder
 * walks node_modules transitively from package.json's `dependencies`
 * field independently of `files`.
 *
 * Flow:
 *   1. Back up package.json → package.json.prepack-backup
 *   2. Rewrite package.json with a slim dependencies map (electron-updater
 *      only; transitive deps fall out of node_modules automatically)
 *   3. Spawn `electron-builder` with whatever args we were passed
 *   4. Restore the original package.json no matter how step 3 exits
 *      (success, build failure, SIGINT, uncaught exception)
 *
 * Args are forwarded verbatim, so `node scripts/electron-prepack.mjs
 * --mac --arm64` is equivalent to `electron-builder --mac --arm64`.
 */

import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const realPackageJson = path.join(repoRoot, "package.json");
const backupPackageJson = path.join(repoRoot, "package.json.prepack-backup");

// The slim deps map. Electron-updater's own transitive deps (fs-extra,
// js-yaml, semver, builder-util-runtime, …) are still resolved out of
// node_modules — only the top-level `dependencies` field is overridden.
const SLIM_DEPS = {
  "electron-updater": "^6.8.3",
};

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, "utf8"));
}

async function writeJson(p, value) {
  await fs.writeFile(p, JSON.stringify(value, null, 2) + "\n");
}

let backupCreated = false;

async function restore() {
  if (!backupCreated) return;
  try {
    await fs.rename(backupPackageJson, realPackageJson);
    console.log("[electron-prepack] restored original package.json");
  } catch (err) {
    console.error(
      "[electron-prepack] FAILED to restore package.json — original is at",
      backupPackageJson,
      ":",
      err
    );
    // Re-throw so non-zero exit code propagates.
    throw err;
  } finally {
    backupCreated = false;
  }
}

async function main() {
  // Safety: if a previous run died mid-swap, bail rather than overwrite
  // its backup with the (already-slim) package.json on disk.
  try {
    await fs.access(backupPackageJson);
    console.error(
      `[electron-prepack] ${backupPackageJson} already exists. ` +
        "A previous build was interrupted before restoring. " +
        "Inspect the file and `mv` it back to package.json before re-running."
    );
    process.exit(1);
  } catch {
    // expected — no backup means we're starting clean
  }

  const original = await readJson(realPackageJson);
  const slim = {
    ...original,
    dependencies: SLIM_DEPS,
    // Drop devDependencies too — electron-builder ignores them by default,
    // but stripping them shrinks the package.json that ends up in the asar.
    devDependencies: undefined,
    // electron-builder reads `description`, `author`, `homepage`, etc.
    // from package.json into the installer metadata. Keep them.
  };

  // Move the original aside, then write the slim version in its place.
  // Using `rename` is atomic on the same filesystem so a power loss in
  // between can never leave the repo with two package.jsons.
  await fs.rename(realPackageJson, backupPackageJson);
  backupCreated = true;
  await writeJson(realPackageJson, slim);
  console.log(
    "[electron-prepack] swapped to slim package.json " +
      "(electron-updater only)"
  );

  // Forward any failure during electron-builder to our exit code, but
  // always restore first.
  const args = process.argv.slice(2);
  const child = spawn("npx", ["electron-builder", ...args], {
    stdio: "inherit",
    cwd: repoRoot,
  });

  const exitCode = await new Promise((resolve) => {
    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`[electron-prepack] electron-builder killed by ${signal}`);
        resolve(1);
        return;
      }
      resolve(code ?? 0);
    });
    child.on("error", (err) => {
      console.error("[electron-prepack] failed to spawn electron-builder:", err);
      resolve(1);
    });
  });

  await restore();
  process.exit(exitCode);
}

// Restore on interrupt/termination signals so the repo never gets stuck
// with the slim package.json in place.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    console.error(`[electron-prepack] received ${sig}, restoring`);
    restore()
      .then(() => process.exit(1))
      .catch(() => process.exit(1));
  });
}

process.on("uncaughtException", (err) => {
  console.error("[electron-prepack] uncaught exception:", err);
  restore()
    .then(() => process.exit(1))
    .catch(() => process.exit(1));
});

main().catch((err) => {
  console.error("[electron-prepack] failed:", err);
  restore()
    .then(() => process.exit(1))
    .catch(() => process.exit(1));
});
