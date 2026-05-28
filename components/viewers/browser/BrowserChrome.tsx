"use client";

// Modal browser chrome: title strip ("Browser · example.com · Page
// title", with the Save-as-link CTA + close), and the nav bar below
// (back / forward / reload / URL input + a loading status pill). The
// parent owns the navigation primitives (`onBack`, `onForward`,
// `onReload`, `onNavigate`) because those branch on Electron vs cloud
// runtimes; the chrome just stays presentational.

import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Globe,
  RefreshCw,
  X,
} from "lucide-react";

export type BrowserChromeProps = {
  hostLabel: string;
  pageTitle: string;
  inputUrl: string;
  setInputUrl: (next: string) => void;
  loading: boolean;
  navState: { canBack: boolean; canForward: boolean };
  /** Number of highlights captured in this session — shown as a pill on the CTA. */
  highlightCount: number;
  /** Disables Save-as-link until we have a real current URL. */
  canSaveAsLink: boolean;
  onSaveAsLink: () => void;
  onClose: () => void;
  onBack: () => void;
  onForward: () => void;
  /** Reload / Stop, depending on `loading`. */
  onReloadOrStop: () => void;
  onNavigate: (raw: string) => void;
};

export function BrowserChrome({
  hostLabel,
  pageTitle,
  inputUrl,
  setInputUrl,
  loading,
  navState,
  highlightCount,
  canSaveAsLink,
  onSaveAsLink,
  onClose,
  onBack,
  onForward,
  onReloadOrStop,
  onNavigate,
}: BrowserChromeProps) {
  return (
    <>
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2.5">
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--pg-fg-soft)]">
          <Globe size={13} className="text-[var(--pg-muted)]" />
          <span className="pg-section-label">Browser</span>
          {hostLabel ? (
            <>
              <span className="text-[var(--pg-muted-soft)]">·</span>
              <span className="truncate text-[12px] text-[var(--pg-fg)]">
                {pageTitle || hostLabel}
              </span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSaveAsLink}
            disabled={!canSaveAsLink}
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--pg-accent)] px-2.5 text-[12px] text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            title="Save the current page as a cite-able link node"
          >
            <BookmarkPlus size={12} />
            Save as link
            {highlightCount > 0 ? (
              <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white/25 px-1 text-[10px]">
                {highlightCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
            title="Close browser (Esc)"
          >
            <X size={13} />
          </button>
        </div>
      </header>

      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-[var(--pg-border)] px-2">
        <button
          type="button"
          onClick={onBack}
          disabled={!navState.canBack}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)] disabled:opacity-40"
          title="Back"
        >
          <ArrowLeft size={14} />
        </button>
        <button
          type="button"
          onClick={onForward}
          disabled={!navState.canForward}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)] disabled:opacity-40"
          title="Forward"
        >
          <ArrowRight size={14} />
        </button>
        <button
          type="button"
          onClick={onReloadOrStop}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          title={loading ? "Stop" : "Reload"}
        >
          {loading ? <X size={14} /> : <RefreshCw size={14} />}
        </button>
        <form
          className="flex flex-1 items-center"
          onSubmit={(event) => {
            event.preventDefault();
            onNavigate(inputUrl);
          }}
        >
          <input
            value={inputUrl}
            onChange={(event) => setInputUrl(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="Search or paste a URL"
            className="h-7 w-full rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-2.5 font-mono text-[12px] text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)] focus:border-[var(--pg-accent)] focus:bg-[var(--pg-bg)]"
          />
        </form>
        <span
          className={clsx(
            "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[10.5px]",
            loading
              ? "bg-[var(--pg-bg-subtle)] text-[var(--pg-muted)]"
              : "text-[var(--pg-muted-soft)]"
          )}
          title={loading ? "Loading…" : "Idle"}
        >
          {loading ? "loading…" : "idle"}
        </span>
      </div>
    </>
  );
}
