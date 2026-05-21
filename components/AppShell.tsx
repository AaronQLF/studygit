"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Command,
  Globe,
  Loader2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
// CSS only needed inside the app: KaTeX renders math in TipTap nodes and
// in the web-article reader, tippy.js styles the slash/citation menus.
// Importing here (instead of in app/layout.tsx) keeps these off the
// landing/marketing routes.
import "katex/dist/katex.min.css";
import "tippy.js/dist/tippy.css";
import { LATEST_RELEASE } from "@/lib/changelog";
import { useStore } from "@/lib/store";
import { useBrowserSession } from "@/lib/browser-session";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { PanelManager } from "./PanelManager";
import { CommandPalette } from "./CommandPalette";
import { ToastViewport } from "./Toast";
import { TimeTracker } from "./TimeTracker";
import { UserMenu } from "./UserMenu";
import { UpdateBanner } from "./UpdateBanner";
import { BrowserWindow } from "./BrowserWindow";
import {
  THEME_DIALOG_EVENT,
  ThemeSettingsDialog,
} from "./ThemeSettingsDialog";

type AppShellProps = {
  user?: { id: string; email: string | null } | null;
};

const Canvas = dynamic(() => import("./Canvas").then((m) => m.Canvas), {
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
  const isDirty = useStore((s) => s.isDirty);
  const justSaved = useStore((s) => s.justSaved);
  const workspaces = useStore((s) => s.workspaces);
  const selectedWorkspaceId = useStore((s) => s.selectedWorkspaceId);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const openPanel = useStore((s) => s.openPanel);
  const openBrowser = useBrowserSession((s) => s.openBrowser);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
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
  }, [openPanel, paletteOpen, selectedNodeId, toggleSidebar]);

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
            <Link
              href="/changelog"
              target="_blank"
              rel="noopener noreferrer"
              title={`Release notes for v${LATEST_RELEASE.version}`}
              className="hidden md:inline-flex h-7 items-center rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] px-1.5 font-mono text-[10.5px] text-[var(--pg-muted)] hover:text-[var(--pg-fg)] hover:border-[var(--pg-border-strong)]"
            >
              v{LATEST_RELEASE.version}
            </Link>
            <span className="pg-section-label inline-flex h-7 items-center px-2">
              {saveStatus}
            </span>
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
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              onClick={() => setPaletteOpen(true)}
              title="Open command palette"
            >
              <Command size={12} />
              <span className="font-medium tracking-tight">⌘K</span>
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
            {user ? <UserMenu email={user.email} /> : null}
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
      </div>

      <PanelManager />
      <BrowserWindow />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ThemeSettingsDialog
        open={themeDialogOpen}
        onClose={() => setThemeDialogOpen(false)}
      />
      <ToastViewport />
    </div>
  );
}
