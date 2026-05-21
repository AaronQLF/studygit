"use client";

import { useEffect, useState } from "react";
import { ArrowUpCircle, Loader2, X } from "lucide-react";

// Surfaces the auto-updater's "ready" status to the user as an explicit
// "Restart to update" prompt.
//
// Why this exists: on macOS, electron-updater's `autoInstallOnAppQuit`
// flag does NOT actually install on quit (MacUpdater extends AppUpdater
// instead of BaseUpdater and never registers a before-quit handler — the
// flag only gates whether Squirrel.Mac is auto-notified post-download).
// The only path that applies a staged update is an explicit
// `quitAndInstall()` call. Without this banner the staged update would
// sit on disk indefinitely and users would never roll forward.
//
// We also call `getUpdateStatus()` on mount because the auto-check runs
// 10s after the main process boots and again every 6h — those events
// will routinely fire before any React tree mounts (or fire in a previous
// renderer lifetime that got destroyed by HMR / navigation), so a
// listener-only design would miss them.
export function UpdateBanner() {
  const [status, setStatus] = useState<StudygitUpdateStatus>({ kind: "idle" });
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    const bridge = window.studygit;
    if (!bridge) return;

    let cancelled = false;
    bridge.getUpdateStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });

    const unsubscribe = bridge.onUpdateStatus((s) => setStatus(s));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (status.kind !== "ready") return null;
  if (dismissedVersion === status.version) return null;

  const handleRestart = () => {
    window.studygit?.installUpdateAndRestart();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="shrink-0 flex items-center justify-between gap-3 border-b border-[var(--pg-border)] bg-[var(--pg-accent-soft)] px-3 py-1.5 text-[12px] [-webkit-app-region:no-drag]"
    >
      <div className="flex items-center gap-2 min-w-0 text-[var(--pg-fg)]">
        <ArrowUpCircle size={14} className="shrink-0 text-[var(--pg-accent)]" />
        <span className="truncate">
          Studygit{" "}
          <span className="font-mono text-[var(--pg-fg-soft)]">
            v{status.version}
          </span>{" "}
          is ready to install.
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={handleRestart}
          className="inline-flex h-6 items-center rounded-md bg-[var(--pg-accent)] px-2 text-[11px] font-medium text-white hover:opacity-90"
        >
          Restart to update
        </button>
        <button
          type="button"
          onClick={() => setDismissedVersion(status.version)}
          title="Dismiss until next launch"
          aria-label="Dismiss"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

// Smaller inline indicator used inside the UserMenu so the user can
// trigger a manual check + see the result without leaving the menu.
// Kept in the same file because it's a tightly coupled sibling of the
// banner above (same status union, same bridge null-check).
export function UpdateMenuItem() {
  const [status, setStatus] = useState<StudygitUpdateStatus>({ kind: "idle" });
  const [hasBridge, setHasBridge] = useState(false);

  useEffect(() => {
    const bridge = window.studygit;
    if (!bridge) return;

    // `setHasBridge` is funneled through these callbacks (rather than
    // called synchronously in the effect body) to satisfy the
    // `react-hooks/set-state-in-effect` rule. Both the resolved
    // `getUpdateStatus()` promise and the live `onUpdateStatus` stream
    // are guaranteed to fire at least once when the bridge is present,
    // so the menu item will appear without a perceptible delay.
    bridge.getUpdateStatus().then((s) => {
      setHasBridge(true);
      setStatus(s);
    });
    return bridge.onUpdateStatus((s) => {
      setHasBridge(true);
      setStatus(s);
    });
  }, []);

  if (!hasBridge) return null;

  const isBusy = status.kind === "checking" || status.kind === "downloading";

  const label = (() => {
    switch (status.kind) {
      case "checking":
        return "Checking for updates…";
      case "downloading":
        return `Downloading… ${Math.round(status.percent)}%`;
      case "available":
        return `Downloading v${status.version}…`;
      case "ready":
        return `Restart to install v${status.version}`;
      case "not-available":
        return "Studygit is up to date";
      case "error":
        return "Update check failed";
      case "idle":
      default:
        return "Check for updates…";
    }
  })();

  const handleClick = () => {
    if (status.kind === "ready") {
      window.studygit?.installUpdateAndRestart();
      return;
    }
    if (isBusy) return;
    void window.studygit?.checkForUpdates();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isBusy}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)] rounded-[var(--pg-radius)] disabled:opacity-60 disabled:cursor-default"
    >
      {isBusy ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <ArrowUpCircle size={12} />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}
