import Link from "next/link";
import {
  ArrowRight,
  FileText,
  Highlighter,
  Layers,
  Layout,
  Notebook,
  Sparkles,
  Workflow,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentUser } from "@/lib/server/auth";
import { getPersistenceMode } from "@/lib/persistence";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const user =
    getPersistenceMode() === "supabase" ? await getCurrentUser() : null;
  const primaryHref = user ? "/app" : "/signup";
  const primaryLabel = user ? "Open your canvas" : "Get started";

  return (
    <div className="min-h-screen flex flex-col bg-[var(--pg-bg)] text-[var(--pg-fg)]">
      <SiteNav user={user} />
      <main className="flex-1">
        <Hero primaryHref={primaryHref} primaryLabel={primaryLabel} />
        <Features />
        <HowItWorks />
        <Faq />
        <FinalCta primaryHref={primaryHref} primaryLabel={primaryLabel} />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteNav({ user }: { user: { email: string | null } | null }) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-[color-mix(in_srgb,var(--pg-bg)_88%,transparent)] border-b border-[var(--pg-border)]">
      <div className="max-w-6xl mx-auto h-12 px-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="pg-serif text-[18px] italic font-medium tracking-tight text-[var(--pg-fg)] group-hover:text-[var(--pg-accent)] transition-colors">
            personalGit
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <a
            href="#features"
            className="hidden sm:inline-flex h-7 items-center px-2.5 text-[12.5px] text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="hidden sm:inline-flex h-7 items-center px-2.5 text-[12.5px] text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
          >
            How it works
          </a>
          <a
            href="#faq"
            className="hidden sm:inline-flex h-7 items-center px-2.5 text-[12.5px] text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
          >
            FAQ
          </a>
          <ThemeToggle />
          {user ? (
            <Link
              href="/app"
              className="ml-1 h-7 inline-flex items-center px-3 rounded-[var(--pg-radius)] bg-[var(--pg-accent)] text-[12.5px] font-medium text-white hover:opacity-95"
            >
              Open canvas
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="h-7 inline-flex items-center px-2.5 text-[12.5px] text-[var(--pg-fg)] hover:text-[var(--pg-accent)]"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="ml-1 h-7 inline-flex items-center px-3 rounded-[var(--pg-radius)] bg-[var(--pg-accent)] text-[12.5px] font-medium text-white hover:opacity-95"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
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
    <section className="relative">
      <div className="max-w-6xl mx-auto px-4 pt-16 pb-14 sm:pt-24 sm:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-3 py-1 text-[11px] uppercase tracking-wider text-[var(--pg-muted)]">
              <Sparkles size={12} className="text-[var(--pg-accent)]" />
              A student second brain
            </div>
            <h1 className="mt-5 pg-serif text-[40px] sm:text-[56px] leading-[1.05] italic font-medium tracking-tight text-[var(--pg-fg)]">
              Your personal learning canvas.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] text-[var(--pg-fg-soft)]">
              Drop links, images, sticky notes, rich pages, documents, and PDFs
              you can highlight, annotate, and ask AI about — all on an
              infinite canvas, organized into independent workspaces.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={primaryHref}
                className="inline-flex h-10 items-center gap-2 px-4 rounded-[var(--pg-radius)] bg-[var(--pg-accent)] text-[14px] font-medium text-white hover:opacity-95 shadow-[var(--pg-shadow)]"
              >
                {primaryLabel}
                <ArrowRight size={14} />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-10 items-center px-4 rounded-[var(--pg-radius)] border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] text-[14px] font-medium text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
              >
                I have an account
              </Link>
            </div>
            <p className="mt-4 text-[12px] text-[var(--pg-muted)]">
              Free during early access. Email + Google sign-in.
            </p>
          </div>
          <div className="lg:col-span-5">
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
      <div className="absolute left-[8%] top-[12%] w-[44%] rotate-[-2deg] rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-3 shadow-[var(--pg-shadow)]">
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--pg-muted)] uppercase tracking-wider">
          <Notebook size={11} /> Page
        </div>
        <div className="mt-2 pg-serif italic text-[14px] text-[var(--pg-fg)] leading-snug">
          Transformers are sequence models that…
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 rounded bg-[var(--pg-border)]" />
          <div className="h-1.5 w-[80%] rounded bg-[var(--pg-border)]" />
          <div className="h-1.5 w-[55%] rounded bg-[var(--pg-border)]" />
        </div>
      </div>
      <div className="absolute right-[6%] top-[8%] w-[40%] rotate-[3deg] rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[#fff5b8] dark:bg-[#5a4a1f] p-3 shadow-[var(--pg-shadow)]">
        <div className="text-[10px] text-[var(--pg-fg-soft)] uppercase tracking-wider">
          Note
        </div>
        <div className="mt-1 text-[12px] text-[var(--pg-fg)] leading-snug">
          Re-read the attention section before exam.
        </div>
      </div>
      <div className="absolute left-[20%] bottom-[8%] w-[58%] rotate-[1deg] rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg)] p-3 shadow-[var(--pg-shadow)]">
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--pg-muted)] uppercase tracking-wider">
          <FileText size={11} /> PDF
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 rounded bg-[var(--pg-border)]" />
          <div className="h-1.5 w-[92%] rounded bg-[var(--pg-marker)]" />
          <div className="h-1.5 w-[70%] rounded bg-[var(--pg-border)]" />
          <div className="h-1.5 w-[40%] rounded bg-[var(--pg-border)]" />
        </div>
      </div>
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
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
          x1="32%"
          y1="38%"
          x2="58%"
          y2="62%"
          stroke="var(--pg-border-strong)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          markerEnd="url(#arrowhead)"
        />
      </svg>
    </div>
  );
}

