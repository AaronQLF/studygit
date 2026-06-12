import Link from "next/link";
import {
  Apple,
  ArrowRight,
  Brain,
  Download,
  FileText,
  GraduationCap,
  Info,
  Layers,
  type LucideIcon,
  Monitor,
  Notebook,
  Search,
  Sparkles,
  Workflow,
} from "lucide-react";
import { SiteFooter, SiteNav } from "@/components/marketing/SiteChrome";
import { tryGetCurrentUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const user = await tryGetCurrentUser();
  const primaryHref = user ? "/app" : "/signup";
  const primaryLabel = user ? "Open your canvas" : "Get started — free";

  return (
    <div className="min-h-screen flex flex-col bg-[var(--pg-bg)] text-[var(--pg-fg)]">
      <SiteNav user={user} />
      <main className="flex-1">
        <Hero primaryHref={primaryHref} primaryLabel={primaryLabel} />
        <LoopStrip />
        <Features />
        <HowItWorks />
        <DownloadSection />
        <Faq />
        <FinalCta primaryHref={primaryHref} primaryLabel={primaryLabel} />
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero({
  primaryHref,
  primaryLabel,
}: {
  primaryHref: string;
  primaryLabel: string;
}) {
  return (
    <section className="relative overflow-hidden">
      {/* Soft accent wash behind the hero so the fold has depth without a
          heavy hero image. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          background:
            "radial-gradient(60% 50% at 75% 0%, var(--pg-accent-soft), transparent 70%)",
        }}
      />
      <div className="relative max-w-6xl mx-auto px-4 pt-16 pb-14 sm:pt-24 sm:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="pg-anim-rise lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-1 text-[11px] uppercase tracking-wider text-[var(--pg-muted)]">
              <Sparkles size={12} className="text-[var(--pg-accent)]" />
              Read · Understand · Remember
            </div>
            <h1 className="mt-5 pg-serif text-[40px] sm:text-[56px] leading-[1.05] font-medium tracking-tight text-[var(--pg-fg)]">
              Capture everything.
              <br />
              Remember it for the exam.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--pg-fg-soft)]">
              An infinite canvas for your readings, notes, and PDFs — with AI
              that turns them into flashcards, quizzes you on what you wrote,
              and schedules every review so it actually sticks.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={primaryHref}
                className="inline-flex h-10 items-center gap-2 px-4 rounded-[var(--pg-radius)] bg-[var(--pg-accent)] text-[14px] font-medium text-white hover:opacity-95 shadow-[var(--pg-shadow)]"
              >
                {primaryLabel}
                <ArrowRight size={14} />
              </Link>
              <a
                href="#download"
                className="inline-flex h-10 items-center gap-2 px-4 rounded-[var(--pg-radius)] border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] text-[14px] font-medium text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
              >
                <Download size={14} />
                Download desktop app
              </a>
            </div>
            <p className="mt-4 text-[12px] text-[var(--pg-muted)]">
              Free during early access. Web, macOS, and Windows — synced across
              every device.
            </p>
          </div>
          <div className="pg-anim-pop lg:col-span-5">
            <HeroIllustration />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroIllustration() {
  return (
    <div className="relative aspect-[4/3] w-full rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg-canvas)] overflow-hidden shadow-[var(--pg-shadow-lg)]">
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--pg-border-strong) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      {/* Source: a PDF with a highlight */}
      <div className="absolute left-[7%] top-[10%] w-[42%] rotate-[-2deg] rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg)] p-3 shadow-[var(--pg-shadow)]">
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--pg-muted)] uppercase tracking-wider">
          <FileText size={11} /> PDF
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 rounded bg-[var(--pg-border)]" />
          <div className="h-1.5 w-[92%] rounded bg-[var(--pg-marker)]" />
          <div className="h-1.5 w-[68%] rounded bg-[var(--pg-border)]" />
        </div>
      </div>
      {/* A page of notes */}
      <div className="absolute right-[5%] top-[7%] w-[40%] rotate-[3deg] rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-3 shadow-[var(--pg-shadow)]">
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--pg-muted)] uppercase tracking-wider">
          <Notebook size={11} /> Page
        </div>
        <div className="mt-2 pg-serif text-[13px] text-[var(--pg-fg)] leading-snug">
          Attention weights every token…
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 rounded bg-[var(--pg-border)]" />
          <div className="h-1.5 w-[60%] rounded bg-[var(--pg-border)]" />
        </div>
      </div>
      {/* The payoff: a flashcard with a "due today" chip */}
      <div className="absolute left-[24%] bottom-[7%] w-[56%] rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg)] p-3 shadow-[var(--pg-shadow)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--pg-muted)] uppercase tracking-wider">
            <Layers size={11} /> Flashcards
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
            style={{
              backgroundColor: "var(--pg-study-soft)",
              color: "var(--pg-study)",
            }}
          >
            <GraduationCap size={9} /> 3 due
          </span>
        </div>
        <div className="mt-2 pg-serif text-[13px] text-[var(--pg-fg)] leading-snug">
          What does an attention head compute?
        </div>
        <div className="mt-2 flex gap-1">
          <span className="h-4 flex-1 rounded-[3px] border border-emerald-500/40 bg-emerald-500/10" />
          <span className="h-4 flex-1 rounded-[3px] border border-[var(--pg-border)]" />
          <span className="h-4 flex-1 rounded-[3px] border border-[var(--pg-border)]" />
        </div>
      </div>
      <svg aria-hidden className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <marker
            id="arrowhead"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6 z" fill="var(--pg-border-strong)" />
          </marker>
        </defs>
        <line
          x1="30%"
          y1="34%"
          x2="52%"
          y2="64%"
          stroke="var(--pg-border-strong)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          markerEnd="url(#arrowhead)"
        />
      </svg>
    </div>
  );
}

