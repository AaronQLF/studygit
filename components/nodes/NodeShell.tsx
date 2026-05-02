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
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  menuContent?: React.ReactNode;
  accentColor?: string;
  WatermarkIcon?: React.ComponentType<{ size?: number }>;
  label?: string;
  bare?: boolean;
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
    <div ref={menuRef} className="absolute right-2 top-2 z-20 nodrag">
      <button
        className="h-7 w-7 inline-flex items-center justify-center rounded-full bg-[var(--pg-bg)]/0 opacity-0 group-hover:opacity-100 hover:bg-[var(--pg-bg-elevated)] text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        title="More actions"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 min-w-[160px] rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg)] p-1 shadow-[var(--pg-shadow)]">
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
        {renderMenu()}
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
    >
      {/* Card body */}
      <div
        className={clsx(
          "relative overflow-hidden rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-bg)] shadow-[var(--pg-shadow-sm)] transition-[transform,box-shadow,border-color] duration-200 ease-out group-hover:-translate-y-[1px] group-hover:border-[var(--pg-border-strong)] group-hover:shadow-[var(--pg-shadow)]",
          className
        )}
      >
        {/* Thin accent strip along the top edge */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[3px]"
          style={{
            background: `linear-gradient(90deg, ${accent} 0%, color-mix(in srgb, ${accent} 35%, transparent) 100%)`,
          }}
        />

        {/* Header row: label chip + reserved space for the menu button */}
        {label ? (
          <div className="flex items-center gap-1.5 px-3.5 pt-3 pr-10">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: accent }}
            />
            <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--pg-muted)]">
              {label}
            </span>
            {WatermarkIcon ? (
              <span className="ml-auto text-[var(--pg-muted-soft)]">
                <WatermarkIcon size={12} />
              </span>
            ) : null}
          </div>
        ) : null}

        <Handle
          type="target"
          position={Position.Top}
          className="!w-2 !h-2"
        />
        {renderMenu()}
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
