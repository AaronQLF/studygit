# personalGIt

Your personal learning canvas — a "student second brain". Create independent workspaces, drop in links, images, sticky notes, rich block-edited Pages, documents, and PDFs you can highlight, annotate, and ask AI about — all on an infinite React Flow canvas.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4
- React Flow (`@xyflow/react`) for the canvas
- Zustand for client state
- Tiptap (Notion-like block editor) with KaTeX math, Mermaid diagrams, code highlighting, slash menu
- State persisted as a plain JSON file at `data/state.json` (so Cursor can edit your content directly)

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
- **Persistence** — every change is debounced and saved to `data/state.json`. Refreshing the page restores everything.

## Migration

Older `blog` nodes (markdown) auto-migrate to `page` nodes (Tiptap HTML) the first time the app hydrates against an old `data/state.json`. The conversion runs through `marked` once, then the new shape is persisted on the next save.

## Asking Cursor to write pages

Because state lives in `data/state.json`, you can ask Cursor in this repo:

> "Write me a page about transformers inside the 'Welcome' workspace"

Cursor can open `data/state.json`, add a new page node with the HTML content, and the next time you focus the browser window it will hydrate the new node.

To avoid stomping on in-progress client edits, prefer closing the browser tab (or letting the UI idle) while Cursor is editing the JSON.

## Project layout

```
app/
  api/state/route.ts   GET/PUT the full app state
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
data/
  state.json           Source of truth — edit directly or via the UI
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
