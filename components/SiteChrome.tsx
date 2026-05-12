// Shared marketing-site chrome (nav + footer). The landing page and the
// changelog (and any future static page) reuse this so a link added in
// one place shows up everywhere.
//
// Anchor links use `/#section` form rather than bare `#section` so they
// keep working when the user is reading the changelog or another page.

import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function SiteNav({
  user,
}: {
  user: { email: string | null } | null;
}) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-[color-mix(in_srgb,var(--pg-bg)_88%,transparent)] border-b border-[var(--pg-border)]">
      <div className="max-w-6xl mx-auto h-12 px-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="pg-serif text-[18px] font-medium tracking-tight text-[var(--pg-fg)] group-hover:text-[var(--pg-accent)] transition-colors">
            Studygit
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="/#features"
            className="hidden sm:inline-flex h-7 items-center px-2.5 text-[12.5px] text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
          >
            Features
          </Link>
          <Link
            href="/#how-it-works"
            className="hidden sm:inline-flex h-7 items-center px-2.5 text-[12.5px] text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
          >
            How it works
          </Link>
          <Link
            href="/#download"
            className="hidden sm:inline-flex h-7 items-center px-2.5 text-[12.5px] text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
          >
            Download
          </Link>
          <Link
            href="/changelog"
            className="hidden sm:inline-flex h-7 items-center px-2.5 text-[12.5px] text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
          >
            Changelog
          </Link>
          <Link
            href="/#faq"
            className="hidden sm:inline-flex h-7 items-center px-2.5 text-[12.5px] text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
          >
            FAQ
          </Link>
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

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[var(--pg-border)] bg-[var(--pg-bg-subtle)]">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[var(--pg-muted)]">
        <div className="flex items-center gap-2">
          <span className="pg-serif text-[14px] text-[var(--pg-fg-soft)]">
            Studygit
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
          <Link href="/#features" className="hover:text-[var(--pg-fg)]">
            Features
          </Link>
          <Link href="/#download" className="hover:text-[var(--pg-fg)]">
            Download
          </Link>
          <Link href="/changelog" className="hover:text-[var(--pg-fg)]">
            Changelog
          </Link>
        </nav>
      </div>
    </footer>
  );
}
