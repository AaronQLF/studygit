"use client";

import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { useStore } from "@/lib/store";
import { NOTE_COLORS } from "@/lib/defaults";
import type { NoteNodeData } from "@/lib/types";

export function NoteNode({ id, data }: NodeProps) {
  const d = data as unknown as NoteNodeData;
  const updateNodeData = useStore((s) => s.updateNodeData);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(d.text);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setText(d.text);
  }, [d.text, editing]);

  useEffect(() => {
    if (!editing) return;
    const t = ref.current;
    if (!t) return;
    t.focus();
    const pos = t.value.length;
    t.setSelectionRange(pos, pos);
  }, [editing]);

  const commit = () => {
    if (text !== d.text) {
      updateNodeData(id, { text } as Partial<NoteNodeData>);
    }
    setEditing(false);
  };

  const onBodyClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (editing) return;
    event.stopPropagation();
    setEditing(true);
  };

  return (
    <NodeShell
      id={id}
      bare
      menuContent={
        <div className="px-1">
          <div className="px-1 pb-1 text-[11px] text-[var(--pg-muted)]">
            Color
          </div>
          <div className="grid grid-cols-6 gap-1">
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                className="nodrag h-5 w-5 rounded-full ring-1 ring-black/10 transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
                onClick={(e) => {
                  e.stopPropagation();
                  updateNodeData(id, { color: c } as Partial<NoteNodeData>);
                }}
              />
            ))}
          </div>
        </div>
      }
    >
      <div
        className="relative w-[232px] min-h-[132px] overflow-hidden rounded-lg p-3.5 shadow-[var(--pg-shadow-sm)] ring-1 ring-black/5 transition-transform duration-150 ease-out will-change-transform group-hover:-translate-y-[1px] group-hover:shadow-[var(--pg-shadow)]"
        style={{ backgroundColor: d.color }}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-[#c89a3a]" />
        {editing ? (
          <textarea
            ref={ref}
            className="pg-serif nodrag nowheel w-full min-h-[104px] resize-none bg-transparent outline-none text-[13.5px] leading-snug text-zinc-900 placeholder:text-zinc-700/60"
            value={text}
            placeholder="Start writing..."
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                commit();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
          />
        ) : (
          <div
            className="pg-serif cursor-text min-h-[104px] text-[13.5px] leading-snug text-zinc-900 whitespace-pre-wrap"
            onClick={onBodyClick}
          >
            {d.text || (
              <span className="italic text-zinc-700/60">Click to write…</span>
            )}
          </div>
        )}
        <span className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 border-l-[16px] border-l-transparent border-t-[16px] border-t-black/15" />
      </div>
    </NodeShell>
  );
}
