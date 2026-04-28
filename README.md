# personalGIt

Your personal learning canvas — a "student second brain". Create independent workspaces, drop in links, images, sticky notes, rich block-edited Pages, documents, and PDFs you can highlight, annotate, and ask AI about — all on an infinite React Flow canvas.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4
- React Flow (`@xyflow/react`) for the canvas
- Zustand for client state
- Tiptap (Notion-like block editor) with KaTeX math, Mermaid diagrams, code highlighting, slash menu
- Persistence driver selected by `PERSISTENCE=file|supabase` (defaults to `file`)
- Supabase Postgres stores `workspaces`/`nodes`/`edges`/`app_meta` in `supabase` mode
- AWS S3 stores uploaded PDFs in `supabase` mode (`uploads/<nanoid>.pdf`)

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

## Migration

Older `blog` nodes (markdown) auto-migrate to `page` nodes (Tiptap HTML) the first time the app hydrates against an old `data/state.json`. The conversion runs through `marked` once, then the new shape is persisted on the next save.

## Asking Cursor to write pages

When running in local-file mode (default), state lives in `data/state.json`, so you can ask Cursor in this repo:

> "Write me a page about transformers inside the 'Welcome' workspace"

Cursor can open `data/state.json`, add a new page node with the HTML content, and the next time you focus the browser window it will hydrate the new node.

To avoid stomping on in-progress client edits, prefer closing the browser tab (or letting the UI idle) while Cursor is editing the JSON.

When running in Supabase mode, app state is not backed by `data/state.json`; use SQL or app APIs instead.

## Supabase + S3 setup (optional)

1. Copy `.env.example` to `.env.local` and fill values:

```bash
PERSISTENCE=supabase                # or file (default)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
AWS_REGION=us-east-1
AWS_S3_BUCKET=<bucket-name>
AWS_ACCESS_KEY_ID=<access-key>
AWS_SECRET_ACCESS_KEY=<secret-key>
```

1. Run the SQL migration in Supabase (SQL editor):

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

1. Ensure your S3 bucket accepts put/get for the configured credentials.

1. Optional one-shot migration from local state/uploads:

```bash
npm run migrate:state
```

This uploads `public/uploads/*` assets referenced by PDF nodes, rewrites each PDF `src` to `/api/files/<key>`, and saves the resulting state into Supabase via `rpc('save_state')`.

Notes:

- `PERSISTENCE=file` keeps the original behavior (`data/state.json` + `public/uploads`).
- `PERSISTENCE=supabase` uses Supabase for state and S3 for PDF assets.
- `/api/files/[key]` returns a `302` redirect to a short-lived presigned S3 GET URL.

## Project layout

```text
app/
  api/state/route.ts   GET/PUT the full app state
  api/upload/route.ts  Multipart upload endpoint (delegates to active driver)
  api/files/[key]/route.ts  Redirects to local file or presigned S3 URL
  layout.tsx           Root layout
  page.tsx             Mounts <AppShell />
  globals.css          Tailwind + a few overrides
components/
  AppShell.tsx         Top bar + sidebar + canvas wiring, handles hydration
  Sidebar.tsx          Workspace list (create/rename/delete/select)
  Canvas.tsx           React Flow wrapper and add-node UX
  Panel.tsx            Single floating, draggable, resizable panel chrome
  PanelManager.tsx     Renders open panels and resolves the right body per node kind
  panels/              Per-kind panel bodies (Link, Image, Note, Page, Document, PDF)
  nodes/               Custom React Flow node components
lib/
  types.ts             All TypeScript types for workspaces, nodes, edges, highlights
  store.ts             Zustand store with debounced server sync
  defaults.ts          Seed state + palette constants
  persistence/
    types.ts           Driver interface (state + file operations)
    file.ts            Local filesystem driver
    supabase.ts        Supabase + S3 driver
    index.ts           Driver selector using PERSISTENCE env
scripts/
  migrate-state-to-supabase.ts  One-shot local -> Supabase/S3 migration
supabase/
  migrations/0001_init.sql      Supabase schema + save_state(payload) function
data/
  state.json           Local source of truth in file mode
```

## Keyboard / mouse

- Right-click the canvas for a quick add menu
- Double-click a node — or press **Enter** on a selected one — to open it in a panel; opening another node spawns another panel beside it
- **Esc** closes the topmost panel; **⌘ / Ctrl + Shift + Esc** closes all panels
- Drag a panel header to move; drag the bottom-right grip to resize; double-click the header (or hit `□`) to maximize
- Drag nodes on the canvas to re-arrange; drag the handles to connect
- Select a highlight in the document reader to view + add comments
- `⌘+↵` / `Ctrl+↵` in the comment box to post

## Notes

- Images are loaded from URLs (no upload pipeline yet). If you want local images, drop them in `public/` and reference `/your-image.png`.
- Document content is plain text (supports newlines). Highlights are stored as `{start, end}` offsets, so re-editing the document may shift existing highlights — edit carefully.
