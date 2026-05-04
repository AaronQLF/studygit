"use client";

import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Handle,
  NodeResizer,
  Position,
  useViewport,
  type NodeProps,
} from "@xyflow/react";
import {
  Bold,
  Circle,
  Copy,
  Diamond,
  Italic,
  MoreHorizontal,
  Square,
  SquareDashed,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import { useToastStore } from "@/components/Toast";
import { SHAPE_FILLS, SHAPE_STROKES } from "@/lib/defaults";
import type {
  ShapeBorderStyle,
  ShapeNodeData,
  ShapeTextSize,
  ShapeVariant,
} from "@/lib/types";

const VARIANTS: {
  value: ShapeVariant;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
}[] = [
  { value: "rectangle", label: "Rectangle", Icon: Square },
  { value: "rounded", label: "Rounded", Icon: SquareDashed },
  { value: "ellipse", label: "Ellipse", Icon: Circle },
  { value: "diamond", label: "Diamond", Icon: Diamond },
];

const BORDER_STYLES: { value: ShapeBorderStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

const TEXT_SIZES: { value: ShapeTextSize; label: string; px: number }[] = [
  { value: "sm", label: "S", px: 12 },
  { value: "md", label: "M", px: 14 },
  { value: "lg", label: "L", px: 18 },
  { value: "xl", label: "XL", px: 24 },
];

// Reusable text-color palette: neutral first (default), then the same
// stroke colors so users can match border and text easily.
const TEXT_COLORS = ["var(--pg-fg)", ...SHAPE_STROKES];

function fillBackground(fill: string): string {
  if (fill === "transparent") return "transparent";
  // Slight transparency so content nodes layered on top remain readable.
  return `color-mix(in srgb, ${fill} 78%, transparent)`;
}

export function ShapeNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ShapeNodeData;
  const updateNodeData = useStore((s) => s.updateNodeData);
  const duplicateNode = useStore((s) => s.duplicateNode);
  const deleteNodeWithSnapshot = useStore((s) => s.deleteNodeWithSnapshot);
  const restoreDeletedNode = useStore((s) => s.restoreDeletedNode);
  const pushUndo = useToastStore((s) => s.pushUndo);
  const { zoom } = useViewport();

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState(d.label ?? "");
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setLabelDraft(d.label ?? "");
  }, [d.label, editing]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!editing) return;
    const t = inputRef.current;
    if (!t) return;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }, [editing]);

  const commitLabel = () => {
    const next = labelDraft.trim();
    const current = (d.label ?? "").trim();
    if (next !== current) {
      updateNodeData(id, { label: next } as Partial<ShapeNodeData>);
    }
    setEditing(false);
  };

  const onDelete = () => {
    const snapshot = deleteNodeWithSnapshot(id);
    if (!snapshot) return;
    pushUndo("Deleted shape", () => restoreDeletedNode(snapshot));
  };

  const onBodyDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest("textarea")
    ) {
      return;
    }
    event.stopPropagation();
    setEditing(true);
  };

  const variant = d.variant ?? "rounded";
  const fill = d.fill ?? "transparent";
  const stroke = d.stroke ?? "var(--pg-border-strong)";
  const borderStyle: ShapeBorderStyle = d.borderStyle ?? "solid";
  const isFrame = fill === "transparent";

  const textSize = d.textSize ?? "md";
  const textPx =
    TEXT_SIZES.find((t) => t.value === textSize)?.px ?? 14;
  const textColor = d.textColor ?? "var(--pg-fg)";
  const textBold = d.textBold ?? true;
  const textItalic = d.textItalic ?? false;
  const textStyle: React.CSSProperties = {
    fontSize: textPx,
    fontWeight: textBold ? 600 : 400,
    fontStyle: textItalic ? "italic" : "normal",
    color: textColor,
    lineHeight: 1.25,
  };

  const radius =
    variant === "rectangle"
      ? 0
      : variant === "rounded"
      ? 14
      : variant === "ellipse"
      ? 9999
      : 0;

  const diamondClip =
    variant === "diamond"
      ? "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)"
      : undefined;

  return (
    <div className="group relative h-full w-full nodrag-children-pass">
      <NodeResizer
        minWidth={120}
        minHeight={80}
        isVisible={selected}
        color="var(--pg-accent)"
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: "var(--pg-bg)",
          border: "1.5px solid var(--pg-accent)",
        }}
        lineStyle={{ borderColor: "var(--pg-accent)" }}
      />

      <Handle type="target" position={Position.Top} className="!w-2 !h-2" />

      {/* Shape body */}
      <div
        className="relative h-full w-full"
        onDoubleClick={onBodyDoubleClick}
        style={{
          backgroundColor: fillBackground(fill),
          // Dotted/dashed borders are easier to read at slightly heavier
          // weight; solid stays at 1px so it doesn't compete with content.
          border: `${borderStyle === "solid" ? 1 : 1.5}px ${borderStyle} ${stroke}`,
          borderRadius: radius,
          clipPath: diamondClip,
          boxShadow: isFrame ? "none" : "0 1px 0 rgba(28,26,23,0.04)",
        }}
      >
        {/* Label sits at the top of the shape, leaving the body free for
            grouping content underneath. */}
        <div
          className={clsx(
            "absolute inset-x-0 top-0 flex items-start justify-center px-4 pt-2.5 pb-1 text-center",
            // Diamond is clipped to a polygon, so the very top is a sharp
            // point. Push the label down into the wider middle band.
            variant === "diamond" && "px-8 pt-[22%]"
          )}
        >
          {editing ? (
            <textarea
              ref={inputRef}
              className="nodrag nowheel w-full max-w-[80%] resize-none bg-transparent text-center outline-none placeholder:text-[var(--pg-muted)]"
              style={textStyle}
              rows={2}
              value={labelDraft}
              placeholder="Label…"
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commitLabel();
                  (e.target as HTMLTextAreaElement).blur();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setLabelDraft(d.label ?? "");
                  setEditing(false);
                }
              }}
            />
          ) : d.label ? (
            <span
              className="select-none whitespace-pre-wrap"
              style={textStyle}
            >
              {d.label}
            </span>
          ) : (
            <span
              className={clsx(
                "select-none text-[12px] italic transition-opacity",
                "opacity-0 group-hover:opacity-60"
              )}
              style={{ color: "var(--pg-muted)" }}
            >
              double-click to label
            </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" />

      {/* Action menu (kept outside the clipped body for diamond variant) */}
      <div
        ref={menuRef}
        className="absolute right-1 top-1 z-20 nodrag"
        style={{
          // Counter-scale so the controls stay readable at any zoom.
          transform: `scale(${1 / Math.max(0.5, zoom)})`,
          transformOrigin: "top right",
        }}
      >
        <button
          className="h-6 w-6 inline-flex items-center justify-center rounded-md bg-[var(--pg-bg)]/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:bg-[var(--pg-bg-elevated)] text-[var(--pg-muted)] hover:text-[var(--pg-fg)]"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          title="Shape options"
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-7 w-[240px] rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg)] p-2 shadow-[var(--pg-shadow)]">
            {/* Variant picker */}
            <div className="px-1 pb-1 text-[10.5px] uppercase tracking-[0.08em] text-[var(--pg-muted)]">
              Shape
            </div>
            <div className="grid grid-cols-4 gap-1">
              {VARIANTS.map((v) => (
                <button
                  key={v.value}
                  className={clsx(
                    "h-8 inline-flex items-center justify-center rounded-md border text-[var(--pg-fg)] transition-colors",
                    variant === v.value
                      ? "border-[var(--pg-accent)] bg-[var(--pg-accent-soft)]"
                      : "border-[var(--pg-border)] hover:bg-[var(--pg-bg-elevated)]"
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    updateNodeData(id, {
                      variant: v.value,
                    } as Partial<ShapeNodeData>);
                  }}
                  title={v.label}
                >
                  <v.Icon size={14} />
                </button>
              ))}
            </div>

            {/* Fill picker */}
            <div className="mt-2 px-1 pb-1 text-[10.5px] uppercase tracking-[0.08em] text-[var(--pg-muted)]">
              Fill
            </div>
            <div className="grid grid-cols-8 gap-1">
              {SHAPE_FILLS.map((c) => {
                const active = c === fill;
                const isTransparent = c === "transparent";
                return (
                  <button
                    key={c}
                    className={clsx(
                      "h-5 w-5 rounded-full ring-1 transition-transform hover:scale-110",
                      active
                        ? "ring-[var(--pg-accent)] ring-2"
                        : "ring-black/15 dark:ring-white/15"
                    )}
                    style={{
                      backgroundColor: isTransparent
                        ? "transparent"
                        : c,
                      backgroundImage: isTransparent
                        ? "linear-gradient(45deg, transparent 45%, var(--pg-muted) 45%, var(--pg-muted) 55%, transparent 55%)"
                        : undefined,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      updateNodeData(id, { fill: c } as Partial<ShapeNodeData>);
                    }}
                    title={isTransparent ? "No fill (frame)" : c}
                  />
                );
              })}
            </div>

            {/* Stroke picker */}
            <div className="mt-2 px-1 pb-1 text-[10.5px] uppercase tracking-[0.08em] text-[var(--pg-muted)]">
              Border
            </div>
            <div className="grid grid-cols-8 gap-1">
              {SHAPE_STROKES.map((c) => {
                const active = c === stroke;
                return (
                  <button
                    key={c}
                    className={clsx(
                      "h-5 w-5 rounded-full ring-1 transition-transform hover:scale-110",
                      active
                        ? "ring-[var(--pg-accent)] ring-2"
                        : "ring-black/15 dark:ring-white/15"
                    )}
                    style={{ backgroundColor: c }}
                    onClick={(event) => {
                      event.stopPropagation();
                      updateNodeData(id, { stroke: c } as Partial<ShapeNodeData>);
                    }}
                    title={c}
                  />
                );
              })}
            </div>

            {/* Border style picker */}
            <div className="mt-2 grid grid-cols-3 gap-1">
              {BORDER_STYLES.map((b) => {
                const active = borderStyle === b.value;
                return (
                  <button
                    key={b.value}
                    className={clsx(
                      "h-7 inline-flex items-center justify-center rounded-md border transition-colors",
                      active
                        ? "border-[var(--pg-accent)] bg-[var(--pg-accent-soft)]"
                        : "border-[var(--pg-border)] hover:bg-[var(--pg-bg-elevated)]"
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      updateNodeData(id, {
                        borderStyle: b.value,
                      } as Partial<ShapeNodeData>);
                    }}
                    title={b.label}
                  >
                    {/* Mini preview line in the active stroke colour */}
                    <span
                      aria-hidden
                      className="block w-3/4"
                      style={{
                        height: 0,
                        borderTop: `2px ${b.value} ${stroke}`,
                      }}
                    />
                  </button>
                );
              })}
            </div>

            {/* Text size + style toggles */}
            <div className="mt-3 px-1 pb-1 text-[10.5px] uppercase tracking-[0.08em] text-[var(--pg-muted)]">
              Text
            </div>
            <div className="flex items-center gap-1">
              <div className="grid flex-1 grid-cols-4 gap-1">
                {TEXT_SIZES.map((s) => (
                  <button
                    key={s.value}
                    className={clsx(
                      "h-7 inline-flex items-center justify-center rounded-md border text-[11px] font-medium text-[var(--pg-fg)] transition-colors",
                      textSize === s.value
                        ? "border-[var(--pg-accent)] bg-[var(--pg-accent-soft)]"
                        : "border-[var(--pg-border)] hover:bg-[var(--pg-bg-elevated)]"
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      updateNodeData(id, {
                        textSize: s.value,
                      } as Partial<ShapeNodeData>);
                    }}
                    title={`Text size ${s.label}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <button
                className={clsx(
                  "h-7 w-7 inline-flex items-center justify-center rounded-md border transition-colors",
                  textBold
                    ? "border-[var(--pg-accent)] bg-[var(--pg-accent-soft)] text-[var(--pg-fg)]"
                    : "border-[var(--pg-border)] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  updateNodeData(id, {
                    textBold: !textBold,
                  } as Partial<ShapeNodeData>);
                }}
                title="Bold"
              >
                <Bold size={12} />
              </button>
              <button
                className={clsx(
                  "h-7 w-7 inline-flex items-center justify-center rounded-md border transition-colors",
                  textItalic
                    ? "border-[var(--pg-accent)] bg-[var(--pg-accent-soft)] text-[var(--pg-fg)]"
                    : "border-[var(--pg-border)] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  updateNodeData(id, {
                    textItalic: !textItalic,
                  } as Partial<ShapeNodeData>);
                }}
                title="Italic"
              >
                <Italic size={12} />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-9 gap-1">
              {TEXT_COLORS.map((c) => {
                const active = c === textColor;
                return (
                  <button
                    key={c}
                    className={clsx(
                      "h-5 w-5 rounded-full ring-1 transition-transform hover:scale-110",
                      active
                        ? "ring-[var(--pg-accent)] ring-2"
                        : "ring-black/15 dark:ring-white/15"
                    )}
                    style={{ backgroundColor: c }}
                    onClick={(event) => {
                      event.stopPropagation();
                      updateNodeData(id, {
                        textColor: c,
                      } as Partial<ShapeNodeData>);
                    }}
                    title={`Text color ${c}`}
                  />
                );
              })}
            </div>

            <div className="my-2 border-t border-[var(--pg-border)]" />

            <button
              className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)] flex items-center gap-2"
              onClick={(event) => {
                event.stopPropagation();
                duplicateNode(id);
                setMenuOpen(false);
              }}
            >
              <Copy size={12} className="text-[var(--pg-muted)]" /> Duplicate
            </button>
            <button
              className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-red-500 hover:bg-red-500/10 flex items-center gap-2"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
                setMenuOpen(false);
              }}
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
