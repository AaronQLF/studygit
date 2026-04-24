"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  FolderPlus,
  FolderTree,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import type { Folder } from "@/lib/types";

type TreeNode = Folder & { children: TreeNode[] };

function buildTree(folders: Folder[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  folders.forEach((f) => map.set(f.id, { ...f, children: [] }));
  const roots: TreeNode[] = [];
  folders.forEach((f) => {
    const node = map.get(f.id)!;
    if (f.parentId && map.has(f.parentId)) {
      map.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortTree = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortTree(n.children));
  };
  sortTree(roots);
  return roots;
}

function FolderRow({
  node,
  depth,
  collapsed,
  openMap,
  setOpen,
}: {
  node: TreeNode;
  depth: number;
  collapsed: boolean;
  openMap: Record<string, boolean>;
  setOpen: (id: string, v: boolean) => void;
}) {
  const selectedFolderId = useStore((s) => s.selectedFolderId);
  const selectFolder = useStore((s) => s.selectFolder);
  const createFolder = useStore((s) => s.createFolder);
  const renameFolder = useStore((s) => s.renameFolder);
  const deleteFolder = useStore((s) => s.deleteFolder);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.name);

  const isOpen = openMap[node.id] !== false;
  const isSelected = selectedFolderId === node.id;
  const hasChildren = node.children.length > 0;

  if (collapsed) {
    return (
      <button
        title={node.name}
        className={clsx(
          "mx-auto my-1 h-9 w-9 rounded-md border text-zinc-400 hover:text-zinc-100",
          isSelected
            ? "border-[var(--pg-accent)] bg-[color-mix(in_srgb,var(--pg-accent)_20%,transparent)] text-zinc-100"
            : "border-transparent hover:border-[var(--pg-border-strong)] bg-transparent"
        )}
        onClick={() => selectFolder(node.id)}
      >
        <FolderIcon size={15} className="mx-auto" />
      </button>
    );
  }

  return (
    <div className="select-none">
      <div
        className={clsx(
          "group flex items-center gap-1 rounded-md text-[13px] cursor-pointer px-2 py-1.5",
          isSelected
            ? "bg-[color-mix(in_srgb,var(--pg-accent)_16%,transparent)] text-zinc-100"
            : "text-zinc-400 hover:bg-[var(--pg-bg-elevated)] hover:text-zinc-200"
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => selectFolder(node.id)}
      >
        <button
          className="flex items-center justify-center w-4 h-4 shrink-0 opacity-70 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(node.id, !isOpen);
          }}
        >
          {hasChildren ? (
            isOpen ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span className="w-[14px]" />
          )}
        </button>

        {editing ? (
          <input
            autoFocus
            className="flex-1 px-1 rounded border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] text-zinc-200 text-[13px] outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim()) renameFolder(node.id, name.trim());
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (name.trim()) renameFolder(node.id, name.trim());
                setEditing(false);
              } else if (e.key === "Escape") {
                setName(node.name);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 truncate">{node.name}</span>
        )}

        <div
          className={clsx(
            "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
            isSelected && "opacity-100"
          )}
        >
          <button
            title="New subfolder"
            className="p-1 rounded hover:bg-zinc-800"
            onClick={(e) => {
              e.stopPropagation();
              const n = window.prompt("Subfolder name");
              if (n && n.trim()) {
                createFolder(n.trim(), node.id);
                setOpen(node.id, true);
              }
            }}
          >
            <Plus size={12} />
          </button>
          <button
            title="Rename"
            className="p-1 rounded hover:bg-zinc-800"
            onClick={(e) => {
              e.stopPropagation();
              setName(node.name);
              setEditing(true);
            }}
          >
            <Pencil size={12} />
          </button>
          <button
            title="Delete"
            className="p-1 rounded hover:bg-zinc-800"
            onClick={(e) => {
              e.stopPropagation();
              if (
                window.confirm(
                  `Delete "${node.name}" and all its contents? This cannot be undone.`
                )
              ) {
                deleteFolder(node.id);
              }
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {hasChildren && isOpen && (
        <div>
          {node.children.map((c) => (
            <FolderRow
              key={c.id}
              node={c}
              depth={depth + 1}
              collapsed={collapsed}
              openMap={openMap}
              setOpen={setOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const folders = useStore((s) => s.folders);
  const createFolder = useStore((s) => s.createFolder);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  const tree = useMemo(() => buildTree(folders), [folders]);
  const flatFolders = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name)),
    [folders]
  );

  const setOpen = (id: string, v: boolean) =>
    setOpenMap((m) => ({ ...m, [id]: v }));

  return (
    <aside
      className={clsx(
        "shrink-0 border-r border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] flex flex-col h-full",
        sidebarCollapsed ? "w-14" : "w-60"
      )}
    >
      <div className="h-11 flex items-center justify-between px-2.5 border-b border-[var(--pg-border)]">
        {!sidebarCollapsed ? (
          <div className="text-[11px] font-mono tracking-wide text-zinc-500 inline-flex items-center gap-1">
            <FolderTree size={12} />
            folders
          </div>
        ) : (
          <div />
        )}
        <button
          title="New folder"
          className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-transparent hover:border-[var(--pg-border-strong)] hover:bg-[var(--pg-bg-elevated)] text-zinc-400 hover:text-zinc-100"
          onClick={() => {
            const name = window.prompt("Folder name");
            if (name && name.trim()) createFolder(name.trim(), null);
          }}
        >
          <FolderPlus size={16} />
        </button>
      </div>
      <div className={clsx("flex-1 overflow-y-auto", sidebarCollapsed ? "px-1.5 py-2" : "px-1.5 py-2")}>
        {folders.length === 0 ? (
          <div className="text-[11px] font-mono text-zinc-500 px-2 py-3">
            empty
          </div>
        ) : sidebarCollapsed ? (
          flatFolders.map((folder) => (
            <FolderRow
              key={folder.id}
              node={{ ...folder, children: [] }}
              depth={0}
              collapsed
              openMap={openMap}
              setOpen={setOpen}
            />
          ))
        ) : (
          tree.map((n) => (
            <FolderRow
              key={n.id}
              node={n}
              depth={0}
              collapsed={false}
              openMap={openMap}
              setOpen={setOpen}
            />
          ))
        )}
      </div>
    </aside>
  );
}
