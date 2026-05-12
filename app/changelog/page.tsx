import Link from "next/link";
import {
  Bug,
  Gauge,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { SiteFooter, SiteNav } from "@/components/SiteChrome";
import {
  CHANGELOG,
  type ChangelogEntry,
  type ChangelogItem,
  type ChangelogSection,
} from "@/lib/changelog";
import { tryGetCurrentUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Changelog — Studygit",
  description: "Every release of Studygit and what shipped in it.",
};

const TAG_META: Record<
  NonNullable<ChangelogItem["tag"]>,
  { label: string; icon: LucideIcon }
> = {
  new: { label: "New", icon: Sparkles },
  improved: { label: "Improved", icon: Wrench },
  fixed: { label: "Fixed", icon: Bug },
  performance: { label: "Performance", icon: Gauge },
};

function formatDate(iso: string): string {
  // Render server-side from the explicit ISO date so it doesn't shift
  // between machines/timezones (a "version dated yesterday" bug is the
  // canonical changelog footgun).
  const [year, month, day] = iso.split("-").map((n) => Number(n));
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function ChangelogPage() {
  const user = await tryGetCurrentUser();
  const latest = CHANGELOG[0];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--pg-bg)] text-[var(--pg-fg)]">
      <SiteNav user={user} />
      <main className="flex-1">
        <ChangelogHero latest={latest} />
        <ChangelogEntries entries={CHANGELOG} />
      </main>
      <SiteFooter />
    </div>
  );
}

function ChangelogHero({ latest }: { latest: ChangelogEntry }) {
  return (
    <section className="border-b border-[var(--pg-border)]">
      <div className="max-w-3xl mx-auto px-4 pt-16 pb-10 sm:pt-20 sm:pb-12">
        <p className="pg-section-label">Changelog</p>
        <h1 className="mt-3 pg-serif text-[40px] sm:text-[52px] leading-[1.05] font-medium tracking-tight text-[var(--pg-fg)]">
          What&rsquo;s new in Studygit.
        </h1>
        <p className="mt-4 max-w-xl text-[14px] text-[var(--pg-fg-soft)]">
          Every release, top to bottom. The most recent build is{" "}
          <span className="font-mono text-[var(--pg-fg)]">
            v{latest.version}
          </span>{" "}
          ({formatDate(latest.date)}).
        </p>
        <div className="mt-6 inline-flex items-center gap-2 text-[12px] text-[var(--pg-muted)]">
          <Link
            href="/#download"
            className="inline-flex h-8 items-center rounded-[var(--pg-radius)] border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] px-3 text-[12.5px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
          >
            Download the desktop app
          </Link>
        </div>
      </div>
    </section>
  );
}

function ChangelogEntries({ entries }: { entries: ChangelogEntry[] }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <ol className="relative border-l border-[var(--pg-border)] pl-6 sm:pl-8">
        {entries.map((entry) => (
          <li key={entry.version} className="relative mb-16 last:mb-2">
            {/* Marker dot on the timeline. Sized to align with the
                version chip's baseline. */}
            <span
              aria-hidden
              className="absolute -left-[7px] top-2 h-2.5 w-2.5 rounded-full border border-[var(--pg-border-strong)] bg-[var(--pg-bg-elevated)]"
            />
            <EntryHeader entry={entry} />
            <div className="mt-4 space-y-6">
              {entry.sections.map((section, i) => (
                <EntrySectionBlock
                  key={`${entry.version}-${i}`}
                  section={section}
                />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EntryHeader({ entry }: { entry: ChangelogEntry }) {
  return (
    <header className="flex flex-wrap items-baseline gap-3">
      <span
        id={`v${entry.version}`}
        className="inline-flex items-center rounded-[var(--pg-radius)] border border-[var(--pg-border-strong)] bg-[var(--pg-bg-elevated)] px-2 py-0.5 font-mono text-[12px] text-[var(--pg-fg)]"
      >
        v{entry.version}
      </span>
      <time
        dateTime={entry.date}
        className="text-[12px] text-[var(--pg-muted)] tabular-nums"
      >
        {formatDate(entry.date)}
      </time>
      {entry.tagline ? (
        <span className="pg-serif text-[18px] font-medium text-[var(--pg-fg)]">
          {entry.tagline}
        </span>
      ) : null}
    </header>
  );
}

function EntrySectionBlock({ section }: { section: ChangelogSection }) {
  return (
    <section>
      {section.heading ? (
        <h3 className="pg-section-label mb-2">{section.heading}</h3>
      ) : null}
      <ul className="space-y-2.5">
        {section.items.map((item, i) => (
          <ChangelogBullet key={i} item={item} />
        ))}
      </ul>
    </section>
  );
}

function ChangelogBullet({ item }: { item: ChangelogItem }) {
  const tag = item.tag ? TAG_META[item.tag] : null;
  const Icon = tag?.icon ?? null;
  return (
    <li className="flex items-start gap-3 text-[14px] leading-relaxed text-[var(--pg-fg-soft)]">
      {tag ? (
        <span
          className="mt-0.5 inline-flex h-5 shrink-0 items-center gap-1 rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-1.5 text-[10.5px] uppercase tracking-wider text-[var(--pg-muted)]"
          aria-label={tag.label}
        >
          {Icon ? <Icon size={10} /> : null}
          {tag.label}
        </span>
      ) : (
        <span
          aria-hidden
          className="mt-2.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--pg-muted-soft)]"
        />
      )}
      <span className="text-[var(--pg-fg)]">{item.text}</span>
    </li>
  );
}
