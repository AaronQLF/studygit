"use client";

import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Copy, Crosshair, MoreHorizontal, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import { useToastStore } from "@/components/Toast";

export function NodeShell({
  id,
  children,
  className,
  menuContent,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  menuContent?: React.ReactNode;
}) {
  const duplicateNode = useStore((s) => s.duplicateNode);
  const focusNode = useStore((s) => s.focusNode);
  const deleteNodeWithSnapshot = useStore((s) => s.deleteNodeWithSnapshot);
  const restoreDeletedNode = useStore((s) => s.restoreDeletedNode);
  const pushUndo = useToastStore((s) => s.pushUndo);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onDelete = () => {
    const snapshot = deleteNodeWithSnapshot(id);
    if (!snapshot) return;
    pushUndo("Deleted node", () => restoreDeletedNode(snapshot));
  };

  const onShellDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("a") ||
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest("label") ||
      target.closest("iframe")
    ) {
      return;
    }
    focusNode(id);
  };

  return (
    <div
      className={clsx(
        "group relative rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] shadow-[0_2px_12px_rgba(0,0,0,0.12)]",
        className
      )}
      onDoubleClick={onShellDoubleClick}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2"
      />
      <div ref={menuRef} className="absolute right-2 top-2 z-20 nodrag">
        <button
          className="h-6 w-6 inline-flex items-center justify-center rounded-md border border-transparent opacity-0 group-hover:opacity-100 hover:bg-[var(--pg-bg-elevated)] hover:border-[var(--pg-border-strong)] text-zinc-500 hover:text-zinc-200"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((v) => !v);
          }}
          title="More actions"
        >
          <MoreHorizontal size={13} />
        </button>
        {open && (
          <div className="absolute right-0 top-7 min-w-[148px] rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-bg-elevated)] p-1 shadow-[var(--pg-shadow)]">
            <button
              className="w-full rounded px-2 py-1.5 text-left text-[11px] font-mono text-zinc-300 hover:bg-zinc-800 flex items-center gap-1.5"
              onClick={(event) => {
                event.stopPropagation();
                focusNode(id);
                setOpen(false);
              }}
            >
              <Crosshair size={11} /> focus
            </button>
            <button
              className="w-full rounded px-2 py-1.5 text-left text-[11px] font-mono text-zinc-300 hover:bg-zinc-800 flex items-center gap-1.5"
              onClick={(event) => {
                event.stopPropagation();
                duplicateNode(id);
                setOpen(false);
              }}
            >
              <Copy size={11} /> duplicate
            </button>
            {menuContent ? (
              <div className="my-1 border-t border-[var(--pg-border)] pt-1">{menuContent}</div>
            ) : null}
            <button
              className="w-full rounded px-2 py-1.5 text-left text-[11px] font-mono text-red-400 hover:bg-zinc-800 flex items-center gap-1.5"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
                setOpen(false);
              }}
            >
              <Trash2 size={11} /> delete
            </button>
          </div>
        )}
      </div>
      {children}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2"
      />
    </div>
  );
}
