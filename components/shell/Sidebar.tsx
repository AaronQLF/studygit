"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "@/lib/store";

export const NEW_WORKSPACE_EVENT = "studygit:new-workspace";

// Stable per-workspace identity hue, drawn from the same family as the
// node accent colors so the sidebar reads as part of the canvas world.
const WORKSPACE_HUES = [
  "#8a2a17",
  "#2a4a6b",
  "#1f6f54",
  "#7c5314",
  "#5a2a6b",
  "#a13755",
  "#34655f",
  "#6b4226",
];

function hueFor(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i)) % 9973;
  return WORKSPACE_HUES[sum % WORKSPACE_HUES.length];
}

function WorkspaceMonogram({ id, name }: { id: string; name: string }) {
  const hue = hueFor(id);
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden
      className="inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[var(--pg-radius-md)] text-[10.5px] font-semibold"
      style={{
        backgroundColor: `color-mix(in srgb, ${hue} 13%, transparent)`,
        color: `color-mix(in srgb, ${hue} 76%, var(--pg-fg) 24%)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hue} 26%, transparent)`,
      }}
    >
      {initial}
    </span>
  );
}

export function Sidebar() {
  const workspaces = useStore((s) => s.workspaces);
  const selectedWorkspaceId = useStore((s) => s.selectedWorkspaceId);
  const selectWorkspace = useStore((s) => s.selectWorkspace);
  const createWorkspace = useStore((s) => s.createWorkspace);
  const renameWorkspace = useStore((s) => s.renameWorkspace);
  const deleteWorkspace = useStore((s) => s.deleteWorkspace);
  const moveWorkspace = useStore((s) => s.moveWorkspace);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  // Per-workspace node counts. The id list only changes on add/remove,
  // so typing inside nodes doesn't re-render the sidebar.
  const nodeWorkspaceIds = useStore(
    useShallow((s) => s.nodes.map((n) => n.workspaceId))
  );
  const countByWorkspace = useMemo(() => {
    const map = new Map<string, number>();
    for (const wsId of nodeWorkspaceIds) {
      map.set(wsId, (map.get(wsId) ?? 0) + 1);
    }
    return map;
  }, [nodeWorkspaceIds]);

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

  // Close the open row menu when clicking anywhere outside it.
  useEffect(() => {
    if (menuOpenId === null) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-ws-menu]")) return;
      setMenuOpenId(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpenId]);

  // Reset pending delete confirmation whenever the row menu changes so a
  // stale "Click again to confirm" state never carries over to a different
  // workspace or a re-opened menu. Derived during render to avoid a
  // cascading setState from inside an effect.
  const effectiveConfirmingDeleteId =
    menuOpenId === null
      ? null
      : confirmingDeleteId && confirmingDeleteId !== menuOpenId
      ? null
      : confirmingDeleteId;

  // Toggle hides the sidebar entirely. The header toggle button remains
  // visible so the user can bring it back.
  if (sidebarCollapsed) return null;

  return (
    <aside className="shrink-0 border-r border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] flex flex-col h-full w-56">
      <div className="h-9 flex items-center justify-between px-2 mt-1">
        <div className="pg-section-label pl-1 text-[12px]">Workspaces</div>
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
              className="pg-input w-full !py-1 text-[12px] !border-[var(--pg-accent)]"
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
        {workspaces.map((ws, index) => {
          const isSelected = ws.id === selectedWorkspaceId;
          const isEditing = renamingId === ws.id;
          const isMenuOpen = menuOpenId === ws.id;
          const count = countByWorkspace.get(ws.id) ?? 0;

          if (isEditing) {
            return (
              <div key={ws.id} className="px-0.5 py-0.5">
                <input
                  autoFocus
                  className="pg-input w-full !py-1 text-[12px] !border-[var(--pg-accent)]"
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
                "group relative mb-0.5 flex items-center gap-2 rounded-[var(--pg-radius-md)] py-[5px] pl-3 pr-7 text-[12.5px] cursor-pointer select-none transition-colors",
                isSelected
                  ? "bg-[var(--pg-bg)] text-[var(--pg-fg)] shadow-[var(--pg-shadow-sm)] ring-1 ring-[var(--pg-border)]"
                  : "text-[var(--pg-fg-soft)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
              )}
              onClick={() => selectWorkspace(ws.id)}
            >
              <span
                className={clsx(
                  "absolute left-0.5 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full transition-colors",
                  isSelected
                    ? "bg-[var(--pg-accent)]"
                    : "bg-transparent group-hover:bg-[var(--pg-muted-soft)]"
                )}
              />
              <WorkspaceMonogram id={ws.id} name={ws.name} />
              <span className="flex-1 truncate">{ws.name}</span>
              <span
                className={clsx(
                  "shrink-0 text-[10px] tabular-nums text-[var(--pg-muted-soft)] transition-opacity",
                  // The count yields to the menu button on hover so the
                  // row never crowds.
                  isMenuOpen ? "opacity-0" : "group-hover:opacity-0"
                )}
              >
                {count > 0 ? count : ""}
              </span>
              <button
                title="More"
                data-ws-menu
                className={clsx(
                  "absolute right-1.5 h-5 w-5 inline-flex items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]",
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
                  data-ws-menu
                  className="absolute right-1 top-7 z-30 min-w-[150px] rounded-[var(--pg-radius-md)] border border-[var(--pg-border)] bg-[var(--pg-bg)] p-1 shadow-[var(--pg-shadow)]"
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
                  <button
                    className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)] disabled:opacity-40"
                    disabled={index === 0}
                    onClick={() => moveWorkspace(ws.id, -1)}
                  >
                    <ArrowUp size={12} className="text-[var(--pg-muted)]" />
                    Move up
                  </button>
                  <button
                    className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)] disabled:opacity-40"
                    disabled={index === workspaces.length - 1}
                    onClick={() => moveWorkspace(ws.id, 1)}
                  >
                    <ArrowDown size={12} className="text-[var(--pg-muted)]" />
                    Move down
                  </button>
                  {workspaces.length > 1 ? (
                    <>
                      <div className="my-1 border-t border-[var(--pg-border)]" />
                      <button
                        className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-red-500 hover:bg-red-500/10"
                        onClick={() => {
                          if (effectiveConfirmingDeleteId === ws.id) {
                            deleteWorkspace(ws.id);
                            setConfirmingDeleteId(null);
                            setMenuOpenId(null);
                          } else {
                            setConfirmingDeleteId(ws.id);
                          }
                        }}
                      >
                        <Trash2 size={12} />
                        {effectiveConfirmingDeleteId === ws.id
                          ? "Click again to confirm"
                          : "Delete"}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}

        {workspaces.length === 0 ? (
          <button
            onClick={handleNew}
            className="w-full mt-1 flex items-center gap-1.5 rounded-[var(--pg-radius-md)] px-2 py-1.5 text-[12px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          >
            <Plus size={12} /> New workspace
          </button>
        ) : null}
      </div>
    </aside>
  );
}
