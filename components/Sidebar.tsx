"use client";

import { useEffect, useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useStore } from "@/lib/store";

export const NEW_WORKSPACE_EVENT = "studygit:new-workspace";

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
  const [creating, setCreating] = useState(false);
  const [createValue, setCreateValue] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null
  );

  const handleNew = () => {
    setCreating(true);
    setCreateValue("");
  };

  const commitCreate = () => {
    const trimmed = createValue.trim();
    if (trimmed) createWorkspace(trimmed);
    setCreating(false);
    setCreateValue("");
  };

  const cancelCreate = () => {
    setCreating(false);
    setCreateValue("");
  };

  // Allow other parts of the app (e.g. the command palette) to trigger the
  // inline create flow without using window.prompt(), which Electron's
  // renderer process does not support.
  useEffect(() => {
    const onNew = () => {
      setCreating(true);
      setCreateValue("");
    };
    window.addEventListener(NEW_WORKSPACE_EVENT, onNew);
    return () => window.removeEventListener(NEW_WORKSPACE_EVENT, onNew);
  }, []);

  // Reset pending delete confirmation whenever the row menu changes so a
  // stale "Click again to confirm" state never carries over to a different
  // workspace or a re-opened menu.
  useEffect(() => {
    if (menuOpenId === null) {
      setConfirmingDeleteId(null);
    } else if (confirmingDeleteId && confirmingDeleteId !== menuOpenId) {
      setConfirmingDeleteId(null);
    }
  }, [menuOpenId, confirmingDeleteId]);

  // Toggle hides the sidebar entirely. The header toggle button remains
  // visible so the user can bring it back.
  if (sidebarCollapsed) return null;

  return (
    <aside className="shrink-0 border-r border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] flex flex-col h-full w-56">
      <div className="h-9 flex items-center justify-between px-2 mt-1">
        <div className="pg-serif pl-1 text-[13px] italic text-[var(--pg-muted)]">
          Workspaces
        </div>
        <button
          title="New workspace"
          className="h-6 w-6 inline-flex items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          onClick={handleNew}
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pt-1 pb-2">
        {creating ? (
          <div className="px-0.5 py-0.5">
            <input
              autoFocus
              placeholder="Workspace name"
              className="w-full rounded-md border border-[var(--pg-accent)] bg-[var(--pg-bg)] px-2 py-1 text-[12px] text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)]"
              value={createValue}
              onChange={(e) => setCreateValue(e.target.value)}
              onBlur={commitCreate}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitCreate();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelCreate();
                }
              }}
            />
          </div>
        ) : null}
        {workspaces.map((ws) => {
          const isSelected = ws.id === selectedWorkspaceId;
          const isEditing = renamingId === ws.id;
          const isMenuOpen = menuOpenId === ws.id;

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
                      setConfirmingDeleteId(null);
                    }}
                  >
                    <Pencil size={12} className="text-[var(--pg-muted)]" />
                    Rename
                  </button>
                  {workspaces.length > 1 ? (
                    <button
                      className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-red-500 hover:bg-red-500/10"
                      onClick={() => {
                        if (confirmingDeleteId === ws.id) {
                          deleteWorkspace(ws.id);
                          setConfirmingDeleteId(null);
                          setMenuOpenId(null);
                        } else {
                          setConfirmingDeleteId(ws.id);
                        }
                      }}
                    >
                      <Trash2 size={12} />
                      {confirmingDeleteId === ws.id
                        ? "Click again to confirm"
                        : "Delete"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}

        {workspaces.length === 0 ? (
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
