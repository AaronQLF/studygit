"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Command, Loader2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useStore } from "@/lib/store";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { PanelManager } from "./PanelManager";
import { CommandPalette } from "./CommandPalette";
import { ToastViewport } from "./Toast";

const Canvas = dynamic(() => import("./Canvas").then((m) => m.Canvas), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-[var(--pg-muted)] text-sm">
      Loading canvas…
    </div>
  ),
});

export function AppShell() {
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
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

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
      <header className="h-10 shrink-0 border-b border-[var(--pg-border)] bg-[var(--pg-bg)]">
        <div className="h-full px-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
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
              <span className="pg-serif text-[17px] italic font-medium tracking-tight text-[var(--pg-fg)]">
                personalGit
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
          <div className="flex items-center gap-1">
            <span className="inline-flex h-7 items-center px-2 text-[11px] italic text-[var(--pg-muted)]">
              {saveStatus}
            </span>
            <button
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              onClick={() => setPaletteOpen(true)}
              title="Open command palette"
            >
              <Command size={12} />
              <span className="font-medium tracking-tight">⌘K</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden bg-[var(--pg-bg)]">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Canvas />
        </main>
      </div>

      <PanelManager />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ToastViewport />
    </div>
  );
}
