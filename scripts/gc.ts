// Garbage-collect the R2 chunk store. Defaults to a chunks-only dry run;
// pass --apply to actually delete and --with-manifests to also reap orphan
// manifests against the live key set in Postgres.
//
// Run with: npm run gc -- [options]
//
// Examples:
//   npm run gc                       # dry run, chunks only
//   npm run gc -- --apply            # delete orphan chunks
//   npm run gc -- --with-manifests   # dry run, manifests + chunks
//   npm run gc -- --apply --with-manifests --grace=12h

import { loadEnvConfig } from "@next/env";
import {
  gcOrphanChunks,
  gcOrphanManifests,
  type GcChunkReport,
  type GcManifestReport,
} from "../lib/persistence/compression/chunk-store";

loadEnvConfig(process.cwd());

type Args = {
  apply: boolean;
  withManifests: boolean;
  graceMs: number;
};

function parseDuration(s: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/i.exec(s.trim());
  if (!match) {
    throw new Error(`Invalid duration "${s}". Use e.g. 30m, 24h, 7d.`);
  }
  const n = Number(match[1]);
  const unit = (match[2] ?? "ms").toLowerCase();
  const factor =
    unit === "ms"
      ? 1
      : unit === "s"
      ? 1_000
      : unit === "m"
      ? 60_000
      : unit === "h"
      ? 3_600_000
      : 86_400_000;
  return n * factor;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    withManifests: false,
    graceMs: 24 * 60 * 60 * 1000,
  };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg === "--with-manifests") args.withManifests = true;
    else if (arg.startsWith("--grace=")) {
      args.graceMs = parseDuration(arg.slice("--grace=".length));
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(2);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`Usage: npm run gc -- [options]

Mark-and-sweep garbage collection over the R2 chunk store. Dry-run by
default; pass --apply to actually delete.

Options:
  --apply              Delete orphans. Without this flag, the script only
                       reports what it WOULD delete.
  --with-manifests     Also reap orphan manifests against the live key set
                       pulled from Postgres (requires SUPABASE_URL +
                       SUPABASE_SERVICE_ROLE_KEY in env).
  --grace=DURATION     Skip orphans newer than this age (default: 24h).
                       Examples: 30m, 12h, 7d.
  -h, --help           Show this help.

The grace period exists because uploads write chunks BEFORE writing the
manifest that references them. A chunk that's an orphan for a few seconds
during an in-flight upload should not be reclaimed; 24h is a generous
upper bound on any plausible single upload.`);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(0)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(2)}d`;
}

// Pull every file key referenced by application state. We scan the `data`
// jsonb on `nodes` for `/api/files/<key>` substrings — this is intentionally
// schema-agnostic so adding new node kinds that hold file URLs doesn't
// require touching the GC.
async function loadLiveKeysFromSupabase(): Promise<Set<string>> {
  // Lazy import so the chunks-only path doesn't require the supabase admin
  // client to be configured (and doesn't pull in `server-only`).
  const { getSupabaseAdminClient } = await import(
    "../lib/server/supabase/admin"
  );
  const supabase = getSupabaseAdminClient();

  const liveKeys = new Set<string>();
  const pattern = /\/api\/files\/([^"\\\s]+)/g;
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("nodes")
      .select("data")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`nodes select: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const text = JSON.stringify(row.data);
      let m: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((m = pattern.exec(text)) !== null) {
        // The URLs are encodeURIComponent'd; decode so the key matches the
        // raw filename portion of the manifest object key.
        try {
          liveKeys.add(decodeURIComponent(m[1]));
        } catch {
          liveKeys.add(m[1]);
        }
      }
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return liveKeys;
}

function printChunkReport(label: string, report: GcChunkReport): void {
  console.log("");
  console.log(`--- ${label} ---`);
  console.log(`  Manifests scanned:     ${report.manifestsScanned}`);
  console.log(`    corrupt:             ${report.manifestsCorrupt}`);
  console.log(`  Reachable chunks:      ${report.reachableChunks}`);
  console.log(`  Chunks scanned:        ${report.chunksScanned}`);
  console.log(`  Orphan candidates:     ${report.orphanCandidates}`);
  console.log(`  Protected by grace:    ${report.protectedByGrace}`);
  console.log(
    `  Deleted: ${report.deletedChunks} chunks, ${formatBytes(
      report.deletedBytes
    )}`
  );
  if (report.errors.length) {
    console.log(`  Errors: ${report.errors.length}`);
    for (const e of report.errors.slice(0, 10)) {
      console.log(`    - ${e.key}: ${e.error}`);
    }
    if (report.errors.length > 10) {
      console.log(`    ... and ${report.errors.length - 10} more`);
    }
  }
}

function printManifestReport(label: string, report: GcManifestReport): void {
  console.log("");
  console.log(`--- ${label} ---`);
  console.log(`  Manifests scanned:     ${report.manifestsScanned}`);
  console.log(`  Orphan candidates:     ${report.orphanCandidates}`);
  console.log(`  Protected by grace:    ${report.protectedByGrace}`);
  console.log(`  Deleted manifests:     ${report.deletedManifests}`);
  if (report.errors.length) {
    console.log(`  Errors: ${report.errors.length}`);
    for (const e of report.errors.slice(0, 10)) {
      console.log(`    - ${e.key}: ${e.error}`);
    }
  }
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log(`Mode:          ${args.apply ? "APPLY (will delete)" : "DRY RUN"}`);
  console.log(`Manifest GC:   ${args.withManifests ? "yes" : "no"}`);
  console.log(`Grace period:  ${formatDuration(args.graceMs)}`);

  const onProgress = (msg: string): void => console.log(msg);
  const baseOpts = {
    dryRun: !args.apply,
    graceMs: args.graceMs,
    onProgress,
  };

  if (args.withManifests) {
    console.log("");
    console.log("Loading live file keys from Supabase...");
    const liveKeys = await loadLiveKeysFromSupabase();
    console.log(`  ${liveKeys.size} live file key(s) referenced by nodes.`);
    const manifestReport = await gcOrphanManifests({
      ...baseOpts,
      liveKeys,
    });
    printManifestReport("Manifest GC", manifestReport);
  }

  console.log("");
  const chunkReport = await gcOrphanChunks(baseOpts);
  printChunkReport("Chunk GC", chunkReport);

  if (!args.apply) {
    console.log("");
    console.log("(dry run — no objects were actually deleted)");
    console.log("Re-run with --apply to delete.");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
