"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  BookOpen,
  FileSearch,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  Link2,
  MoonStar,
  PanelLeft,
  Search,
  StickyNote,
  Target,
} from "lucide-react";
import { NOTE_COLORS } from "@/lib/defaults";
import { cycleTheme, readThemePreference, writeThemePreference } from "./ThemeToggle";
import { useStore } from "@/lib/store";
import type { AnyNodeData, NodeKind } from "@/lib/types";

type PaletteItem = {
  id: string;
  section: "Add" | "Folders" | "Navigate" | "View";
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
      return { kind, title: "New blog post", markdown: "# New blog post\n\n..." };
    case "document":
      return { kind, title: "New document", content: "", highlights: [] };
    case "pdf":
      return { kind, title: "New PDF", src: "", highlights: [] };
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

  const folders = useStore((s) => s.folders);
  const selectedFolderId = useStore((s) => s.selectedFolderId);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const addNode = useStore((s) => s.addNode);
  const createFolder = useStore((s) => s.createFolder);
  const selectFolder = useStore((s) => s.selectFolder);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const focusNode = useStore((s) => s.focusNode);

  const items = useMemo<PaletteItem[]>(() => {
    const addItems: PaletteItem[] = [
      { id: "add-link", section: "Add", label: "Add link", icon: Link2, hint: "L", onSelect: () => selectedFolderId && addNode(selectedFolderId, defaultDataFor("link"), { x: 120 + Math.random() * 120, y: 120 + Math.random() * 120 }), disabled: !selectedFolderId },
      { id: "add-image", section: "Add", label: "Add image", icon: ImageIcon, hint: "I", onSelect: () => selectedFolderId && addNode(selectedFolderId, defaultDataFor("image"), { x: 120 + Math.random() * 120, y: 120 + Math.random() * 120 }), disabled: !selectedFolderId },
      { id: "add-note", section: "Add", label: "Add note", icon: StickyNote, hint: "N", onSelect: () => selectedFolderId && addNode(selectedFolderId, defaultDataFor("note"), { x: 120 + Math.random() * 120, y: 120 + Math.random() * 120 }), disabled: !selectedFolderId },
      { id: "add-blog", section: "Add", label: "Add blog", icon: BookOpen, hint: "B", onSelect: () => selectedFolderId && addNode(selectedFolderId, defaultDataFor("blog"), { x: 120 + Math.random() * 120, y: 120 + Math.random() * 120 }), disabled: !selectedFolderId },
      { id: "add-document", section: "Add", label: "Add document", icon: FileText, hint: "D", onSelect: () => selectedFolderId && addNode(selectedFolderId, defaultDataFor("document"), { x: 120 + Math.random() * 120, y: 120 + Math.random() * 120 }), disabled: !selectedFolderId },
      { id: "add-pdf", section: "Add", label: "Add PDF", icon: FileSearch, hint: "P", onSelect: () => selectedFolderId && addNode(selectedFolderId, defaultDataFor("pdf"), { x: 120 + Math.random() * 120, y: 120 + Math.random() * 120 }), disabled: !selectedFolderId },
    ];

    const folderActions: PaletteItem[] = [
      {
        id: "folder-new",
        section: "Folders",
        label: "New root folder",
        icon: FolderPlus,
        onSelect: () => {
          const name = window.prompt("Folder name");
          if (!name?.trim()) return;
          createFolder(name.trim(), null);
        },
      },
    ];

    const navigateItems: PaletteItem[] = folders
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((folder) => ({
        id: `nav-${folder.id}`,
        section: "Navigate",
        label: `Go to ${folder.name}`,
        hint: folder.parentId ? "child" : "root",
        onSelect: () => selectFolder(folder.id),
        keywords: [folder.name],
      }));

    const viewItems: PaletteItem[] = [
      {
        id: "view-theme",
        section: "View",
        label: "Cycle theme",
        icon: MoonStar,
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
        id: "view-focus-node",
        section: "View",
        label: "Focus selected node",
        icon: Target,
        onSelect: () => selectedNodeId && focusNode(selectedNodeId),
        disabled: !selectedNodeId,
      },
    ];

    return [...addItems, ...folderActions, ...navigateItems, ...viewItems];
  }, [
    addNode,
    createFolder,
    focusNode,
    folders,
    selectFolder,
    selectedFolderId,
    selectedNodeId,
    toggleSidebar,
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
      className="fixed inset-0 z-[65] bg-black/55 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-auto mt-16 w-[min(680px,94vw)] rounded-lg border border-[var(--pg-border-strong)] bg-[var(--pg-bg-subtle)] shadow-[var(--pg-shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--pg-border)] px-3 py-2">
          <Search size={14} className="text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands..."
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
          />
        </div>
        <div className="max-h-[62vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-2 py-4 text-[11px] font-mono text-zinc-500">no results</div>
          ) : (
            filtered.map((item, index) => {
              const showSection = lastSection !== item.section;
              lastSection = item.section;
              const Icon = item.icon;
              return (
                <div key={item.id}>
                  {showSection ? (
                    <div className="px-2 pt-2 pb-1 text-[10px] font-mono text-zinc-500">
                      {item.section.toLowerCase()}
                    </div>
                  ) : null}
                  <button
                    className={clsx(
                      "w-full rounded-md px-2 py-2 text-left flex items-center justify-between",
                      index === activeIndex
                        ? "bg-[var(--pg-bg-elevated)]"
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
                    <span className="inline-flex items-center gap-2 text-sm text-zinc-200">
                      {Icon ? <Icon size={13} className="text-zinc-500" /> : null}
                      {item.label}
                    </span>
                    {item.hint ? (
                      <span className="text-[10px] font-mono text-zinc-500 border border-[var(--pg-border)] rounded px-1">
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
