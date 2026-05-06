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
  accentColor,
  WatermarkIcon,
  label,
  bare = false,
  actions,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  menuContent?: React.ReactNode;
  accentColor?: string;
  WatermarkIcon?: React.ComponentType<{ size?: number }>;
  label?: string;
  bare?: boolean;
  /**
   * Optional inline controls rendered on the right side of the header,
   * before the overflow menu. Use for primary affordances like "Open".
   */
  actions?: React.ReactNode;
}) {
  const duplicateNode = useStore((s) => s.duplicateNode);
  const openPanel = useStore((s) => s.openPanel);
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
    openPanel(id);
  };

  const renderMenu = () => (
    <div ref={menuRef} className="nodrag">
      <button
        className="h-7 w-7 inline-flex items-center justify-center rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-[var(--pg-bg-elevated)] text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        title="More actions"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-2 top-9 z-30 min-w-[160px] rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg)] p-1 shadow-[var(--pg-shadow)]">
          <button
            className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)] flex items-center gap-2"
            onClick={(event) => {
              event.stopPropagation();
              openPanel(id);
              setOpen(false);
            }}
          >
            <Crosshair size={12} className="text-[var(--pg-muted)]" /> Open
          </button>
          <button
            className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)] flex items-center gap-2"
            onClick={(event) => {
              event.stopPropagation();
              duplicateNode(id);
              setOpen(false);
            }}
          >
            <Copy size={12} className="text-[var(--pg-muted)]" /> Duplicate
          </button>
          {menuContent ? (
            <div className="my-1 border-t border-[var(--pg-border)] pt-1">{menuContent}</div>
          ) : null}
          <button
            className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-red-500 hover:bg-red-500/10 flex items-center gap-2"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
              setOpen(false);
            }}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );

  if (bare) {
    return (
      <div
        className={clsx("group relative", className)}
        onDoubleClick={onShellDoubleClick}
      >
        <Handle type="target" position={Position.Top} className="!w-2 !h-2" />
        <div className="absolute right-2 top-2 z-20">{renderMenu()}</div>
        {children}
        <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" />
      </div>
    );
  }

  const accent = accentColor ?? "var(--pg-border-strong)";

  return (
    <div
      className="group relative pg-anim"
      onDoubleClick={onShellDoubleClick}
      style={{ ["--node-accent" as string]: accent }}
    >
      <div
        className={clsx(
          "pg-node-card relative overflow-visible rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-bg)] shadow-[var(--pg-shadow-sm)]",
          className
        )}
      >
        {/* Header: monogram badge + label, with inline actions and overflow menu on the right */}
        {label ? (
          <div className="relative flex items-center gap-2 px-3 pt-2.5">
            <span
              aria-hidden
              className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md transition-colors"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--node-accent) 11%, transparent)",
                color:
                  "color-mix(in srgb, var(--node-accent) 78%, var(--pg-fg) 22%)",
                boxShadow:
                  "inset 0 0 0 1px color-mix(in srgb, var(--node-accent) 22%, transparent)",
              }}
            >
              {WatermarkIcon ? (
                <WatermarkIcon size={12} />
              ) : (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: "var(--node-accent)" }}
                />
              )}
            </span>
            <span
              className="text-[10.5px] font-medium uppercase tracking-[0.14em]"
              style={{
                color:
                  "color-mix(in srgb, var(--node-accent) 28%, var(--pg-muted) 72%)",
              }}
            >
              {label}
            </span>
            <div className="ml-auto flex items-center gap-0.5">
              {actions ? <div className="nodrag">{actions}</div> : null}
              {renderMenu()}
            </div>
          </div>
        ) : (
          <div className="absolute right-2 top-2 z-20">{renderMenu()}</div>
        )}

        <Handle
          type="target"
          position={Position.Top}
          className="!w-2 !h-2"
        />
        {children}
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-2 !h-2"
        />
      </div>
    </div>
  );
}
