"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Globe,
  Loader2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from "lucide-react";
// CSS only needed inside the app: KaTeX renders math in TipTap nodes and
// in the web-article reader, tippy.js styles the slash/citation menus.
// Importing here (instead of in app/layout.tsx) keeps these off the
// landing/marketing routes.
import "katex/dist/katex.min.css";
import "tippy.js/dist/tippy.css";
import { useStore } from "@/lib/store";
import { useBrowserSession } from "@/lib/browser-session";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { PanelManager } from "@/components/panels/PanelManager";
import { CommandPalette } from "./CommandPalette";
import { ToastViewport } from "@/components/ui/Toast";
import { TimeTracker } from "./TimeTracker";
import { UserMenu } from "./UserMenu";
import { UpdateBanner } from "./UpdateBanner";
import { AppVersionBadge } from "./AppVersionBadge";
import { BrowserWindow } from "@/components/viewers/BrowserWindow";
import { StudyBuddyDock } from "@/components/buddy/StudyBuddyDock";
import { StudyTodayButton } from "@/components/study/StudyTodayButton";
import {
  THEME_DIALOG_EVENT,
  ThemeSettingsDialog,
} from "./ThemeSettingsDialog";
import {
  AI_SETTINGS_DIALOG_EVENT,
  AiSettingsDialog,
} from "./AiSettingsDialog";

type AppShellProps = {
  user?: { id: string; email: string | null } | null;
};

const Canvas = dynamic(() => import("@/components/canvas/Canvas").then((m) => m.Canvas), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-[var(--pg-muted)] text-sm">
      Loading canvas…
    </div>
  ),
});

