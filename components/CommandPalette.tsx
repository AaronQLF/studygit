"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  FileSearch,
  FileText,
  Image as ImageIcon,
  Layers,
  Link2,
  MoonStar,
  NotebookPen,
  PanelLeft,
  Plus,
  Search,
  Shapes,
  StickyNote,
  Target,
} from "lucide-react";
import { NOTE_COLORS, SHAPE_FILLS, SHAPE_STROKES } from "@/lib/defaults";
import { cycleTheme, readThemePreference, writeThemePreference } from "./ThemeToggle";
import { useStore } from "@/lib/store";
import type { AnyNodeData, NodeKind } from "@/lib/types";

type PaletteItem = {
  id: string;
  section: "Add" | "Workspaces" | "View";
  label: string;
  hint?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  disabled?: boolean;
  keywords?: string[];
  onSelect: () => void;
};

function defaultDataFor(kind: NodeKind): AnyNodeData {
  switch (kind) {
    case "link":
      return { kind, title: "New link", url: "", embed: true };
    case "image":
      return { kind, url: "" };
    case "note":
      return { kind, text: "", color: NOTE_COLORS[0] };
    case "blog":
    case "page":
      return { kind: "page", title: "New page", content: "" };
    case "document":
      return { kind, title: "New document", content: "", highlights: [] };
    case "pdf":
      return { kind, title: "New PDF", src: "", highlights: [] };
    case "shape":
      return {
        kind,
        variant: "rounded",
        fill: SHAPE_FILLS[1],
        stroke: SHAPE_STROKES[0],
        label: "",
      };
  }
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const workspaces = useStore((s) => s.workspaces);
  const selectedWorkspaceId = useStore((s) => s.selectedWorkspaceId);
  const addNode = useStore((s) => s.addNode);
  const createWorkspace = useStore((s) => s.createWorkspace);
  const selectWorkspace = useStore((s) => s.selectWorkspace);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const openPanel = useStore((s) => s.openPanel);

  const items = useMemo<PaletteItem[]>(() => {
    const wsId = selectedWorkspaceId;
    const randomPos = () => ({
      x: 120 + Math.random() * 120,
      y: 120 + Math.random() * 120,
    });
    const addItems: PaletteItem[] = [
      { id: "add-link", section: "Add", label: "Add link", icon: Link2, hint: "L", onSelect: () => wsId && addNode(wsId, defaultDataFor("link"), randomPos()), disabled: !wsId },
      { id: "add-image", section: "Add", label: "Add image", icon: ImageIcon, hint: "I", onSelect: () => wsId && addNode(wsId, defaultDataFor("image"), randomPos()), disabled: !wsId },
      { id: "add-note", section: "Add", label: "Add note", icon: StickyNote, hint: "N", onSelect: () => wsId && addNode(wsId, defaultDataFor("note"), randomPos()), disabled: !wsId },
      { id: "add-page", section: "Add", label: "Add page", icon: NotebookPen, hint: "B", keywords: ["page", "note", "blog"], onSelect: () => wsId && addNode(wsId, defaultDataFor("page"), randomPos()), disabled: !wsId },
      { id: "add-document", section: "Add", label: "Add document", icon: FileText, hint: "D", onSelect: () => wsId && addNode(wsId, defaultDataFor("document"), randomPos()), disabled: !wsId },
      { id: "add-pdf", section: "Add", label: "Add PDF", icon: FileSearch, hint: "P", onSelect: () => wsId && addNode(wsId, defaultDataFor("pdf"), randomPos()), disabled: !wsId },
      { id: "add-shape", section: "Add", label: "Add shape", icon: Shapes, hint: "S", keywords: ["shape", "frame", "group", "color", "organize", "rectangle", "ellipse", "diamond"], onSelect: () => wsId && addNode(wsId, defaultDataFor("shape"), randomPos()), disabled: !wsId },
    ];

    const workspaceActions: PaletteItem[] = [
      {
        id: "workspace-new",
        section: "Workspaces",
        label: "New workspace",
        icon: Plus,
        onSelect: () => {
          const name = window.prompt("Workspace name");
          if (!name?.trim()) return;
          createWorkspace(name.trim());
        },
      },
      ...workspaces
        .filter((w) => w.id !== selectedWorkspaceId)
        .map((w) => ({
          id: `workspace-switch-${w.id}`,
          section: "Workspaces" as const,
          label: `Switch to ${w.name}`,
          icon: Layers,
          onSelect: () => selectWorkspace(w.id),
          keywords: [w.name],
        })),
    ];

    const viewItems: PaletteItem[] = [
      {
        id: "view-theme",
        section: "View",
        label: "Cycle theme (light → dark → system)",
        icon: MoonStar,
        keywords: ["dark", "light", "system", "appearance"],
        onSelect: () => {
          const current = readThemePreference();
          writeThemePreference(cycleTheme(current));
        },
      },
      {
        id: "view-sidebar",
        section: "View",
        label: "Toggle sidebar",
        icon: PanelLeft,
        hint: "[",
        onSelect: () => toggleSidebar(),
      },
      {
        id: "view-open-node",
        section: "View",
        label: "Open selected node in a panel",
        icon: Target,
        keywords: ["focus", "panel", "split"],
        onSelect: () => selectedNodeId && openPanel(selectedNodeId),
        disabled: !selectedNodeId,
      },
    ];

    return [...addItems, ...workspaceActions, ...viewItems];
  }, [
    addNode,
    createWorkspace,
    openPanel,
    selectWorkspace,
    selectedNodeId,
    selectedWorkspaceId,
    toggleSidebar,
    workspaces,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      if (item.label.toLowerCase().includes(q)) return true;
      if (item.section.toLowerCase().includes(q)) return true;
      return (item.keywords ?? []).some((kw) => kw.toLowerCase().includes(q));
    });
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(Math.max(0, filtered.length - 1));
    }
  }, [activeIndex, filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (filtered.length ? (index + 1) % filtered.length : 0));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) =>
          filtered.length ? (index - 1 + filtered.length) % filtered.length : 0
        );
      } else if (event.key === "Enter") {
        event.preventDefault();
        const target = filtered[activeIndex];
        if (!target || target.disabled) return;
        target.onSelect();
        onClose();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, filtered, onClose, open]);

  if (!open) return null;

  let lastSection: PaletteItem["section"] | null = null;

  return (
    <div
      className="fixed inset-0 z-[65] bg-[rgba(15,15,20,0.32)] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="mx-auto mt-[12vh] w-[min(640px,92vw)] rounded-xl border border-[var(--pg-border)] bg-[var(--pg-bg)] shadow-[var(--pg-shadow-lg)] overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--pg-border)] px-3 py-2.5">
          <Search size={14} className="text-[var(--pg-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="what would you like to do?"
            className="pg-command-search w-full bg-transparent text-[13.5px] text-[var(--pg-fg)] outline-none placeholder:italic placeholder:text-[var(--pg-muted)]"
          />
          <span className="text-[10.5px] text-[var(--pg-muted)] border border-[var(--pg-border)] rounded px-1.5 py-0.5">
            ESC
          </span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="px-2 py-6 text-center text-[12px] text-[var(--pg-muted)]">No results</div>
          ) : (
            filtered.map((item, index) => {
              const showSection = lastSection !== item.section;
              lastSection = item.section;
              const Icon = item.icon;
              return (
                <div key={item.id}>
                  {showSection ? (
                    <div className="pg-serif px-2 pt-2 pb-1 text-[11px] italic uppercase tracking-[0.08em] text-[var(--pg-muted)]">
                      {item.section}
                    </div>
                  ) : null}
                  <button
                    className={clsx(
                      "w-full rounded-md px-2 py-1.5 text-left flex items-center justify-between",
                      index === activeIndex
                        ? "bg-[color-mix(in_srgb,var(--pg-marker)_58%,transparent)]"
                        : "hover:bg-[var(--pg-bg-elevated)]",
                      item.disabled && "opacity-45"
                    )}
                    disabled={item.disabled}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      if (item.disabled) return;
                      item.onSelect();
                      onClose();
                    }}
                  >
                    <span className="inline-flex items-center gap-2.5 text-[13px] text-[var(--pg-fg)]">
                      {Icon ? (
                        <Icon
                          size={14}
                          className={index === activeIndex ? "text-[var(--pg-accent)]" : "text-[var(--pg-muted)]"}
                        />
                      ) : null}
                      {item.label}
                    </span>
                    {item.hint ? (
                      <span className="text-[10.5px] text-[var(--pg-muted)] border border-[var(--pg-border)] rounded px-1.5 py-0.5">
                        {item.hint}
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
