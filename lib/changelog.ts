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
    version: "0.2.20",
    date: "2026-05-24",
    tagline:
      "In-app browser on the web, image-aware AI conversations, a Notion-style math editor, and two new themes.",
    sections: [
      {
        heading: "In-app browser \u2014 cloud",
        items: [
          {
            tag: "new",
            text:
              "Browse and highlight without leaving the canvas in the web app. Click Browse in the header (or pick \u201cOpen browser\u201d from the command palette) and the in-app browser opens just like in the desktop build \u2014 navigate, select text, color-highlight, save the page as a Link node with every highlight attached. Pages are fetched server-side through `/api/web/proxy` and rendered in a sandboxed iframe with the same selection / highlight bridge the Electron `<webview>` uses, so the cite-able highlight flow is identical in both surfaces.",
          },
          {
            tag: "new",
            text:
              "The link panel\u2019s Web tab now uses the same proxy on the cloud, replacing the bare `<iframe src=url>` that most sites refused via X-Frame-Options. \u201cThis site refused to embed\u201d should be much rarer; proxy errors fall back to a friendly \u201cOpen original\u201d card.",
          },
          {
            tag: "improved",
            text:
              "The proxy iframe runs with `sandbox=\"allow-scripts allow-popups allow-forms\"` \u2014 deliberately without `allow-same-origin`. The proxied document lives at our origin, so without sandboxing its scripts could read Supabase tokens out of `localStorage` and impersonate the user against our APIs. Stripping `allow-same-origin` forces a unique opaque origin and isolates the page. Tradeoff: sites that depend on their own cookies render in logged-out state; the desktop `<webview>` doesn\u2019t have this restriction and keeps full session access via its `persist:browser` partition.",
          },
          {
            tag: "improved",
            text:
              "Cross-origin postMessage handshake between the bridge and the host. The bridge sends to `*` (opaque origin can\u2019t use a fixed targetOrigin) and the host authenticates messages by `event.source === iframe.contentWindow` rather than by origin string \u2014 origin-spoofing attacks can\u2019t hold a reference to that exact window object.",
          },
        ],
      },
      {
        heading: "Desktop \u2014 Google sign-in",
        items: [
          {
            tag: "fixed",
            text:
              "\u201cContinue with Google\u201d used to punt the OAuth flow to the OS browser \u2014 you\u2019d authenticate there, the localhost callback would land in the wrong window, and the Studygit shell stayed signed-out. The `will-navigate` guard now allow-lists OAuth hosts (`accounts.google.com`, `oauth2.googleapis.com`, `myaccount.google.com`, `*.supabase.co`, `*.supabase.in`) so Google\u2019s sign-in / consent / 2FA pages load inside the Studygit window and the Supabase callback lands back on the loopback origin with the session attached. Heads-up: your Supabase project\u2019s Auth \u2192 URL Configuration must include `http://127.0.0.1:3000/auth/callback` and `http://localhost:3000/auth/callback` for the redirect to be honored.",
          },
        ],
      },
      {
        heading: "AI conversations",
        items: [
          {
            tag: "new",
            text:
              "Image attachments on user messages. Paste a screenshot directly into the composer, drop an image file onto it, or pick one with the new image button next to the textarea \u2014 up to 4 per message. Images are resized client-side to a 1568px long edge and ~1.5\u202fMB before send (JPEG / WebP / PNG candidates evaluated, smallest one wins; animated GIFs are passed through unmodified up to the size cap so they don\u2019t lose animation). Forwarded to the provider using OpenAI\u2019s vision content-array format, so any vision-capable model (`gpt-4o`, `gpt-5-*`, OpenRouter vision, LLaVA via Ollama\u2026) just works; providers without vision return a clear upstream error.",
          },
          {
            tag: "improved",
            text:
              "Assistant replies now render as proper Markdown \u2014 `##` headings, bulleted / numbered lists, **bold**, *italic*, fenced ``` code blocks with language tags, blockquotes, tables, and `[links](url)`. Server-side: raw model output goes through `marked`, the resulting HTML gets a JSDOM walk that injects citation pills only into eligible text nodes (skipping `<code>` / `<pre>` so `[s1]` inside a code sample stays literal), and the final HTML is run through `sanitize-html` with a tight tag/attribute allow-list \u2014 no `<img>`, no `<script>`, no inline event handlers.",
          },
          {
            tag: "improved",
            text:
              "Citation verification now reads the parent element\u2019s `textContent` for the overlap window instead of a fixed character slice of the raw response. Citations that fall inside rich Markdown formatting (`<strong>`, `<em>`, inline code) keep verifying correctly across paraphrases that the old fixed-window heuristic would have dropped.",
          },
          {
            tag: "improved",
            text:
              "System prompt now nudges the model toward Markdown formatting and acknowledges attached images as part of the question (not background context). Composer placeholder swaps to \u201cAsk about these images\u2026\u201d when attachments are present; send is enabled with no text as long as at least one image is attached, so \u201cwhat is this?\u201d-style image-only questions work.",
          },
        ],
      },
      {
        heading: "Math blocks \u2014 full editor",
        items: [
          {
            tag: "improved",
            text:
              "Block math (slash menu \u2192 Math, or `$$`) now opens into a Notion-style card with a two-pane editor: LaTeX source on the left, live KaTeX preview on the right that re-renders on every keystroke. Empty preview shows a placeholder; invalid LaTeX shows the parser error inline (with the `ParseError:` prefix stripped) and disables the Done button so broken syntax can\u2019t commit. Header carries a Sigma label and the keyboard hint (`\u2318\u21B5` render \u00B7 `esc` cancel) as real `<kbd>` chips; footer has explicit Cancel / Done buttons in addition to the shortcuts. Selected ring uses the accent color + soft glow, matching the rest of the editor\u2019s atom selections.",
          },
          {
            tag: "improved",
            text:
              "The card collapses the two panes to a vertical stack when its host editor is narrower than 520px (snapped half-panel, narrow viewports) via a CSS container query \u2014 no window-width listeners, no JS reflow. Textarea auto-grows between 96px and 360px so matrices and `align*` environments aren\u2019t squished. Preview pane has a faint diagonal stripe pattern so it\u2019s visually distinct from the editor at a glance.",
          },
          {
            tag: "improved",
            text:
              "AI replies render math too. Anything the model wraps in `$...$`, `$$...$$`, `\\(...\\)`, or `\\[...\\]` gets pre-rendered with KaTeX server-side after sanitization, so equations appear styled inline alongside Markdown headings, lists, and citation pills \u2014 no extra client work, no flash of raw LaTeX. The math walker shares its logic with the article reader via a new `lib/server/math-render.ts` module, removing ~150 lines of duplication.",
          },
        ],
      },
      {
        heading: "Themes",
        items: [
          {
            tag: "new",
            text:
              "**Ocean.** Seafoam paper with deep teal ink in light; near-black navy with a bright cyan-teal accent in dark. Fills the \u201cmaritime\u201d lane that none of Slate (grey), Midnight (cobalt), or Forest (green) covered.",
          },
          {
            tag: "new",
            text:
              "**Sunset.** Warm peach paper with coral-orange ink in light; deep wine-maroon with vivid orange in dark. Lives in the coral-to-orange gradient that Paper (oxblood), Mocha (caramel), and Retro (amber) all sit adjacent to but don\u2019t actually hit.",
          },
          {
            tag: "improved",
            text:
              "Theme order in the picker now interleaves the new presets next to their tonal cousins (Slate \u2192 Midnight \u2192 Ocean, Mocha \u2192 Sunset) so the palette grid scans by color family rather than insertion order.",
          },
        ],
      },
    ],
  },
  {
    version: "0.2.19",
    date: "2026-05-23",
    tagline:
      "AI conversations on the canvas, citable model replies, and Notion-style page toggles.",
    sections: [
      {
        heading: "AI",
        items: [
          {
            tag: "new",
            text:
              "Conversation node on the canvas. Add one from the dock or command palette, attach sources, and chat in a panel that reads like a document thread rather than a chat bubble. Each exchange is saved on the node; assistant replies stream back with inline citation pills when the model grounds an answer in your sources.",
          },
          {
            tag: "new",
            text:
              "AI provider settings under the user menu. Point Studygit at any OpenAI-compatible endpoint (base URL, API key, model) with a few presets and a \u201cTest connection\u201d check. Credentials stay in localStorage on your device \u2014 nothing is sent to Studygit servers except through the endpoint you configure.",
          },
          {
            tag: "new",
            text:
              "Sticky sources per conversation. Attach PDF highlights, whole PDFs, web-article highlights, whole articles, pages, notes, or other AI replies. Whole-PDF sources are extracted client-side via pdf.js and cached in memory so the model gets full text without re-uploading the file each turn.",
          },
          {
            tag: "new",
            text:
              "Per-chip source mode swap. Click a source chip in the AI panel to flip between \u201cwhole document\u201d and a specific highlight or turn from the same node, without re-picking from scratch.",
          },
          {
            tag: "improved",
            text:
              "Multi-turn API. The server sends a messages[] thread to your provider, strips citation HTML from prior assistant turns before re-feeding them (saves tokens), and post-processes each reply to verify and render citation pills server-side.",
          },
        ],
      },
      {
        heading: "Citations",
        items: [
          {
            tag: "new",
            text:
              "Cite individual AI replies. Assistant turns show up in the /cite picker; each turn is its own citable row so you can reference a specific answer instead of the whole conversation.",
          },
          {
            tag: "new",
            text:
              "Two-step citation picker. /cite and the AI source picker now open on a node list first (PDF, page, note, link, conversation\u2026), then drill into that node\u2019s highlights or turns. Per-chip swap skips the node step when you\u2019re toggling modes on an already-attached source.",
          },
          {
            tag: "new",
            text:
              "Whole-node citations. Pages, notes, and full web articles (not just highlights) are first-class sources in /cite and in AI grounding. PDFs offer both \u201cwhole document\u201d and per-highlight rows.",
          },
          {
            tag: "fixed",
            text:
              "Citation and source pickers now close reliably on Esc and click-away. Esc is handled at the window level so it doesn\u2019t get swallowed by the panel\u2019s own keyboard shortcuts; Backspace on an empty search field goes back out of a drilled view.",
          },
        ],
      },
      {
        heading: "Pages",
        items: [
          {
            tag: "new",
            text:
              "Notion-style toggle blocks. Type > followed by a space at the start of a line (or pick Toggle from /) to create a collapsible block. Click the chevron to expand or collapse; Enter or Tab in the title opens the body; Shift-Tab moves back to the title.",
          },
          {
            tag: "improved",
            text:
              "Page formatting toolbar sits directly under the panel header, above the page title \u2014 same doc-chrome order as Notion. Toggle styling drops the bordered box in favour of a left chevron and inline summary row.",
          },
          {
            tag: "fixed",
            text:
              "Enter/Tab inside a toggle title no longer throws a selection error or leaves the cursor in a dead zone. Body entry resolves the first editable position inside detailsContent instead of landing on the node boundary.",
          },
        ],
      },
      {
        heading: "Fixes",
        items: [
          {
            tag: "fixed",
            text:
              "AI route no longer crashes with \u201cinvalid header name\u201d on the server. Custom provider headers (x-ai-base-url, x-ai-api-key, x-ai-model) live in a shared module without a \u201cuse client\u201d boundary so Next.js doesn\u2019t replace them with stub functions at import time.",
          },
          {
            tag: "fixed",
            text:
              "Legacy single-shot AI nodes (prompt + answer shape) auto-migrate to the conversation turns[] format on load, preserving existing text and provenance.",
          },
        ],
      },
    ],
  },
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
