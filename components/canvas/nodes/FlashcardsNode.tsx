"use client";

import type { NodeProps } from "@xyflow/react";
import { GraduationCap, Layers, Play, Sparkles } from "lucide-react";
import { NodeShell } from "./NodeShell";
import { EditableTitle } from "@/components/ui/EditableTitle";
import { useStore } from "@/lib/store";
import { deckStats, nextDueLabel } from "@/lib/flashcards";
import type { FlashcardsNodeData } from "@/lib/types";

export function FlashcardsNode({ id, data }: NodeProps) {
  const d = data as unknown as FlashcardsNodeData;
  const updateNodeData = useStore((s) => s.updateNodeData);
  const openPanel = useStore((s) => s.openPanel);

  const cards = d.cards ?? [];
  const stats = deckStats(cards);
  const nextDue = nextDueLabel(cards);

  return (
    <NodeShell
      id={id}
      className="w-[300px]"
      accentColor="var(--pg-study)"
      WatermarkIcon={Layers}
      label="Flashcards"
      compactTitle={d.title || "Untitled deck"}
      actions={
        <button
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          onClick={() => openPanel(id)}
          title="Open deck"
        >
          <Play size={10} /> Study
        </button>
      }
    >
      <div className="px-4 pt-2.5 pb-3.5" onDoubleClick={() => openPanel(id)}>
        <EditableTitle
          value={d.title}
          onChange={(next) =>
            updateNodeData(id, { title: next } as Partial<FlashcardsNodeData>)
          }
          placeholder="Untitled deck"
          className="pg-serif mb-2 text-[19px] font-semibold leading-tight tracking-[-0.005em] text-[var(--pg-fg)]"
        />

        {stats.total === 0 ? (
          <div className="flex items-start gap-2 text-[12.5px] text-[var(--pg-muted)]">
            <Sparkles size={13} className="mt-0.5 shrink-0" />
            <span>
              Empty deck. Open it to write cards or generate them with AI from
              your highlights and pages.
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
            {stats.due > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pg-study-soft)] px-2 py-0.5 font-medium text-[var(--pg-study)]">
                <GraduationCap size={10} />
                {stats.due} due
              </span>
            ) : (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 ">
                All caught up{nextDue ? ` · next ${nextDue}` : ""}
              </span>
            )}
            <span className="rounded-full bg-[var(--pg-bg-subtle)] px-2 py-0.5 text-[var(--pg-fg-soft)]">
              {stats.total} {stats.total === 1 ? "card" : "cards"}
            </span>
            {stats.fresh > 0 ? (
              <span className="rounded-full bg-[var(--pg-bg-subtle)] px-2 py-0.5 text-[var(--pg-fg-soft)]">
                {stats.fresh} new
              </span>
            ) : null}
          </div>
        )}
      </div>
    </NodeShell>
  );
}
