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
    version: "0.2.32",
    date: "2026-06-10",
    tagline:
      "Flashcards with spaced repetition, a Notion-grade writing upgrade, and saves that can no longer lose your work.",
    sections: [
      {
        heading: "Flashcards",
        items: [
          {
            tag: "new",
            text:
              "A new Flashcards node (press F, or find it in the dock, right-click menu, and ⌘K) turns your materials into a study deck. Attach any source — a whole PDF, a single highlight, an article, a page, even a past AI answer — pick how many cards you want, and the AI drafts question/answer pairs grounded strictly in what you attached. Every card is editable, and you can write your own by hand too.",
          },
          {
            tag: "new",
            text:
              "Study mode runs a classic SM-2 spaced-repetition scheduler: flip with Space, grade with 1–4 (Again / Hard / Good / Easy). Intervals grow as you succeed (1 day → 3 days → longer), lapsed cards come back ten minutes later within the same session, and the canvas card shows what’s due at a glance — so the deck tells you when it’s time to review.",
          },
          {
            tag: "new",
            text:
              "Select any passage while writing and click “Card” in the new selection toolbar — the selection becomes flashcards in a deck automatically created beside the page and wired to it on the canvas. With AI configured you get 1–3 generated cards from the exact excerpt; without, the selection lands as a card front for you to answer.",
          },
          {
            tag: "improved",
            text:
              "Scheduling upgraded from SM-2 to FSRS — the machine-learned spaced-repetition algorithm Anki adopted — which reaches the same retention with meaningfully fewer reviews. Existing cards keep their progress (their history seeds the new scheduler), lapsed cards go through proper relearning steps, and every grade button now shows exactly when you'd see the card again (1m / 10m / 3d / 2mo).",
          },
          {
            tag: "new",
            text:
              "Cloze deletions: write a sentence and wrap the part to hide in {{double braces}} — the question shows blanks, the answer highlights what was hidden. Select words in the card editor and hit the {{ }} button to wrap them, and the AI generator now emits cloze cards on its own when a fact reads best as fill-in-the-blank.",
          },
          {
            tag: "new",
            text:
              "Image occlusion: upload or paste a diagram, drag boxes over the labels, and study it like Anki's image occlusion — covered on the question side, outlined on reveal. Made for anatomy, maps, circuit diagrams, and every other label-the-parts subject.",
          },
          {
            tag: "new",
            text:
              "Exam-aware scheduling: give a deck an exam date and the scheduler caps every interval so each card cycles again before the day — no more “next review in 3 months” on material you're tested on in two weeks. The deck shows an “Exam in Nd” countdown, and both study surfaces respect it.",
          },
        ],
      },
      {
        heading: "Writing",
        items: [
          {
            tag: "new",
            text:
              "Select text and a floating toolbar appears right over the selection — bold, italic, underline, strikethrough, inline code, text and highlight colors, a proper link editor (no more browser prompt), and a “turn into” menu that converts the block between text, headings, lists, todos, quotes, and code blocks without touching the top toolbar.",
          },
          {
            tag: "new",
            text:
              "Inline AI rewrites, right in the selection toolbar: Improve writing, Fix grammar & spelling, Make shorter, Make longer, and Simplify language. The rewrite replaces the selection in a single step — ⌘Z brings the original straight back — and runs through your own configured AI provider, same as every other AI feature.",
          },
          {
            tag: "new",
            text:
              "Tables. Type /table for a 3×3 grid with a header row, drag column edges to resize, and manage rows and columns from the selection toolbar while your cursor is inside one.",
          },
          {
            tag: "new",
            text:
              "Block ergonomics and orientation: Alt+↑/↓ moves the current block (or list item) up and down, ⌘D duplicates it, an outline button in the page toolbar jumps between headings in long notes, and a quiet footer shows live word count and reading time.",
          },
        ],
      },
      {
        heading: "Design",
        items: [
          {
            tag: "improved",
            text:
              "Zoomed-out canvases are finally legible: below ~45% zoom, pages, PDFs, links, notes, conversations, and decks render as large-type title chips instead of shrunken full cards — the level-of-detail treatment serious canvas tools use. Images and shapes stay full-fidelity, edges keep their anchors, and double-click still opens the panel. Zooming also no longer churns saves: presentation-only size changes are never persisted.",
          },
          {
            tag: "improved",
            text:
              "The design system got locked in: a shared radius scale and button/input/chip primitives in CSS, and the flashcards green promoted to a theme token (--pg-study) with a proper dark-mode variant — so every study surface now adapts to dark mode and future theme presets can tune it. Edges tint on hover, and the PDF card's width no longer disagrees with its stored size.",
          },
          {
            tag: "fixed",
            text:
              "Dialogs can no longer hide behind your windows. Every panel focus used to push that panel's z-index higher forever — after ten clicks, panels covered the theme dialog, the AI settings, even ⌘K. Panels now stack inside their own isolated layer with a documented app-wide z-scale, so dialogs, menus, and toasts always render above them no matter how long the session.",
          },
          {
            tag: "improved",
            text:
              "The sidebar grew up: each workspace gets a colored monogram tile (a stable hue derived from its identity), a node count at a glance, a clearer selected state, and Move up / Move down in the row menu for reordering — order syncs to your account (migration 0005 adds the column). Row menus also close when you click elsewhere now.",
          },
        ],
      },
      {
        heading: "Find & review",
        items: [
          {
            tag: "new",
            text:
              "⌘K now searches your actual content, not just commands. Pages, notes, articles, PDF and web highlights, flashcards, and AI replies across every workspace — type two characters and matching results appear first, with the match shown in context and the workspace named on the right. Selecting a result jumps straight there, switching workspaces and scrolling to the exact highlight when the match lives inside one.",
          },
          {
            tag: "new",
            text:
              "A Study button in the header collects every due card from every deck in every workspace into one daily session, with a badge showing how many are waiting (mirrored on the desktop app's dock icon). Reviewing keeps a daily streak that syncs with your account — the loop that makes spaced repetition actually happen.",
          },
        ],
      },
      {
        heading: "PDF reading",
        items: [
          {
            tag: "performance",
            text:
              "The PDF viewer is now virtualized: only the pages near your viewport are actually rendered, and pages that scroll far away release their canvas memory. Previously every page of the document rendered eagerly — and re-rendered on every zoom step — so a 600-page textbook is now smooth instead of a slideshow.",
          },
          {
            tag: "new",
            text:
              "Search inside PDFs. Press ⌘F while reading (or click the magnifier) to search the whole document — matches highlight in amber right on the page, Enter / Shift+Enter step through them across pages, and the counter shows where you are. The text index builds once per document, on first search.",
          },
          {
            tag: "new",
            text:
              "Real page navigation: a current-page indicator that tracks as you scroll, an editable page number to jump anywhere, and prev/next buttons. Zooming now stays anchored on the spot you were reading instead of dumping you somewhere else in the document.",
          },
          {
            tag: "new",
            text:
              "Dim reading mode — the moon button inverts page colors for late-night reading, while your highlights keep their true colors. The preference sticks per device.",
          },
        ],
      },
      {
        heading: "Shapes",
        items: [
          {
            tag: "new",
            text:
              "Six new shape variants — pill, triangle, parallelogram, hexagon, arrow, and star — alongside the original four, with the picker now previewing each shape's actual geometry. The ellipse also finally renders as a true ellipse (it was secretly a pill before).",
          },
          {
            tag: "new",
            text:
              "Labels can sit at the top (frames) or dead center (flowchart shapes) — pointy variants default to centered so the label no longer hides in a clipped-off corner, and you can override per shape.",
          },
          {
            tag: "new",
            text:
              "Bring to front / send to back. Overlapping frames and shapes can finally be reordered — nest a small frame on top of a backdrop frame without the stacking order fighting you.",
          },
        ],
      },
      {
        heading: "Saving — reliability",
        items: [
          {
            tag: "fixed",
            text:
              "Two open tabs (or your laptop and the desktop app) could silently overwrite each other’s changes — last write won, no warning. Saves are now versioned end to end: the server rejects stale snapshots, the losing tab reloads the newest state and tells you, and tabs broadcast their saves to each other so everyone stays in sync before a conflict can even form.",
          },
          {
            tag: "fixed",
            text:
              "Failed saves used to fail silently — the header said “saving…” forever and the error was never shown. Saves now retry automatically with backoff, and the header pill turns into a “save failed — retry” button while anything is unsaved. And if the app can’t load your workspace at all, it shows a retry screen instead of an editable default canvas — which previously could overwrite your real data with the welcome page on the next save.",
          },
          {
            tag: "fixed",
            text:
              "An AI reply interrupted by a reload used to stay stuck “running” forever, permanently blocking that conversation (and the Study Buddy). Interrupted replies are now marked as retryable errors on load.",
          },
        ],
      },
      {
        heading: "Security & hardening",
        items: [
          {
            tag: "fixed",
            text:
              "Uploads are now stamped with their owner and the file endpoint refuses to serve another account’s files; the AI endpoint requires a signed-in session on the hosted deployment (it was previously an open relay); source titles are escaped before entering the model prompt; uploads are capped at 100 MB; and hands-free mode now stops cleanly with an explanation when microphone access is denied instead of silently retrying forever.",
          },
          {
            tag: "improved",
            text:
              "Panels stranded off-screen by a window resize pull themselves back into reach, the Study Buddy dock can no longer swallow a small window, and the command palette highlight follows your search as you type.",
          },
        ],
      },
    ],
  },
  {
    version: "0.2.31",
    date: "2026-06-08",
    tagline:
      "Meet Study Buddy \u2014 a docked AI partner that follows what you\u2019re reading, talks back hands-free, and proposes page edits you accept in a click.",
    sections: [
      {
        heading: "Study Buddy",
        items: [
          {
            tag: "new",
            text:
              "An app-wide AI study partner now docks to the right of the canvas \u2014 toggle it with \u2318J / Ctrl+J or the new \u201cBuddy\u201d button in the header. It follows you across workspaces and survives reloads, and it automatically attaches whatever you\u2019re currently looking at (the focused page, PDF, note, or link) as its primary source, so you can ask \u201cexplain the part I\u2019m on\u201d without re-pasting context every time. Pin extra sources with the same picker the canvas conversation nodes use, and resize the dock to taste \u2014 the width sticks.",
          },
          {
            tag: "new",
            text:
              "Hands-free voice mode. Flip it on and the buddy listens, auto-sends each question the moment you stop talking, and reads its reply back out loud \u2014 a continuous spoken back-and-forth built on the browser\u2019s own speech-to-text and speech-synthesis engines plus your configured AI provider, with no separate realtime API. The mode is remembered between sessions so you don\u2019t have to re-arm it each time.",
          },
          {
            tag: "new",
            text:
              "The buddy can edit your work, with your approval. When it proposes a change to the page or note you\u2019re on, the suggestion renders as an Accept / Reject card next to the reply; accepting applies it in one click \u2014 replace, append, or prepend \u2014 to the focused Page (rich text), Note (plain text), or a Link node\u2019s notes. Suggestions ride along inside the normal Markdown reply and are lifted out before display, and anything malformed is silently skipped so a bad proposal can never corrupt a document.",
          },
          {
            tag: "improved",
            text:
              "Under the hood, the canvas conversation node and the Study Buddy now run on one shared conversation engine (a new useConversation hook plus a common source-attach helper), so sending, retrying, the composer, and citation rendering behave identically in both surfaces \u2014 one implementation to maintain instead of two near-identical copies. The buddy\u2019s extra edit instructions are appended to the model\u2019s prompt through a length-bounded, sanitized channel that leaves the citation rules every other AI surface depends on untouched.",
          },
        ],
      },
      {
        heading: "PDF uploads",
        items: [
          {
            tag: "fixed",
            text:
              "A failed PDF upload now tells you why instead of showing a cryptic \u201cUnexpected token \u2018<\u2019\u201d. When your session isn\u2019t active the upload request gets bounced to the sign-in page, and the PDF card used to try to parse that login HTML as JSON and choke. Both the canvas PDF card and the in-panel uploader now detect the redirect (and any other non-JSON response) and surface a plain \u201cnot signed in\u201d message, sharing a single upload helper across both spots.",
          },
        ],
      },
    ],
  },
  {
    version: "0.2.29",
    date: "2026-05-28",
    tagline:
      "Desktop offline screen now auto-reconnects in the background \u2014 and hides a small game for the wait.",
    sections: [
      {
        heading: "Desktop \u2014 offline screen",
        items: [
          {
            tag: "improved",
            text:
              "The Electron shell is a thin window over the hosted Vercel deployment, so every web deploy reaches every desktop user immediately without an app update \u2014 already true since launch, but the offline screen used to make you click \u201cTry again\u201d manually every time the network came back. The offline page now retries the hosted URL in the background every 8 seconds with a no-cors HEAD request, surfacing the attempt count under the retry button and auto-navigating the moment the connection comes back. The button still works for the impatient.",
          },
          {
            tag: "new",
            text:
              "Type \u201csnake\u201d while staring at the offline card and a tiny canvas Snake game takes over. Arrow keys to steer, R to restart, Esc to go back to the offline card. Score persists across game-overs in the same session. Pure vanilla JS / canvas inlined into the same data URL the offline page already lives in, so it works with zero network access. Background auto-retry keeps running while you play.",
          },
        ],
      },
    ],
  },
  {
    version: "0.2.28",
    date: "2026-05-28",
    tagline:
      "Floating panels move freely without sticky snaps, and a top-to-bottom components refactor that nobody should be able to see.",
    sections: [
      {
        heading: "Floating panels",
        items: [
          {
            tag: "fixed",
            text:
              "Dragging a panel no longer snaps the moment you release the mouse in the middle of the screen. The snap layouts (full / halves / thirds / quads) collectively tiled the entire viewport, so the drop-zone hit test in `findSnapZoneAtPointer` always matched something \u2014 you couldn\u2019t actually free-position a panel by drag. The hit test now requires the pointer to be within 24px of a viewport edge (Windows-11-style edge snap) before the snap preview lights up; anywhere in the middle of the screen the panel just drops where you released it.",
          },
          {
            tag: "new",
            text:
              "Hold \u21E7 Shift while dragging to force the old behavior \u2014 the snap preview fires from anywhere on the screen, useful for quickly hammering a layout. The snap layout button in the panel header still works the same way for explicit, deliberate snapping.",
          },
        ],
      },
      {
        heading: "Under the hood \u2014 components refactor",
        items: [
          {
            tag: "improved",
            text:
              "Reorganized the `components/` tree from one flat folder into eight feature folders \u2014 `ui/`, `shell/`, `canvas/`, `panels/`, `viewers/`, `editors/`, `auth/`, `marketing/` (plus `highlights/` for the shared highlight sidebar primitives). Moves were done with `git mv` so file history follows. No behavior change; the dev server, builds, and every panel look identical.",
          },
          {
            tag: "improved",
            text:
              "Pulled shared helpers and hooks out of components and into `lib/` so they have one home each: URL parsing (`lib/url.ts`), Electron probe (`lib/runtime.ts`), PDF geometry (`lib/pdf-geometry.ts`), citation-edge derivation (`lib/citation-edges.ts`), AI image attachment plumbing (`lib/ai-attachments.ts`), and five new hooks under `lib/hooks/` for pending-highlight jumps, outside-click dismiss, anchored popovers, list keyboard navigation, and debounced node-data writes. Each replaces 2\u20135 copy-pasted implementations scattered around the previous component files.",
          },
          {
            tag: "improved",
            text:
              "Built shared UI primitives for repeated patterns: `HighlightsListPanel`, `HighlightDetailPanel`, `CommentsThread` (replacing near-identical PDF/web/browser highlight UI), `NotesSidebar`, `SelectionColorToolbar` (used by both the PDF viewer and the in-app browser), `EmptyStateCard`, and `ToolbarButton` (the PDF-notes and page-editor toolbars used to literally have a comment saying \u201ckept in sync\u201d above their duplicated copies).",
          },
          {
            tag: "improved",
            text:
              "Decomposed the seven largest god-components into co-located folders. Canvas 707\u2192299, Panel 630\u2192321, AiAnswerPanelBody 1385\u2192550, LinkPanelBody 1078\u2192548, BrowserWindow 1013\u2192750, ThemeSettingsDialog 574\u2192313, SourcePicker 593\u2192409, PdfViewer 568\u2192431. Each one is now a thin orchestrator next to a folder of hooks and presentational subcomponents \u2014 the snap-drag state machine, AI composer, AI turn renderer, link panel viewer / editor / empty / error states, browser chrome, PDF document loader, theme preset/grid/accent cards, source picker rows.",
          },
          {
            tag: "improved",
            text:
              "TypeScript and ESLint pass with the exact same error/warning counts as before the refactor \u2014 zero regressions introduced. There are no automated tests for `components/`, so every change in this round is strictly behavior-preserving (rename, split, extract, dedupe). Future work to tighten React Flow `data` casts and clean up the pre-existing `react-hooks/set-state-in-effect` warnings is intentionally out of scope.",
          },
        ],
      },
    ],
  },
  {
    version: "0.2.27",
    date: "2026-05-26",
    tagline:
      "Desktop AI talks to private / VPN gateways again, and DevTools is back in packaged builds.",
    sections: [
      {
        heading: "AI conversations \u2014 desktop",
        items: [
          {
            tag: "fixed",
            text:
              "Conversation node 502\u2019d with `fetch failed` in the packaged app whenever the configured AI base URL was a corp / VPN / LAN host (e.g. `*.stingray-private.com`, `*.internal`, a localhost LLM, a `10.x` / `192.168.x` IP). Root cause: the desktop shell is a thin window over the hosted Vercel deployment, so `POST /api/ai` ran inside a Vercel function in `iad1` \u2014 which has no line of sight to your corp DNS / VPN and ENOTFOUND\u2019d on the upstream `fetch` to the provider. Local dev didn\u2019t show this because `next dev` is on your laptop and can resolve the host normally.",
          },
          {
            tag: "improved",
            text:
              "Desktop AI requests now leave your machine directly. The renderer assembles the OpenAI chat-completions payload locally (via a new isomorphic `lib/ai-request.ts` shared with the route), asks the Electron main process to make the actual provider call over a new `studygit:ai-fetch` IPC, and only then posts the raw answer back to `/api/ai` in a new `mode: \"process-only\"` branch to reuse the server\u2019s JSDOM + marked + sanitize-html citation pipeline. Net effect: corp / VPN / LAN endpoints work in the packaged app for the same reason your browser tab on the same machine can reach them \u2014 the request goes out through your own network, not Vercel\u2019s.",
          },
          {
            tag: "improved",
            text:
              "Your AI API key no longer round-trips through the hosted backend on the desktop. The renderer used to hand the key to `/api/ai` as a header on every turn; in the new path the key stays on the user\u2019s machine and is consumed by the main-process fetch directly. The IPC handler refuses to forward anything other than the strictly-shaped `{ baseUrl, apiKey, model, messages, temperature }` payload, caps the body at 24\u202fMB, and aborts on a 2-minute timeout so a hung provider can\u2019t keep a renderer indefinitely.",
          },
          {
            tag: "improved",
            text:
              "Web build now returns an actionable error when `/api/ai` can\u2019t reach the configured provider. Where before the failed turn just said `fetch failed`, it now reads `Couldn\u2019t reach AI provider \u2014 the server couldn\u2019t connect to <host>` with the underlying error code (`ENOTFOUND`, `ECONNREFUSED`, `EAI_AGAIN`, etc.) attached. Loopback / private-range / corp-suffix hosts get an extra hint pointing you at the desktop app, since that\u2019s the only build that can talk to them.",
          },
        ],
      },
      {
        heading: "Desktop \u2014 developer ergonomics",
        items: [
          {
            tag: "improved",
            text:
              "DevTools is reachable in packaged builds again \u2014 `\u2318+\u2325+I` on macOS, `Ctrl+Shift+I` on Windows / Linux, or `F12` anywhere. Stripping the native menu (we draw our own header) had also removed Electron\u2019s default DevTools accelerator, which made hosted-only bugs in the desktop app effectively un-inspectable. The handler watches `before-input-event` on physical key codes (`KeyI` / `F12`) rather than the produced character, so it works regardless of keyboard layout \u2014 holding Option on macOS remaps `i` to `\u02C6` and silently broke any naive key-string match.",
          },
        ],
      },
    ],
  },
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
