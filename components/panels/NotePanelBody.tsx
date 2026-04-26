"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { NOTE_COLORS } from "@/lib/defaults";
import { useStore } from "@/lib/store";
import type { CanvasNode, NoteNodeData } from "@/lib/types";

export function NotePanelBody({ node }: { node: CanvasNode }) {
  const data = node.data as NoteNodeData;
  const updateNodeData = useStore((s) => s.updateNodeData);
  const [noteText, setNoteText] = useState(data.text);
  const [noteColor, setNoteColor] = useState(data.color);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const el = noteRef.current;
      if (!el) return;
      el.focus();
      const pos = el.value.length;
      el.setSelectionRange(pos, pos);
    }, 120);
    return () => clearTimeout(timer);
  }, [node.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      updateNodeData(node.id, {
        text: noteText,
        color: noteColor,
      } as Partial<NoteNodeData>);
    }, 220);
    return () => clearTimeout(timer);
  }, [noteColor, noteText, node.id, updateNodeData]);

  return (
    <section className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-2xl items-center justify-center px-6 py-10">
        <div
          className="relative w-full rounded-xl p-10 shadow-[0_30px_80px_rgba(0,0,0,0.45)] ring-1 ring-black/10 transition-colors duration-200"
          style={{ backgroundColor: noteColor }}
        >
          <textarea
            ref={noteRef}
            className="nowheel w-full min-h-[55vh] resize-none bg-transparent text-[17px] leading-[1.65] text-zinc-900 placeholder:text-zinc-700/50 outline-none font-serif"
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="Start writing…"
          />
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-black/10 pt-3">
            <div className="flex flex-wrap gap-1.5">
              {NOTE_COLORS.map((color) => (
                <button
                  key={color}
                  className={clsx(
                    "h-5 w-5 rounded-full border border-black/20 transition-transform duration-150 ease-out hover:scale-110",
                    noteColor === color &&
                      "ring-2 ring-black/40 ring-offset-1 ring-offset-transparent"
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => setNoteColor(color)}
                  aria-label={`Note color ${color}`}
                />
              ))}
            </div>
            <span className="text-[11px] font-mono text-zinc-900/55">
              {noteText.trim() ? noteText.trim().split(/\s+/).length : 0}{" "}
              {noteText.trim().split(/\s+/).length === 1 ? "word" : "words"}
              {" · "}
              {noteText.length} {noteText.length === 1 ? "char" : "chars"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
