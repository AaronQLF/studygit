"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { LATEST_RELEASE } from "@/lib/changelog";

// Header version control. In the desktop app this shows the *installed*
// build (via window.studygit.appVersion) and doubles as a one-click
// "Check for updates" / "Restart to install" affordance — no sign-in
// required. In the web app it stays a changelog link showing the latest
// published release notes version.
export function AppVersionBadge() {
  const [installedVersion, setInstalledVersion] = useState<string | null>(
    null
  );
  const [status, setStatus] = useState<StudygitUpdateStatus>({ kind: "idle" });

  useEffect(() => {
    const bridge = window.studygit;
    if (!bridge) return;

    setInstalledVersion(bridge.appVersion);
    if (bridge.appVersion === "dev") {
      void bridge.getAppVersion().then((v) => {
        if (v) setInstalledVersion(v);
      });
    }
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

  if (!installedVersion) {
    return (
      <Link
        href="/changelog"
        target="_blank"
        rel="noopener noreferrer"
        title={`Release notes for v${LATEST_RELEASE.version}`}
        className="hidden md:inline-flex h-7 items-center rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-1.5 font-mono text-[10.5px] text-[var(--pg-muted)] hover:text-[var(--pg-fg)] hover:border-[var(--pg-border-strong)]"
      >
        v{LATEST_RELEASE.version}
      </Link>
    );
  }

  const label = installedVersion.startsWith("v")
    ? installedVersion
    : `v${installedVersion}`;
  const ready = status.kind === "ready";
  const busy =
    status.kind === "checking" ||
    status.kind === "downloading" ||
    status.kind === "available";

  const title = ready
    ? `Restart to install v${status.version}`
    : busy
      ? "Checking for updates…"
      : "Check for updates";

  const handleClick = () => {
    const bridge = window.studygit;
    if (!bridge) return;
    if (ready) {
      bridge.installUpdateAndRestart();
      return;
    }
    if (!busy) void bridge.checkForUpdates();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={title}
      className={clsx(
        "hidden md:inline-flex h-7 items-center gap-1 rounded-[var(--pg-radius)] border px-1.5 font-mono text-[10.5px] transition-colors disabled:cursor-default",
        ready
          ? "border-[var(--pg-accent)]/50 bg-[var(--pg-accent-soft)]/30 text-[var(--pg-fg)] hover:border-[var(--pg-accent)]"
          : "border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] text-[var(--pg-muted)] hover:text-[var(--pg-fg)] hover:border-[var(--pg-border-strong)]"
      )}
    >
      {busy ? <Loader2 size={10} className="animate-spin shrink-0" /> : null}
      <span>{label}</span>
      {ready ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--pg-accent)]"
          aria-hidden
        />
      ) : null}
    </button>
  );
}
