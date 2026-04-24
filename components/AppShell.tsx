"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Command, Loader2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useStore } from "@/lib/store";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { FocusMode } from "./FocusMode";
import { CommandPalette } from "./CommandPalette";
import { ToastViewport } from "./Toast";

const Canvas = dynamic(() => import("./Canvas").then((m) => m.Canvas), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
      Loading canvas...
    </div>
  ),
});

export function AppShell() {
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s.hydrated);
  const isDirty = useStore((s) => s.isDirty);
  const justSaved = useStore((s) => s.justSaved);
  const folders = useStore((s) => s.folders);
  const selectedFolderId = useStore((s) => s.selectedFolderId);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const focusedNodeId = useStore((s) => s.focusedNodeId);
  const clearFocus = useStore((s) => s.clearFocus);
  const focusNode = useStore((s) => s.focusNode);
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
        } else if (focusedNodeId) {
          clearFocus();
        }
      } else if (
        event.key === "Enter" &&
        !event.metaKey &&
        !event.ctrlKey &&
        selectedNodeId &&
        !focusedNodeId
      ) {
        focusNode(selectedNodeId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    clearFocus,
    focusNode,
    focusedNodeId,
    paletteOpen,
    selectedNodeId,
    toggleSidebar,
  ]);

  const currentFolder = folders.find((f) => f.id === selectedFolderId);

  const breadcrumb = useMemo(() => {
    if (!currentFolder) return [];
    const names: string[] = [];
    let cur = currentFolder;
    names.unshift(cur.name);
    while (cur.parentId) {
      const parent = folders.find((f) => f.id === cur.parentId);
      if (!parent) break;
      names.unshift(parent.name);
      cur = parent;
    }
    return names;
  }, [currentFolder, folders]);

  if (!hydrated) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500">
        <Loader2 size={18} className="animate-spin mr-2" /> Loading...
      </div>
    );
  }

  const saveDotClass = isDirty
    ? "bg-[var(--pg-accent)] animate-pulse"
    : justSaved
    ? "bg-[var(--pg-accent)]"
    : "bg-zinc-600";

  return (
    <div className="relative flex flex-col flex-1 h-screen bg-[var(--pg-bg)] text-[var(--pg-fg)]">
      <header className="h-11 shrink-0 border-b border-[var(--pg-border)] bg-[color-mix(in_srgb,var(--pg-bg-subtle)_82%,transparent)] backdrop-blur-md">
        <div className="h-full px-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-elevated)] text-zinc-400 hover:text-zinc-200"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? "Expand sidebar ([)" : "Collapse sidebar ([)"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={14} />
              ) : (
                <PanelLeftClose size={14} />
              )}
            </button>
            <span className="font-medium text-zinc-100 tracking-tight">
              personalGIt
            </span>
            {breadcrumb.length > 0 && (
              <div className="flex min-w-0 items-center gap-1 text-[11px] font-mono text-zinc-500">
                <span>›</span>
                {breadcrumb.map((name, idx) => (
                  <span key={name + idx} className="truncate">
                    {idx > 0 && <span className="px-1 text-zinc-700">/</span>}
                    <span
                      className={
                        idx === breadcrumb.length - 1
                          ? "text-zinc-300"
                          : "text-zinc-500"
                      }
                    >
                      {name}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${saveDotClass}`}
              title={isDirty ? "Saving" : justSaved ? "Saved" : "Idle"}
            />
            <button
              className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg-elevated)] px-2 text-[11px] font-mono text-zinc-400 hover:text-zinc-200"
              onClick={() => setPaletteOpen(true)}
              title="Open command palette"
            >
              <Command size={12} /> K
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

      <FocusMode />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ToastViewport />
    </div>
  );
}
