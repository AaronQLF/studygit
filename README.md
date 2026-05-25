# Studygit

Your personal learning canvas — a "student second brain". Create independent workspaces, drop in links, images, sticky notes, rich block-edited Pages, shapes, and PDFs you can highlight, annotate, and ask AI about — all on an infinite React Flow canvas.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4
- React Flow (`@xyflow/react`) for the canvas
- Zustand for client state
- Tiptap (Notion-like block editor) with KaTeX math, Mermaid diagrams, code highlighting, slash menu
- Persistence driver selected by `PERSISTENCE=file|supabase` (defaults to `file`)
- Supabase Postgres stores `workspaces`/`nodes`/`edges`/`app_meta` in `supabase` mode
- Cloudflare R2 stores uploaded PDFs in `supabase` mode, behind a content-addressable, deduplicating, zstd-compressed chunk store — see [Storage: chunked, dedup-friendly compression on R2](#storage-chunked-dedup-friendly-compression-on-r2)

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## How it works

- **Workspaces** — left sidebar. Each workspace is its own canvas. Hover a workspace to rename or delete it; use **+ New workspace** to create another.
- **Canvas** — use the bottom dock or right-click the pane to drop in:
  - **Link** — title + URL + optional description (and embeddable iframe)
  - **Image** — URL + optional caption
  - **Note** — sticky note with 6 color swatches
  - **Page** — Notion-like block editor: press `/` for the slash menu (headings, lists, todos, toggles, callouts, code with syntax highlighting, KaTeX math, Mermaid diagrams, images, dividers, …)
  - **Document** — reader where you can highlight any text and thread comments on each highlight
  - **PDF** — uploadable PDF viewer with highlights, threaded comments, AI Q&A over the highlight, and a side-by-side rich notes panel
- **Floating panels** — opening a node spawns a draggable, resizable, z-ordered window that floats over the canvas. Drag the header to move, drag the bottom-right corner to resize, double-click the header (or hit the `□` button) to maximize. Opening another node simply spawns another panel offset from the topmost one — existing panels are never auto-closed — so you can read a PDF and write a page side-by-side without any extra modifier.
- **Closing panels** — each panel has its own ✕; **Esc** closes the topmost; **⌘ / Ctrl + Shift + Esc** closes all of them at once.
- **Edges** — drag from a node's bottom handle to another node's top handle to connect them
- **Persistence** — every change is debounced and saved through `/api/state`, which dispatches to the active persistence driver.

## Desktop build (Electron)

The Electron app is a **thin shell over the hosted Studygit deployment** — the `BrowserWindow` loads `https://studygit-tau.vercel.app` (or whatever `STUDYGIT_HOSTED_URL` points at) directly. There is **no embedded Next server**, **no embedded chunk store**, and **no R2/Supabase secrets bundled inside the installer**. Auth, persistence, uploads, and AI calls all flow through the hosted backend exactly the same way they do in a normal browser tab.

The shell still owns the native pieces a hosted page can't do on its own:

- Frameless window with platform-appropriate chrome (macOS traffic lights, Windows/Linux titlebar overlay)
- Auto-update via `electron-updater` + GitHub Releases (silent download, dialog-prompted restart)
- A locked-down `<webview>` for the in-app Browser feature (forced preload, sandboxed partition)
- The `window.studygit` preload bridge that exposes the app version + updater status to the renderer
- A graceful offline page when the hosted URL can't be reached (network failure, DNS, certificate error)

Earlier desktop builds shipped in `file` persistence mode with a forked `.next/standalone/server.js` running on a loopback port, writing everything to `app.getPath("userData")`. That bundle has been removed. If you have data from one of those builds at `~/Library/Application Support/Studygit/data/state.json` (or the Windows / Linux equivalent), use the migration script — see [Migration → Desktop (file mode) → cloud (Supabase)](#desktop-file-mode--cloud-supabase) — to lift it into your cloud account before upgrading.

### Pointing at a different hosted URL

`electron/main.ts` resolves the target URL in this order:

1. `ELECTRON_DEV_URL` — set by `npm run electron:dev` to attach to a local `next dev`.
2. `STUDYGIT_HOSTED_URL` — set at build time to override the default (useful for shipping a preview/staging build).
3. The default `https://studygit-tau.vercel.app`.

To ship a build pointing at a preview deployment:

```bash
STUDYGIT_HOSTED_URL=https://studygit-<your-preview>.vercel.app npm run dist
```

### Scripts

| Script                | Purpose                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run electron:dev`   | Launch `next dev` (on `:3000`) and Electron together; the shell loads `http://127.0.0.1:3000`. |
| `npm run electron:build` | Compile the Electron main + preload TypeScript. No installer.                                   |
| `npm run dist`           | Build installers for the host OS (signed only if env vars below are set).                      |
| `npm run dist:mac`       | macOS: `dmg` + `zip` for x64 and arm64.                                                        |
| `npm run dist:win`       | Windows: `nsis` + `zip` for x64.                                                               |
| `npm run dist:linux`     | Linux: `AppImage` + `deb` for x64.                                                             |
| `npm run release`        | Same as `dist`, then publishes to GitHub Releases (requires `GH_TOKEN`).                       |

Installers land in `release/`. Cross-platform builds work locally as long as the host OS can drive the target's signing tooling — practically that means macOS for `.dmg`, Windows or Wine for `.exe`, and any OS for `.AppImage`/`.deb`.

### Code-signing & notarization

Everything is driven by env vars; nothing is committed. Builds without these still succeed but produce unsigned artifacts (Gatekeeper / SmartScreen will warn end users).

| Variable                       | Used for                                                                  |
| ------------------------------ | ------------------------------------------------------------------------- |
| `CSC_LINK`                     | Path to `.p12` cert (macOS Developer ID Application or Windows code-sign) |
| `CSC_KEY_PASSWORD`             | Password for the `.p12`                                                   |
| `APPLE_ID`                     | Apple ID for macOS notarization                                           |
| `APPLE_APP_SPECIFIC_PASSWORD`  | App-specific password for that Apple ID                                   |
| `APPLE_TEAM_ID`                | Apple Developer Team ID                                                   |
| `GH_TOKEN`                     | GitHub PAT with `repo` scope, used by `npm run release`                   |

To enable notarization, also flip `mac.notarize: true` in `electron-builder.yml` once the Apple credentials are in your shell.

### Auto-update

`electron-updater` is wired against the GitHub Releases provider configured in `electron-builder.yml`. The packaged app polls 10 seconds after launch and every 6 hours thereafter; updates are downloaded silently and installed on next quit. The renderer can subscribe to status events through `window.studygit.onUpdateStatus(...)` exposed in `electron/preload.ts`.

In dev (`app.isPackaged === false`) the updater is disabled, so no network calls are made during local iteration.

### Continuous release

Every push to `main` ships a new release. `.github/workflows/release.yml` bumps `package.json`, builds installers on macOS + Windows runners in parallel, and publishes them to GitHub Releases. Existing installs auto-update within ~6h.

Default behaviour is a **patch** bump (`0.2.1 → 0.2.2`). Override per-commit by including one of these markers in the commit message:

| Marker             | Effect                                                                |
| ------------------ | --------------------------------------------------------------------- |
| `[release-minor]`  | Minor bump (`0.2.1 → 0.3.0`).                                         |
| `[release-major]`  | Major bump (`0.2.1 → 1.0.0`).                                         |
| `[skip release]`   | Don't release this push.                                              |

Pushes that only touch markdown, `docs/**`, `LICENSE`, or `.gitignore` are ignored automatically — see `paths-ignore` in the workflow. To trigger a release manually (e.g. to retry a failed publish without making a new commit), use **Actions → release → Run workflow** on GitHub and pick the bump type.

The bump commit lands on `main` as `chore(release): vX.Y.Z [skip release]`, signed by `github-actions[bot]`. The tag and GitHub Release are created at publish time by `electron-builder`, so a build failure leaves no orphan tag — the next push just bumps from the last successful release.

## Migration

Older `blog` nodes (markdown) auto-migrate to `page` nodes (Tiptap HTML) the first time the app hydrates against an old `data/state.json`. The conversion runs through `marked` once, then the new shape is persisted on the next save.

### Desktop (file mode) → cloud (Supabase)

If you've been using the packaged Electron desktop app — which runs in `file` mode and stores everything under your OS user-data directory — and want to lift those workspaces, pages, PDFs, and image uploads into a Supabase account, use `npm run migrate:state`. The script handles three layouts:

| Source                | `--state-path` default                                   | `--uploads-dir` default                        |
| --------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| Repo dev (default)    | `./data/state.json`                                      | `./public/uploads/`                            |
| `--electron`          | `<userData>/Studygit/data/state.json`                    | `<userData>/Studygit/uploads/`                 |
| `--electron-dev`      | `<userData>/StudygitDev/data/state.json`                 | `<userData>/StudygitDev/uploads/`              |
| `--state-path` + `--uploads-dir` | (whatever you pass — both are required together) |                                                |

`<userData>` resolves per-OS the same way Electron does:

| OS      | Packaged                                          | Dev (`--electron-dev`)                                  |
| ------- | ------------------------------------------------- | ------------------------------------------------------- |
| macOS   | `~/Library/Application Support/Studygit`          | `~/Library/Application Support/StudygitDev`             |
| Windows | `%APPDATA%\Studygit`                              | `%APPDATA%\StudygitDev`                                 |
| Linux   | `~/.config/Studygit`                              | `~/.config/StudygitDev`                                 |

#### Runbook

1. **Quit the desktop app.** The next-server child writes `state.json` every few seconds while it's running; running the migration against a live install is racy.
2. **Sign up in the cloud version.** Run the web app in Supabase mode (or visit the deployed instance) and create your account. The migration writes against an existing `auth.users` row — it does not create users.
3. **Grab your user id.** In the Supabase dashboard, **Authentication → Users** → copy the UUID for the account you just created.
4. **Configure `.env.local` for cloud writes.** From the repo, you need:
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server-only, lets the script bypass RLS to write under any user)
   - `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (so PDF/image bytes can land in the chunk store)

   `PERSISTENCE` is forced to `supabase` by the script regardless of what's in your env.
5. **Dry-check the source path.** Confirm the file exists where the script will look:
   ```bash
   ls -lh ~/Library/Application\ Support/Studygit/data/state.json   # macOS, packaged
   ```
6. **Run the migration:**
   ```bash
   # macOS / Linux / Windows — packaged Electron build:
   npm run migrate:state -- --user-id <uuid> --electron

   # Or the dev variant (StudygitDev, the one `npm run electron:dev` writes to):
   npm run migrate:state -- --user-id <uuid> --electron-dev

   # Or fully custom (must pass both):
   npm run migrate:state -- --user-id <uuid> \
     --state-path /abs/path/state.json \
     --uploads-dir /abs/path/uploads
   ```

   The script prints one line per migrated PDF / image plus a summary at the end:

   ```
   PDFs:   migrated 14, skipped 2, missing 0
   Images: migrated 7, skipped 0, missing 1
   Bytes uploaded (pre-chunking): 312.4 MB
   State saved for user 8c…
   ```

   - **skipped** counts PDFs/images that already point at a cloud URL (`/api/files/<key>` or `https://…`) — re-runs are idempotent.
   - **missing** counts entries whose local file no longer exists on disk. Those nodes are still copied to Supabase with their existing URL; the file is just not uploaded.

7. **Sign into the cloud app.** Your workspaces, pages, PDFs, and images should all be present, and PDF viewers should load the migrated files from the chunk store on first open.

#### Notes / caveats

- The script never touches your local desktop data — copying is one-way. Keep the Electron user-data dir until you've verified the cloud copy.
- `selectedWorkspaceId` and `version` in `app_meta` are upserted on `user_id`, so re-running overwrites those two fields. Workspaces, nodes, and edges are upserted on their own ids, so re-running is safe for them.
- Image uploads larger than a few MB and PDFs go through the full FastCDC + zstd-19 pipeline on the way up, which can take a few seconds each for big files — the script logs per-file progress so you can tell it's working.

## Asking Cursor to write pages

When running in local-file mode (default), state lives in `data/state.json`, so you can ask Cursor in this repo:

> "Write me a page about transformers inside the 'Welcome' workspace"

Cursor can open `data/state.json`, add a new page node with the HTML content, and the next time you focus the browser window it will hydrate the new node.

To avoid stomping on in-progress client edits, prefer closing the browser tab (or letting the UI idle) while Cursor is editing the JSON.

When running in Supabase mode, app state is not backed by `data/state.json`; use SQL or app APIs instead.

## Auth + Supabase + S3 setup (optional)

The app runs in `file` mode by default — no auth, all state in `data/state.json`. Switch to `supabase` mode to enable sign-up, sign-in (email + Google), and per-user data isolation backed by Supabase Auth and Postgres RLS.

### 1. Environment

Copy `.env.example` to `.env.local` and fill values:

```bash
PERSISTENCE=supabase                # or file (default)

# Public — used by the cookie-based Supabase client in proxy.ts and actions
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# Server-only — used by the admin client (migration script, admin tasks)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Optional: explicit origin for OAuth redirects
# NEXT_PUBLIC_SITE_URL=http://localhost:3000

R2_ACCOUNT_ID=<r2-account-id>
R2_BUCKET=<bucket-name>
R2_ACCESS_KEY_ID=<r2-access-key>
R2_SECRET_ACCESS_KEY=<r2-secret-key>
# Optional knobs — see "Storage: chunked, dedup-friendly compression on R2"
# ZSTD_LEVEL=19
# CHUNK_MIN=65536
# CHUNK_AVG=262144
# CHUNK_MAX=1048576
```

### 2. Configure Supabase Auth

In the Supabase dashboard:

1. **Authentication → URL Configuration** — set **Site URL** to your origin (e.g. `http://localhost:3000`) and add the same origin plus `/auth/callback` to **Redirect URLs**.
2. **Authentication → Providers → Email** — enable. Decide whether to require email confirmations.
3. **Authentication → Providers → Google** — enable, paste your Google OAuth client ID + secret. In Google Cloud Console, add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI.

### 3. Run the SQL migrations in Supabase (SQL editor)

Run them in order. The first creates the schema; the second locks it down with per-user RLS and rewrites `save_state` to operate on the calling user.

```sql
-- file: supabase/migrations/0001_init.sql
create extension if not exists "pgcrypto";

create table if not exists workspaces (
  id text primary key,
  user_id uuid,
  name text not null,
  created_at bigint not null
);

create table if not exists nodes (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id uuid,
  position jsonb not null,
  width int,
  height int,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists edges (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id uuid,
  source text not null,
  target text not null
);

create table if not exists app_meta (
  user_id uuid primary key default '00000000-0000-0000-0000-000000000000'::uuid,
  selected_workspace_id text,
  version int not null default 1
);
```

Then run `supabase/migrations/0002_auth_rls.sql`. It:

- Tightens `user_id` to `not null default auth.uid()` on `workspaces`, `nodes`, `edges`.
- Drops the singleton `app_meta` default so each user gets their own row.
- Enables RLS and adds `using (user_id = auth.uid())` policies on all four tables.
- Rewrites `save_state(payload jsonb)` to use `auth.uid()` and only mutate the caller's rows.

If you already have data in `0001` and want to keep it, edit the top of `0002_auth_rls.sql` to backfill `user_id` to a chosen owner before the schema tightens. Otherwise the migration deletes pre-auth rows.

### 4. R2 + run

Create an R2 bucket and an API token under **Cloudflare → R2 → Manage API Tokens** with read/write access to that bucket. Drop the four `R2_`* values into `.env.local` and `npm run dev`. Visit `/` for the landing page, `/signup` to create an account, or `/app` to jump straight to the canvas (the proxy redirects to `/login` if you're not signed in).

### Optional: one-shot migration from local state/uploads

```bash
npm run migrate:state -- --user-id <uuid>
```

This uploads `public/uploads/*` assets referenced by PDF nodes through the same chunked R2 pipeline used at runtime (so duplicate PDFs across users still dedupe), rewrites each PDF `src` to `/api/files/<key>`, and writes the resulting workspaces/nodes/edges into Supabase under the supplied `user_id` via the service-role client (RLS is enforced for app users; service-role bypasses it but must populate `user_id` because the column is `not null`).

Find the user's UUID under **Authentication → Users** in the Supabase dashboard.

### Notes

- `PERSISTENCE=file` keeps the original auth-less behavior (`data/state.json` + `public/uploads`). Auth pages and the proxy session refresh only kick in when `PERSISTENCE=supabase`.
- `PERSISTENCE=supabase` uses Supabase Auth + Postgres for state and R2 for PDF assets, with per-user RLS.
- `/api/files/[key]` streams reconstructed bytes (with `Range` + `ETag`/`If-None-Match` support) from the chunked R2 store; it 401s for unauthenticated callers in supabase mode.
- `NEXT_PUBLIC_`* env vars are inlined into the client bundle; the anon key is safe to expose. The service-role key must remain server-only.

## Storage: chunked, dedup-friendly compression on R2

Studygit is and will stay free to use. Storage was the single biggest obstacle to that promise — students upload tens to hundreds of megabytes of PDFs, and naively writing each upload as a fresh object on a paid-per-GiB store would burn through any free tier in days. The pipeline below is what makes the free-forever line credible: it never stores the same bytes twice and then compresses what's left aggressively, so ten students working from the same paper, or one student re-exporting the same deck twenty times, costs roughly the bytes of one copy.

In `supabase` mode every uploaded PDF (and any future binary) takes a longer route than "PUT the bytes to S3 and hand back a presigned URL". The full pipeline lives under `lib/persistence/compression/` and `lib/persistence/r2-client.ts`:

```
upload buffer
  → PDF-aware lossless re-emit (best-of) (lib/persistence/compression/pdf-precompress.ts)
  → FastCDC content-defined chunker      (lib/persistence/compression/fastcdc.ts)
  → sha256(plaintext) per chunk          (content addressing)
  → cache lookup → R2 HEAD lookup        (cross-file / cross-user dedup)
  → zstd compress on miss                (lib/persistence/compression/zstd.ts)
  → R2 PUT chunks/<aa>/<rest-of-hash>
  → R2 PUT manifests/<key>.json          (lib/persistence/compression/manifest.ts)
```

The five ideas, briefly:

1. **PDF-aware structural re-emit (pre-chunk).** PDFs are already compressed internally (FlateDecode/JPEG/JBIG2 streams), so a generic codec like zstd has almost nothing to remove. Before chunking, we re-emit the PDF through one of two pluggable strategies (selected with `PDF_PRECOMPRESS`):
  - `pdflib` *(default)* — `pdf-lib` re-save with `useObjectStreams: true`, packing the object table into compressed object streams and writing a cross-reference *stream* instead of an ASCII xref table. Pure JS, no native deps, near-zero cold-start cost. Typical gain: 5–30% on unoptimized exports, near-zero on already-optimized PDFs.
  - `mupdf` *(opt-in)* — the official MuPDF WASM build with `garbage=deduplicate,objstms=yes,compress=yes,compress-fonts=yes,compress-images=yes,compress-effort=100,regenerate-id=no`. Drops unreachable objects, removes byte-identical duplicate objects, and re-flate-compresses every stream (incl. fonts and images, lossless — does not re-encode JPEGs). Loaded lazily via dynamic `import()` so it pays a one-time ~10 MB WASM cost only when enabled. Typical gain: 10–40% even on already-optimized PDFs. Note: `mupdf` is **AGPL-3.0**; use the `pdflib` strategy if that license is a non-starter for your deployment.
   Both strategies are byte-altering but content-equivalent. We keep whichever of `(original, re-emitted)` is smaller, so the layer is strictly never a regression. Re-saved bytes are deterministic for identical inputs (pdf-lib: `updateMetadata: false`; mupdf: `regenerate-id=no`), which preserves cross-user dedup at the chunk layer. Encrypted PDFs, parse errors, and "no size win" cases fall through to the original bytes transparently.
2. **Content-defined chunking (FastCDC).** We split the buffer into variable-size chunks where the boundaries are decided by a rolling Gear hash over the bytes themselves, with a strict mask up to the average size and a loose mask up to the max — this is the normalized chunking trick from Xia et al., *FastCDC: a Fast and Efficient Content-Defined Chunking Approach for Data Deduplication* (USENIX ATC '16). Editing the front of a 50-MB PDF only invalidates the chunks around the edit instead of every chunk after it, the way fixed-size chunks would.
3. **Content-addressable storage.** Each chunk is named by `sha256(plaintext)`. Two students who upload the same paper share its chunks for free. A student who re-exports a 200-slide deck after fixing a typo on slide 3 only re-uploads the chunk(s) covering slide 3. There's no coordination, no "is this a duplicate?" RPC — content addressing is globally consistent by definition.
4. **Per-chunk Zstandard at level 19.** Because dedup happens *before* compression, we only ever spend CPU on a chunk's zstd pass once across the entire system. That makes high compression levels (the slow, ratio-optimised end of zstd) economically reasonable.
5. **Manifest-as-pointer.** A "logical file" is a tiny `manifests/<key>.json` listing the ordered chunk hashes. It's cheap to copy (rename a file, version a file, share a file with a colleague) and turns `Range: bytes=` requests into "find chunk index, decompress one chunk, slice" — which is what `/api/files/[key]` does for PDF.js range fetches.

Operational details worth knowing:

- A small on-disk cache lives at `lib/persistence/cache/shards/` (gitignored). Cache hit → no R2 round-trip *and* no zstd pass on uploads, no R2 round-trip *and* a single zstd pass on reads.
- Chunks are *never* deleted on file delete: the same chunk may back many manifests. Garbage collection is a periodic mark-and-sweep job (mark every chunk reachable from any manifest, sweep the orphans). It runs as `npm run gc` locally and as a weekly GitHub Action (`.github/workflows/gc.yml`, Sundays at 03:00 UTC, with manual `workflow_dispatch` for ad-hoc runs). The job needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the `R2_`* secrets configured in **Settings → Secrets and variables → Actions**.
- An optional `npm run zstd:train` script samples R2 chunks (or a local directory) and trains a zstd dictionary, uploaded to `dicts/<id>` plus a `dicts/current` pointer. The dictionary path is wired into the manifest schema (`compression.dictId`) but not yet used by the runtime — `@mongodb-js/zstd` doesn't expose dict APIs. Swapping to a dict-aware codec (`zstd-napi` or Node 23.8+ native zstd) is a single-file change in `lib/persistence/compression/zstd.ts`.

Tunables (all optional, all read once at module load):


| env var                     | default     | meaning                                                                                              |
| --------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `ZSTD_LEVEL`                | `19`        | zstd compression level (1–22).                                                                       |
| `CHUNK_MIN`                 | `65536`     | FastCDC minimum chunk size, bytes.                                                                   |
| `CHUNK_AVG`                 | `262144`    | FastCDC target average chunk size, bytes.                                                            |
| `CHUNK_MAX`                 | `1048576`   | FastCDC maximum chunk size, bytes.                                                                   |
| `PDF_PRECOMPRESS`           | `pdflib`    | `pdflib` (pure-JS, fast, default), `mupdf` (WASM, AGPL, max ratio), or `off`/`0`/`false` to disable. |
| `PDF_PRECOMPRESS_MAX_BYTES` | `268435456` | Skip the pre-compress pass for inputs larger than this (256 MiB).                                    |


## Project layout

```text
app/
  api/state/route.ts            GET/PUT the full app state (401 in supabase mode if no user)
  api/upload/route.ts           Multipart upload endpoint (delegates to active driver)
  api/files/[key]/route.ts      Streams reconstructed bytes from R2 chunk store (Range/ETag); 302 to /uploads in file mode
  auth/callback/route.ts        OAuth + email-confirm code exchange
  (auth)/login/page.tsx         Login form (email + password, Google OAuth)
  (auth)/signup/page.tsx        Sign-up form (email + password, Google OAuth)
  (auth)/actions.ts             Server actions: login, signup, signInWithGoogle, signOut
  app/page.tsx                  Mounts <AppShell /> (protected)
  app/layout.tsx                Re-verifies session in supabase mode
  page.tsx                      Landing page (hero, features, FAQ, CTA)
  layout.tsx                    Root layout
  globals.css                   Tailwind + a few overrides
proxy.ts                        Supabase session refresh + route gating (Next.js 16 file convention)
components/
  AppShell.tsx                  Top bar + sidebar + canvas wiring, handles hydration
  AuthForm.tsx                  Shared client form for /login and /signup
  UserMenu.tsx                  Header avatar dropdown with sign-out
  Sidebar.tsx                   Workspace list (create/rename/delete/select)
  Canvas.tsx                    React Flow wrapper and add-node UX
  Panel.tsx                     Single floating, draggable, resizable panel chrome
  PanelManager.tsx              Renders open panels and resolves the right body per node kind
  panels/                       Per-kind panel bodies (Link, Image, Note, Page, Document, PDF)
  nodes/                        Custom React Flow node components
lib/
  types.ts                      All TypeScript types for workspaces, nodes, edges, highlights
  store.ts                      Zustand store with debounced server sync
  defaults.ts                   Seed state + palette constants
  server/
    auth.ts                     getCurrentUser() + verifySession()
    supabase/browser.ts         Browser client (cookies, anon key)
    supabase/server.ts          RSC/route-handler/server-action client (cookies, anon key)
    supabase/admin.ts           Service-role client for Next.js (re-exports admin-core behind "server-only")
    supabase/admin-core.ts      Same client, no "server-only" — used by scripts (gc, migration)
  persistence/
    types.ts                    Driver interface (state + file operations)
    file.ts                     Local filesystem driver
    supabase.ts                 Supabase Postgres + R2 chunked driver
    r2-client.ts                Cloudflare R2 (S3-compat) BlobStore
    index.ts                    Driver selector using PERSISTENCE env
    cache/shards/               Local on-disk chunk cache (gitignored)
    compression/
      fastcdc.ts                Content-defined chunker (Xia et al., USENIX ATC '16)
      zstd.ts                   Zstandard compress/decompress wrapper
      manifest.ts               manifests/<key>.json schema + (de)serializers
      chunk-store.ts            Pipeline: chunk → dedup → compress → upload + range streaming
scripts/
  migrate-state-to-supabase.ts  One-shot local -> Supabase/R2 migration (--user-id <uuid>)
  train-zstd-dict.ts            Train a zstd dictionary from R2 chunks (or a local dir)
supabase/
  migrations/0001_init.sql      Supabase schema + initial save_state(payload) function
  migrations/0002_auth_rls.sql  Per-user RLS + auth-aware save_state rewrite
data/
  state.json                    Local source of truth in file mode
```

## Routes

- `/` — public landing page.
- `/login`, `/signup` — auth pages. In supabase mode the proxy redirects authenticated users to `/app`.
- `/auth/callback` — receives the `?code=` from email confirmations and Google OAuth, exchanges it for a session.
- `/app` — the canvas. Protected by `proxy.ts` (and re-verified in `app/app/layout.tsx`) when `PERSISTENCE=supabase`.

## Keyboard / mouse

- Right-click the canvas for a quick add menu
- Double-click a node — or press **Enter** on a selected one — to open it in a panel; opening another node spawns another panel beside it
- **Esc** closes the topmost panel; **⌘ / Ctrl + Shift + Esc** closes all panels
- Drag a panel header to move; drag the bottom-right grip to resize; double-click the header (or hit `□`) to maximize
- Drag nodes on the canvas to re-arrange; drag the handles to connect
- Select a highlight in a PDF panel to view + add comments
- `⌘+↵` / `Ctrl+↵` in the comment box to post

## Notes

- Images are loaded from URLs (no upload pipeline yet). If you want local images, drop them in `public/` and reference `/your-image.png`.
- Legacy plain-text **document** nodes are migrated to **Pages** on load (body text preserved; old offset-based highlights and comments are not carried over).