// A compact band restating the core promise as three verbs — the loop no
// other study tool closes end to end.
function LoopStrip() {
  const steps: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: Workflow,
      title: "Capture",
      body: "PDFs, articles, notes, and pages on one infinite canvas.",
    },
    {
      icon: Sparkles,
      title: "Understand",
      body: "Highlight anything and ask AI, grounded in your own sources.",
    },
    {
      icon: Brain,
      title: "Remember",
      body: "Turn it into flashcards, get quizzed, and review what's due.",
    },
  ];
  return (
    <section className="border-t border-[var(--pg-border)] bg-[var(--pg-bg-subtle)]">
      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {steps.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--pg-radius)] bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]">
              <Icon size={16} />
            </span>
            <div>
              <div className="text-[13.5px] font-medium text-[var(--pg-fg)]">
                {title}
              </div>
              <div className="text-[12.5px] leading-snug text-[var(--pg-fg-soft)]">
                {body}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const items: { icon: LucideIcon; title: string; body: string; badge?: string }[] =
    [
      {
        icon: Layers,
        title: "Spaced-repetition flashcards",
        body: "Generate cards with AI from any source — a PDF, a highlight, a page — or write them by hand. An FSRS scheduler (the algorithm Anki uses) shows each card exactly when you're about to forget it.",
        badge: "Smart scheduling",
      },
      {
        icon: GraduationCap,
        title: "Quiz Me — active recall",
        body: "Answer from memory by typing or voice. The AI judges it against your card, explains what you missed, and the verdict feeds straight into your review schedule.",
        badge: "AI-graded",
      },
      {
        icon: FileText,
        title: "PDFs with AI Q&A",
        body: "Upload a PDF, search inside it, highlight any passage, and ask questions grounded in your selection. Cloze and image-occlusion cards for diagrams, too.",
      },
      {
        icon: Notebook,
        title: "Notion-grade pages",
        body: "Press / for the slash menu — headings, callouts, tables, code, KaTeX math, Mermaid diagrams. Select text for inline AI rewrites and one-click flashcards.",
      },
      {
        icon: Search,
        title: "Search & daily review",
        body: "Find anything you've ever written across every workspace from ⌘K, and clear your due cards from all decks in one Study session that keeps a daily streak.",
      },
      {
        icon: Workflow,
        title: "Infinite canvas, your way",
        body: "Independent workspaces per class or project. Drag in links, images, notes, pages, PDFs, and shapes; connect ideas with edges; read and write side by side in floating panels.",
      },
    ];
  return (
    <section
      id="features"
      className="border-t border-[var(--pg-border)]"
    >
      <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-wider text-[var(--pg-muted)]">
            Features
          </p>
          <h2 className="mt-2 pg-serif text-[32px] sm:text-[40px] leading-tight tracking-tight text-[var(--pg-fg)]">
            Everything from reading to remembering.
          </h2>
          <p className="mt-3 text-[14px] text-[var(--pg-fg-soft)]">
            Most tools help you collect notes. Studygit closes the loop —
            collect, understand, and actually retain — in one place.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(({ icon: Icon, title, body, badge }) => (
            <div
              key={title}
              className="rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg)] p-5 hover:border-[var(--pg-border-strong)] hover:shadow-[var(--pg-shadow)] transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="h-8 w-8 inline-flex items-center justify-center rounded-[var(--pg-radius)] bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]">
                  <Icon size={16} />
                </div>
                {badge ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-wider"
                    style={{
                      backgroundColor: "var(--pg-study-soft)",
                      color: "var(--pg-study)",
                    }}
                  >
                    {badge}
                  </span>
                ) : null}
              </div>
              <h3 className="mt-3 text-[15px] font-medium text-[var(--pg-fg)]">
                {title}
              </h3>
              <p className="mt-1.5 text-[13px] text-[var(--pg-fg-soft)] leading-relaxed">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: "Capture your material",
      body: "Start from a template or a blank canvas. Drop in PDFs, articles, sticky notes, and rich pages — one workspace per class or project — and connect related ideas with edges.",
    },
    {
      title: "Understand it with AI",
      body: "Open any source in a floating panel. Highlight a passage, thread comments, and ask the assistant questions answered only from what you've collected — with citations back to the source.",
    },
    {
      title: "Remember it for good",
      body: "Turn a selection into flashcards in a click, let AI quiz you on them, and come back each day to the cards a spaced-repetition scheduler says are due. Your streak keeps you honest.",
    },
  ];
  return (
    <section id="how-it-works" className="border-t border-[var(--pg-border)] bg-[var(--pg-bg-subtle)]">
      <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-wider text-[var(--pg-muted)]">
            How it works
          </p>
          <h2 className="mt-2 pg-serif text-[32px] sm:text-[40px] leading-tight tracking-tight text-[var(--pg-fg)]">
            Three steps, then it sticks.
          </h2>
        </div>
        <ol className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg)] p-5"
            >
              <div className="pg-serif text-[28px] font-medium text-[var(--pg-accent)] tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </div>
              <h3 className="mt-2 text-[15px] font-medium text-[var(--pg-fg)]">
                {step.title}
              </h3>
              <p className="mt-1.5 text-[13px] text-[var(--pg-fg-soft)] leading-relaxed">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function DownloadSection() {
  // Three native builds, fronted by `/api/download/<platform>` so the URL
  // stays stable as we ship new releases (the route resolves the latest
  // GitHub Release asset at request time).
  const builds = [
    {
      id: "mac-arm64",
      icon: Apple,
      label: "Download for macOS",
      sub: "Apple Silicon · .dmg",
      href: "/api/download/mac-arm64",
    },
    {
      id: "mac-x64",
      icon: Apple,
      label: "Download for macOS",
      sub: "Intel · .dmg",
      href: "/api/download/mac-x64",
    },
    {
      id: "win",
      icon: Monitor,
      label: "Download for Windows",
      sub: "64-bit · installer",
      href: "/api/download/win",
    },
  ];
  return (
    <section id="download" className="border-t border-[var(--pg-border)]">
      <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-wider text-[var(--pg-muted)]">
            Download
          </p>
          <h2 className="mt-2 pg-serif text-[32px] sm:text-[40px] leading-tight tracking-tight text-[var(--pg-fg)]">
            The same Studygit, in a native window.
          </h2>
          <p className="mt-3 text-[14px] text-[var(--pg-fg-soft)]">
            The desktop app signs into your account and stays in sync with the
            web and every other device — the same workspaces, decks, and PDFs,
            in a dedicated window with a few native touches.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {builds.map(({ id, icon: Icon, label, sub, href }) => (
            <a
              key={id}
              href={href}
              className="group flex items-center gap-3 rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg)] p-4 hover:border-[var(--pg-border-strong)] hover:bg-[var(--pg-bg-elevated)] transition-colors"
            >
              <div className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-[var(--pg-radius)] bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]">
                <Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-[var(--pg-fg)] truncate">
                  {label}
                </div>
                <div className="text-[11.5px] text-[var(--pg-muted)] truncate">
                  {sub}
                </div>
              </div>
              <Download
                size={14}
                className="text-[var(--pg-muted)] group-hover:text-[var(--pg-accent)] transition-colors"
              />
            </a>
          ))}
        </div>

        <div className="mt-6 flex items-start gap-2.5 rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-4">
          <Info size={14} className="mt-0.5 shrink-0 text-[var(--pg-accent)]" />
          <div className="text-[12.5px] leading-relaxed text-[var(--pg-fg-soft)]">
            <span className="font-medium text-[var(--pg-fg)]">
              Always up to date.
            </span>{" "}
            The desktop app loads the latest Studygit straight from the cloud,
            so every improvement reaches you the moment it ships — no reinstall.
            Auto-update keeps the native shell current in the background.
          </div>
        </div>

        <details className="group mt-3 rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg)] open:bg-[var(--pg-bg-elevated)] transition-colors">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[12.5px] font-medium text-[var(--pg-fg)]">
            On macOS, the app says &ldquo;Studygit is damaged&rdquo; — what do I
            do?
            <span className="text-[var(--pg-muted)] group-open:rotate-45 transition-transform text-[18px] leading-none">
              +
            </span>
          </summary>
          <div className="px-4 pb-4 text-[12.5px] leading-relaxed text-[var(--pg-fg-soft)]">
            <p>
              Early-access builds aren&rsquo;t notarized by Apple yet, so
              Gatekeeper quarantines the .app on first launch. After dragging
              Studygit into <code>/Applications</code>, run this once in
              Terminal to clear the quarantine flag:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-2 text-[12px] text-[var(--pg-fg)]">
              <code>xattr -dr com.apple.quarantine /Applications/Studygit.app</code>
            </pre>
            <p className="mt-2">
              Windows installs work out of the box; SmartScreen may show a
              &ldquo;Don&rsquo;t run&rdquo; warning the first time — click
              <em> More info → Run anyway</em>.
            </p>
          </div>
        </details>

        <p className="mt-4 text-[11.5px] text-[var(--pg-muted)]">
          Builds are published to GitHub Releases. Linux build available on
          request. Prefer the browser? Just{" "}
          <Link
            href="/signup"
            className="underline underline-offset-2 hover:text-[var(--pg-fg)]"
          >
            sign up
          </Link>{" "}
          and use the web app.
        </p>
      </div>
    </section>
  );
}

