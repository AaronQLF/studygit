// Structured release notes for `/changelog`. Editing this file is the
// only step needed to ship a new entry — the page reads it directly. The
// data shape is deliberately kept simple (plain strings, no MDX) so the
// content can also feed an in-app "what's new" badge or an RSS feed
// later without re-parsing markdown.

export type ChangelogSection = {
  heading?: string;
  items: ChangelogItem[];
};

export type ChangelogItem = {
  text: string;
  // Optional category tag rendered as a small chip on the left of the
  // bullet. Useful when scanning a long list for fixes vs features.
  tag?: "new" | "improved" | "fixed" | "performance";
};

export type ChangelogEntry = {
  version: string;
  // ISO yyyy-mm-dd; rendered locally on the page.
  date: string;
  // Short tagline shown next to the version. Optional.
  tagline?: string;
  sections: ChangelogSection[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.11",
    date: "2026-05-12",
    tagline: "In-app browser, autosave, and macOS chrome fixes.",
    sections: [
      {
        heading: "In-app browser",
        items: [
          {
            tag: "fixed",
            text:
              "Pressing Enter in the address bar now actually navigates. The webview ref was being torn down and rewired on every parent re-render, which silently latched the \u201cready\u201d flag to false and rerouted every Enter into a queue that never drained.",
          },
          {
            tag: "improved",
            text:
              "Default homepage is now Google. Opening the in-app browser lands you on a search box instead of a random Wikipedia article.",
          },
          {
            tag: "improved",
            text:
              "Wikipedia pages get a reader-mode stylesheet injected by the webview preload: side rails, tabs, edit links, and site notices are hidden; the article column is centred at a comfortable 760\u202fpx in Georgia at 1.6 line-height; infoboxes shrink into a right-floated card. Highlight anchoring still runs against the live DOM.",
          },
        ],
      },
      {
        heading: "Autosave",
        items: [
          {
            tag: "fixed",
            text:
              "Autosave was throwing `TypeError: Failed to fetch` once a workspace grew past 64\u202fKiB. The previous build set `keepalive: true` on the save fetch, which Chromium caps at 64\u202fKiB of cumulative body per page. The flag is gone; saves of any size now go through.",
          },
          {
            tag: "improved",
            text:
              "Page-close persistence moved to `navigator.sendBeacon` on `pagehide`. Closing the window (Cmd+W, app quit, force-close) now reliably flushes dirty state without the keepalive size cap, via a new `POST /api/state` alias.",
          },
          {
            tag: "improved",
            text:
              "Surface server-side save failures in the console instead of swallowing them \u2014 if `/api/state` returns non-2xx, you see the status code right away.",
          },
        ],
      },
      {
        heading: "macOS chrome",
        items: [
          {
            tag: "fixed",
            text:
              "Traffic lights stay visible at all times. The window was using `titleBarStyle: \"customButtonsOnHover\"`, which fades the buttons out when you\u2019re not near them. Switched to `\"hidden\"` with an explicit `trafficLightPosition` so the close/minimise/zoom buttons sit cleanly inside the 40\u202fpx in-app header.",
          },
        ],
      },
    ],
  },
  {
    version: "0.2.7",
    date: "2026-05-11",
    tagline: "Themes, presets, and a custom-accent picker.",
    sections: [
      {
        heading: "Theme system",
        items: [
          {
            tag: "new",
            text:
              "Seven built-in palettes — Paper (default), Slate, Mocha, Forest, Ink, Plum, and Retro — each with light and dark variants. Retro reads as a yellowed paperback in light mode and an amber-CRT terminal in dark mode.",
          },
          {
            tag: "new",
            text:
              "Custom accent color: pick from eight curated swatches or use a hex/color picker. The override sits on top of any preset.",
          },
          {
            tag: "new",
            text:
              "Open the theme dialog from the new palette icon in the header, the command palette (\u2318K \u2192 \"Customize theme\"), or the user menu.",
          },
          {
            tag: "improved",
            text:
              "Pre-paint init script applies the saved preset and accent before React hydrates, so the right palette is on screen at first paint with no flash.",
          },
        ],
      },
      {
        heading: "Fixes",
        items: [
          {
            tag: "fixed",
            text:
              "The theme entry point was hidden in the macOS desktop app (which doesn\u2019t use Supabase auth, so the user menu didn\u2019t render). The palette icon now lives in the header in every build.",
          },
        ],
      },
    ],
  },
  {
    version: "0.2.6",
    date: "2026-05-11",
    tagline: "Annotated web articles, snap layouts, and a sharper feel.",
    sections: [
      {
        heading: "Web articles, treated like PDFs",
        items: [
          {
            tag: "new",
            text:
              "Drop a link onto the canvas and personalGit fetches a sanitized reader view of the article. Select any passage to highlight it in five colors, thread comments, and cite it from any page.",
          },
          {
            tag: "new",
            text:
              "LaTeX inside articles is rendered server-side via KaTeX. Math written as $$ \u2026 $$, \\[ \u2026 \\], or \\( \u2026 \\) is typeset before the page hits the screen.",
          },
          {
            tag: "improved",
            text:
              "The /cite picker now lists every highlight in the workspace \u2014 PDFs and web articles in one place. The pill\u2019s locator chip shows \"p3\" for PDFs and the hostname for web articles.",
          },
          {
            tag: "fixed",
            text:
              "Citing a link-source highlight from a page now draws the dashed canvas edge between the two nodes (it was only drawing for PDF citations before). Citations inside PDF notes and link notes also draw edges now.",
          },
        ],
      },
      {
        heading: "Floating panels \u2014 Windows-11-style snap",
        items: [
          {
            tag: "new",
            text:
              "Every panel gets a new \"snap\" button that opens a layout chooser: fullscreen, halves (left/right or top/bottom), thirds, or 2\u00d72 quadrants. Click a cell to drop the panel into that slot.",
          },
          {
            tag: "new",
            text:
              "Keyboard shortcuts: \u2318/Ctrl + Option + \u2190/\u2192 for halves, \u2318/Ctrl + Option + \u2191 for fullscreen, \u2318/Ctrl + Option + \u2193 to unsnap.",
          },
          {
            tag: "improved",
            text:
              "Dragging a snapped panel by its header materializes the slot rect as free coords so you can pull it back into floating mode naturally.",
          },
        ],
      },
      {
        heading: "Aesthetic pass \u2014 more academic",
        items: [
          {
            tag: "improved",
            text:
              "Sharpened geometry (smaller radii, ruled-line shadows instead of soft drops, removed the body radial gradient).",
          },
          {
            tag: "improved",
            text:
              "Switched headings and brand wordmark from italic flair to upright Fraunces with slight negative tracking. New small-caps section-label utility used in the sidebar, command palette, and panel headers.",
          },
          {
            tag: "improved",
            text:
              "Reader view body is now justified and auto-hyphenated, with rule underlines on H1 and small-caps figure captions. Pages get the same H1 rule treatment.",
          },
        ],
      },
      {
        heading: "Performance",
        items: [
          {
            tag: "performance",
            text:
              "Typing in a page no longer triggers a full canvas re-render. The editor batches keystrokes into a debounced (180\u202fms) onChange and the canvas skips when no structural change happened.",
          },
          {
            tag: "performance",
            text:
              "PDF / Page / Link panel bodies are code-split. pdf.js, the TipTap stack, KaTeX, and the article reader no longer ship in the initial /app chunk \u2014 each is fetched the first time you open that kind of panel.",
          },
          {
            tag: "performance",
            text:
              "Lowlight (syntax highlighting) trimmed from \u223c190 grammars to a curated 10-language set. Roughly 150\u202fKB off the editor chunk.",
          },
          {
            tag: "performance",
            text:
              "Autosave serialization yields to requestIdleCallback so saving a workspace with PDFs and highlights doesn\u2019t fight typing for the main thread. Saves also use keepalive: true so the last burst survives navigation.",
          },
          {
            tag: "performance",
            text:
              "Canvas now subscribes to workspace-filtered slices via useShallow; per-panel node lookup moved into a per-panel host so an edit to node A no longer re-renders panel B. Citation HTML parsing is memoized by string identity.",
          },
          {
            tag: "performance",
            text:
              "Moved katex.min.css and tippy.css from the root layout into the AppShell so the marketing landing page no longer ships them.",
          },
        ],
      },
    ],
  },
  {
    version: "0.2.5",
    date: "2026-05-08",
    tagline: "Electron build hygiene.",
    sections: [
      {
        items: [
          {
            tag: "fixed",
            text:
              "Switched the Electron build to webpack to dodge a Turbopack symlink bug that produced broken standalone bundles on some machines.",
          },
        ],
      },
    ],
  },
  {
    version: "0.2.4",
    date: "2026-05-08",
    sections: [
      {
        items: [
          {
            tag: "fixed",
            text:
              "Prevented Turbopack from baking npm atomic-install temp-dir paths into the production bundle (the paths were sometimes garbage-collected before runtime).",
          },
        ],
      },
    ],
  },
  {
    version: "0.2.3",
    date: "2026-05-08",
    tagline: "Automated release pipeline.",
    sections: [
      {
        items: [
          {
            tag: "improved",
            text:
              "Tagging a release now builds and publishes the macOS (Intel + Apple Silicon) and Windows artifacts automatically. Each tag updates /api/download/<platform> to the latest asset.",
          },
        ],
      },
    ],
  },
  {
    version: "0.2.2",
    date: "2026-05-08",
    sections: [
      {
        items: [
          {
            tag: "fixed",
            text:
              "Pruned npm atomic-install temp directories from the standalone bundle so packaged releases boot reproducibly across machines.",
          },
        ],
      },
    ],
  },
  {
    version: "0.2.1",
    date: "2026-05-08",
    sections: [
      {
        items: [
          {
            tag: "fixed",
            text:
              "Moved electron-updater to dependencies so the packaged macOS/Windows app actually ships it and can auto-update.",
          },
          {
            tag: "improved",
            text:
              "CI now lints for Electron runtime deps misclassified as devDependencies, so this class of issue can\u2019t regress.",
          },
        ],
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-05-08",
    tagline: "Desktop app.",
    sections: [
      {
        items: [
          {
            tag: "new",
            text:
              "First Electron build of personalGit for macOS (Apple Silicon, Intel) and Windows. Everything runs locally \u2014 workspaces, pages, PDFs all live in the OS user-data directory; no Supabase auth required.",
          },
          {
            tag: "new",
            text:
              "Download links at /api/download/<platform> always resolve to the latest GitHub release artifact, so the URL stays stable as new versions ship.",
          },
        ],
      },
    ],
  },
  {
    version: "0.1.1",
    date: "2026-05-06",
    tagline: "R2-backed storage.",
    sections: [
      {
        items: [
          {
            tag: "new",
            text:
              "Object storage backend on Cloudflare R2. PDFs and large attachments are chunked with FastCDC and compressed with zstd, so re-uploads of overlapping content deduplicate automatically.",
          },
          {
            tag: "improved",
            text:
              "Downloads use short-lived signed URLs; private content never leaks beyond the signed-in user.",
          },
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-05-04",
    tagline: "The first usable personalGit.",
    sections: [
      {
        heading: "Canvas",
        items: [
          {
            tag: "new",
            text:
              "Infinite-canvas workspaces with link, image, sticky note, page, PDF, and shape nodes. Connect any two nodes with an edge.",
          },
          {
            tag: "new",
            text:
              "Multiple workspaces \u2014 one per class, project, or topic \u2014 each with their own canvas, panels, and state.",
          },
        ],
      },
      {
        heading: "Pages",
        items: [
          {
            tag: "new",
            text:
              "Notion-like rich text pages with a slash menu: headings, lists, tasks, toggles, callouts, code blocks (syntax highlighted via lowlight), block / inline math (KaTeX), and Mermaid diagrams.",
          },
        ],
      },
      {
        heading: "PDFs",
        items: [
          {
            tag: "new",
            text:
              "PDF node renders with a real text layer. Select any passage to highlight it in five colors, thread comments, and cite the highlight from any page.",
          },
          {
            tag: "new",
            text:
              "Citation pills are clickable \u2014 click one to jump straight to the highlighted passage, even across workspaces.",
          },
        ],
      },
      {
        heading: "Auth and chrome",
        items: [
          {
            tag: "new",
            text:
              "Sign-up / sign-in via Supabase, with Google as an option. Light / dark / system theme toggle. Command palette (\u2318K). Floating, draggable, resizable panels.",
          },
        ],
      },
    ],
  },
];

// Convenience: the most-recent entry, used as the "current" version chip
// in the AppShell header and on the changelog page hero.
export const LATEST_RELEASE = CHANGELOG[0];