export function AppShell({ user }: AppShellProps = {}) {
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s.hydrated);
  const hydrateFailed = useStore((s) => s.hydrateFailed);
  const saveError = useStore((s) => s.error);
  const retrySave = useStore((s) => s.retrySave);
  const isDirty = useStore((s) => s.isDirty);
  const justSaved = useStore((s) => s.justSaved);
  const workspaces = useStore((s) => s.workspaces);
  const selectedWorkspaceId = useStore((s) => s.selectedWorkspaceId);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const openPanel = useStore((s) => s.openPanel);
  const buddyOpen = useStore((s) => s.studyBuddy.open);
  const toggleBuddy = useStore((s) => s.toggleStudyBuddy);
  const openBrowser = useBrowserSession((s) => s.openBrowser);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  // When running inside the Electron shell on macOS, reserve room at the
  // top-left for the hover-revealed window controls (see electron/main.ts:
  // titleBarStyle = "customButtonsOnHover"). Outside Electron (regular
  // browser dev) this stays at zero so the layout doesn't shift.
  const [macTitlebarPad, setMacTitlebarPad] = useState(0);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // The UserMenu (and any future surface) opens the dialog by
  // dispatching a window event. Keeping it event-driven avoids prop
  // drilling through the menu and the sign-out form.
  useEffect(() => {
    const onOpen = () => setThemeDialogOpen(true);
    window.addEventListener(THEME_DIALOG_EVENT, onOpen);
    return () => window.removeEventListener(THEME_DIALOG_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onOpen = () => setAiSettingsOpen(true);
    window.addEventListener(AI_SETTINGS_DIALOG_EVENT, onOpen);
    return () => window.removeEventListener(AI_SETTINGS_DIALOG_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (window.studygit?.platform === "darwin") {
      // Defer to a microtask so we don't run a setState synchronously
      // during the effect's render phase.
      queueMicrotask(() => setMacTitlebarPad(72));
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      // Cmd/Ctrl+J — toggle the Study Buddy dock. Works while typing
      // because the user often wants to summon the buddy mid-edit
      // without first having to break focus out of a TipTap surface.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        toggleBuddy();
        return;
      }
      if (isTyping) return;
      if (event.key === "[") {
        event.preventDefault();
        toggleSidebar();
      } else if (event.key === "Escape") {
        if (paletteOpen) {
          setPaletteOpen(false);
        }
      } else if (event.key === "Enter" && selectedNodeId) {
        openPanel(selectedNodeId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openPanel, paletteOpen, selectedNodeId, toggleBuddy, toggleSidebar]);

  const currentWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWorkspaceId),
    [workspaces, selectedWorkspaceId]
  );

  if (!hydrated) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--pg-muted)]">
        <Loader2 size={16} className="animate-spin mr-2" /> Loading…
      </div>
    );
  }

  // Initial load failed: refuse to render an editable canvas. The store
  // is still sitting on the default welcome state, and any edit made on
  // top of it would try to persist that over the user's real data.
  if (hydrateFailed) {
    return (
      <div className="flex-1 flex h-screen flex-col items-center justify-center gap-3 bg-[var(--pg-bg)] px-6 text-center">
        <div className="pg-serif text-[20px] font-semibold text-[var(--pg-fg)]">
          Couldn&apos;t load your workspace
        </div>
        <div className="max-w-sm text-[13px] text-[var(--pg-muted)]">
          {saveError ?? "The server couldn't be reached."} Your data is safe —
          nothing loads or saves until the connection is back.
        </div>
        <button
          onClick={() => hydrate()}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--pg-border-strong)] px-3.5 py-1.5 text-[13px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
        >
          Try again
        </button>
      </div>
    );
  }

  const saveStatus = isDirty
    ? "saving..."
    : justSaved
    ? "saved"
    : "all clear";

  return (
    <div className="relative flex flex-col flex-1 h-screen bg-[var(--pg-bg)] text-[var(--pg-fg)]">
      <UpdateBanner />
      <header
        className="h-10 shrink-0 border-b border-[var(--pg-border)] bg-[var(--pg-bg)] [-webkit-app-region:drag]"
        style={{ paddingLeft: macTitlebarPad }}
      >
        <div className="h-full px-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0 [-webkit-app-region:no-drag]">
            <button
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? "Expand sidebar ([)" : "Collapse sidebar ([)"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={15} />
              ) : (
                <PanelLeftClose size={15} />
              )}
            </button>
            <div className="flex items-center gap-2 pl-1 min-w-0">
              <span className="pg-serif text-[17px] font-medium tracking-tight text-[var(--pg-fg)]">
                Studygit
              </span>
              {currentWorkspace ? (
                <>
                  <span className="text-[var(--pg-muted-soft)]">·</span>
                  <span className="truncate text-[12px] text-[var(--pg-fg-soft)]">
                    {currentWorkspace.name}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
            <AppVersionBadge />
            {saveError ? (
              <button
                onClick={retrySave}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-red-500/10 px-2 text-[11px] font-medium text-red-500 hover:bg-red-500/20"
                title={`${saveError} Click to retry now.`}
              >
                save failed — retry
              </button>
            ) : (
              <span className="pg-section-label inline-flex h-7 items-center px-2">
                {saveStatus}
              </span>
            )}
            <StudyTodayButton />
            <button
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              onClick={() => openBrowser()}
              title="Open in-app browser — highlight as you read, save the page as a cite-able link"
            >
              <Globe size={13} />
              <span className="hidden font-medium tracking-tight sm:inline">
                Browse
              </span>
            </button>
            <button
              className={
                buddyOpen
                  ? "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium tracking-tight bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]"
                  : "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              }
              onClick={() => toggleBuddy()}
              title="Toggle Study Buddy (⌘J / Ctrl+J)"
              aria-pressed={buddyOpen}
            >
              <Sparkles size={13} />
              <span className="hidden font-medium tracking-tight sm:inline">
                Buddy
              </span>
            </button>
            <button
              className="inline-flex h-7 items-center rounded-md px-2 text-[11px] font-medium tracking-tight text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              onClick={() => setPaletteOpen(true)}
              title="Open command palette (⌘K)"
            >
              ⌘K
            </button>
            <TimeTracker />
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setThemeDialogOpen(true)}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              title="Customize theme"
              aria-label="Customize theme"
            >
              <Palette size={14} />
            </button>
            {/* Always render the menu — in file mode there's no auth
                session, but the menu still hosts theme, AI settings,
                and "Check for updates…" (the only explicitly labeled
                update affordance in the renderer). Pre-fix this was
                gated on `user`, which is always null in the packaged
                desktop app, leaving the manual update check hidden
                behind a tooltip on the version badge. */}
            <UserMenu email={user?.email ?? null} />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden bg-[var(--pg-bg)]">
        <Sidebar />
        {/* `relative` is required so the Canvas wrapper (which uses
            `absolute inset-0` to guarantee a stable pixel size for React
            Flow before its ResizeObserver fires) can anchor against this
            container instead of bubbling up to the document body. */}
        <main className="relative flex-1 flex flex-col overflow-hidden min-w-0">
          <Canvas />
        </main>
        {/* The Study Buddy dock sits to the right of the canvas and
            shrinks the main area when open. Floating panels still
            render on top via `PanelManager` below — the dock is just
            a sibling, not an overlay, so panels can be dragged into
            view alongside it. */}
        <StudyBuddyDock />
      </div>

      <PanelManager />
      <BrowserWindow />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ThemeSettingsDialog
        open={themeDialogOpen}
        onClose={() => setThemeDialogOpen(false)}
      />
      <AiSettingsDialog
        open={aiSettingsOpen}
        onClose={() => setAiSettingsOpen(false)}
      />
      <ToastViewport />
    </div>
  );
}
