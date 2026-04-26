"use client";

import { useState } from "react";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useStore } from "@/lib/store";

export function Sidebar() {
  const workspaces = useStore((s) => s.workspaces);
  const selectedWorkspaceId = useStore((s) => s.selectedWorkspaceId);
  const selectWorkspace = useStore((s) => s.selectWorkspace);
  const createWorkspace = useStore((s) => s.createWorkspace);
  const renameWorkspace = useStore((s) => s.renameWorkspace);
  const deleteWorkspace = useStore((s) => s.deleteWorkspace);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleNew = () => {
    const name = window.prompt("Workspace name");
    if (name && name.trim()) createWorkspace(name.trim());
  };

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
            <Layers size={12} />
            workspaces
          </div>
        ) : (
          <div />
        )}
        <button
          title="New workspace"
          className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-transparent hover:border-[var(--pg-border-strong)] hover:bg-[var(--pg-bg-elevated)] text-zinc-400 hover:text-zinc-100"
          onClick={handleNew}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        {workspaces.map((ws) => {
          const isSelected = ws.id === selectedWorkspaceId;
          const isEditing = renamingId === ws.id;

          if (sidebarCollapsed) {
            const initial = ws.name.trim().charAt(0).toUpperCase() || "?";
            return (
              <button
                key={ws.id}
                title={ws.name}
                className={clsx(
                  "mx-auto my-1 h-9 w-9 rounded-md border text-sm font-medium",
                  isSelected
                    ? "border-[var(--pg-accent)] bg-[color-mix(in_srgb,var(--pg-accent)_20%,transparent)] text-zinc-100"
                    : "border-transparent text-zinc-400 hover:border-[var(--pg-border-strong)] hover:text-zinc-100"
                )}
                onClick={() => selectWorkspace(ws.id)}
              >
                {initial}
              </button>
            );
          }

          if (isEditing) {
            return (
              <div key={ws.id} className="px-1 py-1">
                <input
                  autoFocus
                  className="w-full rounded border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] px-2 py-1 text-[13px] text-zinc-200 outline-none"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    const trimmed = renameValue.trim();
                    if (trimmed) renameWorkspace(ws.id, trimmed);
                    setRenamingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const trimmed = renameValue.trim();
                      if (trimmed) renameWorkspace(ws.id, trimmed);
                      setRenamingId(null);
                    } else if (e.key === "Escape") {
                      setRenamingId(null);
                    }
                  }}
                />
              </div>
            );
          }

          return (
            <div
              key={ws.id}
              className={clsx(
                "group flex items-center gap-1 rounded-md px-2 py-1.5 text-[13px] cursor-pointer",
                isSelected
                  ? "bg-[color-mix(in_srgb,var(--pg-accent)_16%,transparent)] text-zinc-100"
                  : "text-zinc-300 hover:bg-[var(--pg-bg-elevated)] hover:text-zinc-100"
              )}
              onClick={() => selectWorkspace(ws.id)}
            >
              <Layers size={13} className="shrink-0 text-zinc-500" />
              <span className="flex-1 truncate">{ws.name}</span>
              <div
                className={clsx(
                  "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
                  isSelected && "opacity-100"
                )}
              >
                <button
                  title="Rename"
                  className="rounded p-1 hover:bg-zinc-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameValue(ws.name);
                    setRenamingId(ws.id);
                  }}
                >
                  <Pencil size={12} />
                </button>
                {workspaces.length > 1 ? (
                  <button
                    title="Delete workspace"
                    className="rounded p-1 hover:bg-zinc-800 hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        window.confirm(
                          `Delete workspace "${ws.name}" and everything in it? This cannot be undone.`
                        )
                      ) {
                        deleteWorkspace(ws.id);
                      }
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        {workspaces.length === 0 && !sidebarCollapsed ? (
          <div className="text-[11px] font-mono text-zinc-500 px-2 py-3">
            no workspaces
          </div>
        ) : null}
      </div>

      {!sidebarCollapsed ? (
        <button
          className="m-2 inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--pg-border-strong)] py-1.5 text-[12px] text-zinc-400 hover:border-[var(--pg-accent)] hover:text-zinc-100"
          onClick={handleNew}
        >
          <Plus size={12} />
          New workspace
        </button>
      ) : null}
    </aside>
  );
}
