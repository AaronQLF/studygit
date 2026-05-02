"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const handleNew = () => {
    const name = window.prompt("Workspace name");
    if (name && name.trim()) createWorkspace(name.trim());
  };

  return (
    <aside
      className={clsx(
        "shrink-0 border-r border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] flex flex-col h-full",
        sidebarCollapsed ? "w-12" : "w-56"
      )}
    >
      <div className="h-9 flex items-center justify-between px-2 mt-1">
        {!sidebarCollapsed ? (
          <div className="pg-serif pl-1 text-[13px] italic text-[var(--pg-muted)]">
            Workspaces
          </div>
        ) : (
          <div />
        )}
        <button
          title="New workspace"
          className="h-6 w-6 inline-flex items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          onClick={handleNew}
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pt-1 pb-2">
        {workspaces.map((ws) => {
          const isSelected = ws.id === selectedWorkspaceId;
          const isEditing = renamingId === ws.id;
          const isMenuOpen = menuOpenId === ws.id;

          if (sidebarCollapsed) {
            const initial = ws.name.trim().charAt(0).toUpperCase() || "?";
            return (
              <button
                key={ws.id}
                title={ws.name}
                className={clsx(
                  "mx-auto my-0.5 h-8 w-8 rounded-md text-[12px] font-semibold flex items-center justify-center relative",
                  isSelected
                    ? "text-[var(--pg-accent)]"
                    : "text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
                )}
                onClick={() => selectWorkspace(ws.id)}
              >
                {isSelected ? (
                  <span className="absolute -left-0.5 h-5 w-[2px] rounded-full bg-[var(--pg-accent)]" />
                ) : null}
                {initial}
              </button>
            );
          }

          if (isEditing) {
            return (
              <div key={ws.id} className="px-0.5 py-0.5">
                <input
                  autoFocus
                  className="w-full rounded-md border border-[var(--pg-accent)] bg-[var(--pg-bg)] px-2 py-1 text-[12px] text-[var(--pg-fg)] outline-none"
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
                "group relative flex items-center gap-1.5 rounded-md px-2 py-1 pl-3 text-[12.5px] cursor-pointer select-none",
                isSelected
                  ? "text-[var(--pg-fg)]"
                  : "text-[var(--pg-fg-soft)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              )}
              onClick={() => selectWorkspace(ws.id)}
            >
              <span
                className={clsx(
                  "absolute left-0.5 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full transition-colors",
                  isSelected ? "bg-[var(--pg-accent)]" : "bg-transparent group-hover:bg-[var(--pg-muted-soft)]"
                )}
              />
              <span className="flex-1 truncate">{ws.name}</span>
              <button
                title="More"
                className={clsx(
                  "h-5 w-5 inline-flex items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]",
                  isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenId(isMenuOpen ? null : ws.id);
                }}
              >
                <MoreHorizontal size={13} />
              </button>
              {isMenuOpen ? (
                <div
                  className="absolute right-1 top-7 z-30 min-w-[140px] rounded-md border border-[var(--pg-border)] bg-[var(--pg-bg)] p-1 shadow-[var(--pg-shadow)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
                    onClick={() => {
                      setRenameValue(ws.name);
                      setRenamingId(ws.id);
                      setMenuOpenId(null);
                    }}
                  >
                    <Pencil size={12} className="text-[var(--pg-muted)]" />
                    Rename
                  </button>
                  {workspaces.length > 1 ? (
                    <button
                      className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-red-500 hover:bg-red-500/10"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete workspace "${ws.name}" and everything in it? This cannot be undone.`
                          )
                        ) {
                          deleteWorkspace(ws.id);
                        }
                        setMenuOpenId(null);
                      }}
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}

        {workspaces.length === 0 && !sidebarCollapsed ? (
          <button
            onClick={handleNew}
            className="w-full mt-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          >
            <Plus size={12} /> New workspace
          </button>
        ) : null}
      </div>
    </aside>
  );
}