function Features() {
  const items = [
    {
      icon: Layers,
      title: "Independent workspaces",
      body: "Keep classes, projects, and side quests in their own canvases. Switch with a click; nothing bleeds across.",
    },
    {
      icon: Workflow,
      title: "Infinite canvas",
      body: "Drag in links, images, notes, pages, documents, and PDFs. Connect them with edges to build a map.",
    },
    {
      icon: FileText,
      title: "PDFs with AI Q&A",
      body: "Upload a PDF, highlight any passage, and ask the assistant questions grounded in your selection.",
    },
    {
      icon: Notebook,
      title: "Notion-like pages",
      body: "Press / for the slash menu: headings, callouts, code with syntax highlighting, KaTeX math, Mermaid diagrams.",
    },
    {
      icon: Highlighter,
      title: "Highlights & comments",
      body: "Highlight any text in a document or PDF, then thread comments and revisit them later.",
    },
    {
      icon: Layout,
      title: "Floating multi-panel UX",
      body: "Open many panels side-by-side: read a PDF while writing a page. Drag, resize, maximize, stack.",
    },
  ];
  return (
    <section
      id="features"
      className="border-t border-[var(--pg-border)] bg-[var(--pg-bg-subtle)]"
    >
      <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-wider text-[var(--pg-muted)]">
            Features
          </p>
          <h2 className="mt-2 pg-serif text-[32px] sm:text-[40px] italic leading-tight tracking-tight text-[var(--pg-fg)]">
            Everything in one place. Yours.
          </h2>
          <p className="mt-3 text-[14px] text-[var(--pg-fg-soft)]">
            Built for the way real studying actually happens — messy, visual,
            and full of half-formed connections.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg)] p-5 hover:border-[var(--pg-border-strong)] transition-colors"
            >
              <div className="h-8 w-8 inline-flex items-center justify-center rounded-[var(--pg-radius)] bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]">
                <Icon size={16} />
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
      title: "Create a workspace",
      body: "One per class, project, or topic. Each workspace is its own infinite canvas with its own nodes and edges.",
    },
    {
      title: "Drop in your material",
      body: "Right-click the canvas to add a link, image, sticky note, page, document, or PDF. Connect related ideas with edges.",
    },
    {
      title: "Highlight, annotate, ask",
      body: "Open any node in a floating panel. Highlight text, thread comments, and ask AI questions grounded in your selection.",
    },
  ];
  return (
    <section id="how-it-works" className="border-t border-[var(--pg-border)]">
      <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-wider text-[var(--pg-muted)]">
            How it works
          </p>
          <h2 className="mt-2 pg-serif text-[32px] sm:text-[40px] italic leading-tight tracking-tight text-[var(--pg-fg)]">
            Three steps, then you're studying.
          </h2>
        </div>
        <ol className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] p-5"
            >
              <div className="pg-serif italic text-[28px] font-medium text-[var(--pg-accent)]">
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

function Faq() {
  const items = [
    {
      q: "Is my data private?",
      a: "Yes. Each account gets its own workspaces, nodes, and edges, isolated at the database level with row-level security. We never share your canvases with anyone else.",
    },
    {
      q: "What can I drop on the canvas?",
      a: "Links (with optional iframe embeds), images, sticky notes, rich Notion-like pages, plain documents you can highlight, and PDFs with highlights, comments, and AI Q&A.",
    },
    {
      q: "Do I need an account to try it?",
      a: "Yes — sign up with email and password, or continue with Google. Both are free during early access.",
    },
    {
      q: "How is my data stored?",
      a: "App state lives in Supabase Postgres. Uploaded PDFs are stored privately in S3 and served through short-lived signed URLs.",
    },
    {
      q: "Does it work in dark mode?",
      a: "Yes — toggle the sun/moon icon in the header. The whole app respects your system preference by default.",
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
        <h2 className="mt-2 pg-serif text-[32px] sm:text-[40px] italic leading-tight tracking-tight text-[var(--pg-fg)]">
          Questions, answered.
        </h2>
        <div className="mt-8 divide-y divide-[var(--pg-border)] rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg)]">
          {items.map(({ q, a }) => (
            <details key={q} className="group px-5 py-4 open:bg-[var(--pg-bg-elevated)] transition-colors">
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
        <h2 className="pg-serif text-[36px] sm:text-[48px] italic leading-[1.05] tracking-tight text-[var(--pg-fg)]">
          Start your canvas.
        </h2>
        <p className="mt-3 text-[14px] text-[var(--pg-fg-soft)] max-w-xl mx-auto">
          One workspace per topic. Pages, PDFs, highlights, AI. Open a tab,
          drop in your material, and let the connections come into focus.
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

function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[var(--pg-border)] bg-[var(--pg-bg-subtle)]">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[var(--pg-muted)]">
        <div className="flex items-center gap-2">
          <span className="pg-serif italic text-[14px] text-[var(--pg-fg-soft)]">
            personalGit
          </span>
          <span aria-hidden>·</span>
          <span>© {year}</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/login" className="hover:text-[var(--pg-fg)]">
            Log in
          </Link>
          <Link href="/signup" className="hover:text-[var(--pg-fg)]">
            Sign up
          </Link>
          <a
            href="#features"
            className="hover:text-[var(--pg-fg)]"
          >
            Features
          </a>
        </nav>
      </div>
    </footer>
  );
}
