"use client";

// Header strip shown above an extracted article: optional site name as
// a small uppercase label, then the headline + byline. Hidden entirely
// when none of the three are present so empty extractions don't push
// the reader content down.

export function ArticleHeader({
  title,
  byline,
  siteName,
}: {
  title: string | undefined;
  byline: string | null | undefined;
  siteName: string | null | undefined;
}) {
  if (!title && !byline && !siteName) return null;
  return (
    <div className="mx-auto w-full max-w-[720px] px-8 pt-8 pb-2">
      {siteName ? (
        <div className="mb-2 text-[11px] uppercase tracking-wider text-[var(--pg-muted)]">
          {siteName}
        </div>
      ) : null}
      {title ? (
        <h1 className="pg-serif text-[28px] font-medium leading-tight text-[var(--pg-fg)]">
          {title}
        </h1>
      ) : null}
      {byline ? (
        <p className="mt-1.5 text-[13px] text-[var(--pg-fg-soft)]">{byline}</p>
      ) : null}
    </div>
  );
}
