# personalGIt

Your personal learning canvas. Create nested folders, drop in links, images, sticky notes, markdown blog posts, and documents you can highlight and comment on — all on an infinite React Flow canvas.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4
- React Flow (`@xyflow/react`) for the canvas
- Zustand for client state
- `react-markdown` + `remark-gfm` for rendering blog posts
- State persisted as a plain JSON file at `data/state.json` (so Cursor can edit your content directly)

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## How it works

- **Folders / subfolders** — left sidebar. Hover a folder to rename, create a subfolder, or delete it.
- **Canvas** — click **Add** in the top-left (or right-click the pane) to drop in:
  - **Link** — title + URL + optional description
  - **Image** — URL + optional caption
  - **Note** — sticky note with 6 color swatches
  - **Blog** — editable markdown with a live preview (GFM: tables, task lists, etc.)
  - **Document** — opens a full-screen reader where you can highlight any text and thread comments on each highlight
- **Edges** — drag from a node's bottom handle to another node's top handle to connect them
- **Persistence** — every change is debounced and saved to `data/state.json`. Refreshing the page restores everything.

## Asking Cursor to write blogs

Because state lives in `data/state.json`, you can ask Cursor in this repo:

> "Write me a blog about transformers inside the 'Welcome' folder"

Cursor can open `data/state.json`, add a new blog node with the markdown content, and the next time you focus the browser window it will hydrate the new node.

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
  Sidebar.tsx          Folder tree (create/rename/delete/select)
  Canvas.tsx           React Flow wrapper and add-node UX
  DocumentReader.tsx   Full-screen document reader with highlights + comments
  nodes/               Custom React Flow node components
lib/
  types.ts             All TypeScript types for folders, nodes, edges, highlights
  store.ts             Zustand store with debounced server sync
  defaults.ts          Seed state + palette constants
data/
  state.json           Source of truth — edit directly or via the UI
```

## Keyboard / mouse

- Right-click the canvas for a quick add menu
- Double-click a node to edit it (where applicable)
- Drag nodes to re-arrange; drag the handles to connect
- Select a highlight in the document reader to view + add comments
- `⌘+↵` / `Ctrl+↵` in the comment box to post

## Notes

- Images are loaded from URLs (no upload pipeline yet). If you want local images, drop them in `public/` and reference `/your-image.png`.
- Document content is plain text (supports newlines). Highlights are stored as `{start, end}` offsets, so re-editing the document may shift existing highlights — edit carefully.
