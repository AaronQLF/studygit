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
    version: "0.2.16",
    date: "2026-05-21",
    tagline:
      "Subpages, page zoom, the weekly time tracker, and Reader \u21c4 Web for links.",
    sections: [
      {
        heading: "Pages",
        items: [
          {
            tag: "new",
            text:
              "Slash menu has a new \"Page\" command (also matches /subpage, /child, /nested). Creates a fresh page node on the canvas next to the parent, draws a logical edge between them, and inserts a clickable pill in the parent\u2019s body. The pill auto-updates as you rename the subpage \u2014 inside the editor and inside canvas card previews.",
          },
          {
            tag: "new",
            text:
              "Text color + highlight color pickers in the editor toolbar. Curated 10-swatch palettes tuned for both light and dark themes, with a \u201c\u2014\u201d swatch to clear the color and a tiny color-bar under each toolbar button reflecting whichever color is currently at the caret.",
          },
          {
            tag: "new",
            text:
              "Notion-style page zoom. \u2318+ / \u2318\u2212 / \u23180 scale the page (title and body together) in 10\u202f% steps from 70\u202f% to 160\u202f%, with a [\u2212] 100% [+] group on the right end of the toolbar. Persisted per-device. Shortcuts only intercept when an editor has focus, so the browser\u2019s UI zoom still works everywhere else.",
          },
        ],
      },
      {
        heading: "Time tracker",
        items: [
          {
            tag: "new",
            text:
              "Compact tracker lives in the app header. Idle it shows your total time today (\u201c2h 13m\u201d); during a Pomodoro it shows a live countdown with a pulsing accent dot. Click it for the full popover: hero-sized timer, single Start / Pause / Resume CTA, inline duration chips (15\u202fm / 25\u202fm / 45\u202fm / 60\u202fm), and a sound toggle. Plays a two-note ding via the Web Audio API on phase completion, updates the tab title with the remaining time, and persists per-device to localStorage.",
          },
          {
            tag: "new",
            text:
              "Weekly bar chart with previous-week navigation. \u25c0 / \u25b6 chevrons scroll through history (\u201cThis week\u201d \u2192 \u201cLast week\u201d \u2192 \u201c2 weeks ago\u201d \u2192 date-range like \u201cApr 28 \u2013 May 4\u201d). The week total is right-aligned; today\u2019s bar is highlighted only when viewing the current week so prior Wednesdays don\u2019t get a misleading accent stripe.",
          },
          {
            tag: "new",
            text:
              "Single-line stats row in the popover: today\u2019s total / pomodoros today / current streak (consecutive days at or above 5\u202fmin), with a \ud83d\udd25 flame that turns orange when the streak is alive. Today doesn\u2019t break the streak retroactively until tomorrow.",
          },
          {
            tag: "improved",
            text:
              "Active time only counts when the tab is both visible and focused, so a background tab or Slack in the foreground can\u2019t inflate study hours. The Pomodoro keeps counting either way \u2014 once you\u2019ve committed to a focus session, alt-tabbing to a PDF doesn\u2019t pause it.",
          },
        ],
      },
      {
        heading: "Floating panels \u2014 drag-to-snap",
        items: [
          {
            tag: "new",
            text:
              "Windows-11-style drag-to-edge snap. Drag a panel header into a viewport hot zone and a translucent accent overlay previews where it\u2019ll land; release to snap. Edges \u2192 fullscreen / halves; corners \u2192 quadrants. Esc cancels mid-drag. Plays nicely with the existing snap picker and \u2318/Ctrl + Alt + Arrow shortcuts.",
          },
          {
            tag: "fixed",
            text:
              "Upper-right close / maximize / snap buttons were hard to click in the desktop build. The app header carries `-webkit-app-region: drag` so you can move the OS window by it, and panel headers at the default 12\u202fpx snap margin overlap that strip. Electron computes drag regions geometrically and overrides clicks on whatever sits on top, so the buttons were getting reinterpreted as window-drags. Added `-webkit-app-region: no-drag` on the panel root \u2014 clicks register normally now.",
          },
        ],
      },
      {
        heading: "Links \u2014 Reader \u21c4 Web",
        items: [
          {
            tag: "new",
            text:
              "Segmented toggle in the link-panel toolbar swaps the extracted reader view for the live original page. Inside Electron the source view mounts a real <webview> on the shared persist:browser partition, so logins from the in-app browser (Substack, NYT, etc.) carry over automatically. In a regular browser it falls back to a sandboxed <iframe> with a graceful \u201cthis site refused to embed\u201d overlay when X-Frame-Options blocks it.",
          },
          {
            tag: "improved",
            text:
              "Highlight jumps (sidebar click, citation pill from another node, /cite navigation) auto-switch back to Reader before scrolling, since that\u2019s where the anchor lives. The side panel, the active highlight, and the notes pane stay put across the swap.",
          },
        ],
      },
      {
        heading: "Fixes",
        items: [
          {
            tag: "fixed",
            text:
              "Subpage pills on canvas card previews now reflect the linked page\u2019s current title (and show a struck-through \u201cMissing page\u201d state when the target is deleted). Previously the preview was frozen at the label captured when the pill was first inserted \u2014 the live React node-view only ran inside an open editor. Resolved at render time via a lightweight DOM rewrite that subscribes to a shallow page-titles map and skips re-parsing when nothing changed.",
          },
          {
            tag: "fixed",
            text:
              "Quieted the \u201c[React Flow]: parent container needs a width and a height\u201d warning that fired 6\u20138 times on /app load. The canvas wrapper now uses `absolute inset-0` inside a `relative <main>` so React Flow\u2019s ResizeObserver gets real pixel dimensions on first measure, and a tolerant onError handler swallows the residual transient 004 fire that can still slip through during the dynamic-import flush.",
          },
          {
            tag: "fixed",
            text:
              "Multicolor highlights stay readable in dark themes. The Highlight extension writes an inline `color: inherit` on `<mark>`, which let dark-mode foreground colors leak through and become unreadable on light pastel highlights. Forced `#18181b !important` on the mark itself; nested text-color spans still win, since they apply to a child element.",
          },
        ],
      },
    ],
  },
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
              "Drop a link onto the canvas and Studygit fetches a sanitized reader view of the article. Select any passage to highlight it in five colors, thread comments, and cite it from any page.",
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
              "First Electron build of Studygit for macOS (Apple Silicon, Intel) and Windows. Everything runs locally \u2014 workspaces, pages, PDFs all live in the OS user-data directory; no Supabase auth required.",
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
    tagline: "The first usable Studygit.",
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