function Faq() {
  const items = [
    {
      q: "What makes this different from a notes app?",
      a: "Notes apps help you write things down. Studygit closes the loop to remembering: it turns your sources into flashcards, quizzes you with AI that grades your answer, and uses a spaced-repetition scheduler (FSRS — the same family Anki uses) to bring each card back right before you'd forget it.",
    },
    {
      q: "Does my work sync across devices?",
      a: "Yes. Your account's workspaces, pages, decks, and PDFs are stored in the cloud and sync across the web app and every desktop install automatically — your Mac, your Windows PC, and your browser all share the same data, with conflict-safe saves so two open tabs never overwrite each other.",
    },
    {
      q: "Is my data private?",
      a: "Yes. Each account is isolated at the database level with row-level security, and uploaded files are owner-checked so no one else can reach them. We never share your canvases with anyone.",
    },
    {
      q: "Which AI does it use — and do I need a key?",
      a: "You bring your own provider. Point Studygit at any OpenAI-compatible endpoint (OpenAI, a local model, your school's gateway) in the AI settings; your key is stored on your device and used only to make your requests.",
    },
    {
      q: "Do I need an account to try it?",
      a: "Yes — sign up with email and password, or continue with Google. Both are free during early access.",
    },
    {
      q: "Does it work in dark mode?",
      a: "Yes — toggle the sun/moon icon in the header, and pick from a range of themes. The whole app respects your system preference by default.",
    },
  ];
  return (
    <section
      id="faq"
      className="border-t border-[var(--pg-border)] bg-[var(--pg-bg-subtle)]"
    >
      <div className="max-w-3xl mx-auto px-4 py-16 sm:py-20">
        <p className="text-[11px] uppercase tracking-wider text-[var(--pg-muted)]">
          FAQ
        </p>
        <h2 className="mt-2 pg-serif text-[32px] sm:text-[40px] leading-tight tracking-tight text-[var(--pg-fg)]">
          Questions, answered.
        </h2>
        <div className="mt-8 divide-y divide-[var(--pg-border)] rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg)]">
          {items.map(({ q, a }) => (
            <details
              key={q}
              className="group px-5 py-4 open:bg-[var(--pg-bg-elevated)] transition-colors"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-medium text-[var(--pg-fg)]">
                {q}
                <span className="text-[var(--pg-muted)] group-open:rotate-45 transition-transform text-[18px] leading-none">
                  +
                </span>
              </summary>
              <p className="mt-2 text-[13px] text-[var(--pg-fg-soft)] leading-relaxed">
                {a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({
  primaryHref,
  primaryLabel,
}: {
  primaryHref: string;
  primaryLabel: string;
}) {
  return (
    <section className="border-t border-[var(--pg-border)]">
      <div className="max-w-3xl mx-auto px-4 py-20 sm:py-24 text-center">
        <h2 className="pg-serif text-[36px] sm:text-[48px] leading-[1.05] tracking-tight text-[var(--pg-fg)]">
          Study less. Remember more.
        </h2>
        <p className="mt-3 text-[14px] text-[var(--pg-fg-soft)] max-w-xl mx-auto">
          Capture your material, understand it with AI, and let spaced
          repetition do the remembering. Open a tab and start your canvas.
        </p>
        <div className="mt-7 inline-flex">
          <Link
            href={primaryHref}
            className="inline-flex h-11 items-center gap-2 px-5 rounded-[var(--pg-radius)] bg-[var(--pg-accent)] text-[14px] font-medium text-white hover:opacity-95 shadow-[var(--pg-shadow)]"
          >
            {primaryLabel}
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
