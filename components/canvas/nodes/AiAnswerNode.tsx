"use client";

import { useMemo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Loader2, MessageSquare, Pencil, Sparkles, TriangleAlert } from "lucide-react";
import { NodeShell } from "./NodeShell";
import { EditableTitle } from "@/components/ui/EditableTitle";
import { useStore } from "@/lib/store";
import type { AiAnswerNodeData, AiTurn } from "@/lib/types";

function stripHtmlPreview(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// What the canvas card shows: an at-a-glance summary of the latest
// exchange. We pick the most recent user turn + the most recent assistant
// turn (which may be the in-flight one) so the card stays useful both
// before and during a run.
function latestExchange(turns: AiTurn[]): {
  lastUser: AiTurn | null;
  lastAssistant: AiTurn | null;
} {
  let lastUser: AiTurn | null = null;
  let lastAssistant: AiTurn | null = null;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (!lastAssistant && t.role === "assistant") lastAssistant = t;
    if (!lastUser && t.role === "user") lastUser = t;
    if (lastUser && lastAssistant) break;
  }
  return { lastUser, lastAssistant };
}

export function AiAnswerNode({ id, data }: NodeProps) {
  const d = data as unknown as AiAnswerNodeData;
  const updateNodeData = useStore((s) => s.updateNodeData);
  const openPanel = useStore((s) => s.openPanel);

  const { lastUser, lastAssistant } = useMemo(
    () => latestExchange(d.turns),
    [d.turns]
  );

  const exchangeCount = Math.ceil(d.turns.length / 2);
  const sourceCount = d.sources?.length ?? 0;
  const isRunning = d.turns.some((t) => t.status === "running");
  const hasError = d.turns.some((t) => t.status === "error");

  return (
    <NodeShell
      id={id}
      className="w-[440px]"
      accentColor="#5a2a6b"
      WatermarkIcon={Sparkles}
      label="Conversation"
      compactTitle={d.title || "Conversation"}
      actions={
        <button
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
          onClick={() => openPanel(id)}
          title="Open conversation"
        >
          <Pencil size={10} /> Open
        </button>
      }
    >
      <div
        className="px-4 pt-2.5 pb-3.5 max-h-[420px] overflow-y-auto"
        onDoubleClick={() => openPanel(id)}
      >
        <EditableTitle
          value={d.title}
          onChange={(next) =>
            updateNodeData(id, { title: next } as Partial<AiAnswerNodeData>)
          }
          placeholder="Untitled conversation"
          className="pg-serif mb-2 text-[20px] font-semibold leading-tight tracking-[-0.005em] text-[var(--pg-fg)]"
        />

        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-[var(--pg-muted)]">
          <StatusBadge
            isRunning={isRunning}
            hasError={hasError}
            empty={d.turns.length === 0}
          />
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pg-bg-subtle)] px-2 py-0.5 normal-case tracking-normal text-[var(--pg-fg-soft)]">
            <MessageSquare size={9} />
            {exchangeCount} {exchangeCount === 1 ? "exchange" : "exchanges"}
          </span>
          {sourceCount > 0 ? (
            <span className="rounded-full bg-[var(--pg-bg-subtle)] px-2 py-0.5 normal-case tracking-normal text-[var(--pg-fg-soft)]">
              {sourceCount} {sourceCount === 1 ? "source" : "sources"}
            </span>
          ) : null}
        </div>

        {d.turns.length === 0 ? (
          <div className="text-[13px] text-[var(--pg-muted)]">
            Empty. Open it, attach sources, and ask anything.
          </div>
        ) : (
          <ExchangePreview lastUser={lastUser} lastAssistant={lastAssistant} />
        )}
      </div>
    </NodeShell>
  );
}

function StatusBadge({
  isRunning,
  hasError,
  empty,
}: {
  isRunning: boolean;
  hasError: boolean;
  empty: boolean;
}) {
  if (isRunning) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pg-accent-soft)] px-2 py-0.5 normal-case tracking-normal text-[var(--pg-accent)]">
        <Loader2 size={10} className="animate-spin" />
        Running
      </span>
    );
  }
  if (hasError) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 normal-case tracking-normal text-red-500">
        <TriangleAlert size={10} />
        Error
      </span>
    );
  }
  if (empty) {
    return (
      <span className="rounded-full bg-[var(--pg-bg-subtle)] px-2 py-0.5 normal-case tracking-normal text-[var(--pg-fg-soft)]">
        Draft
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 normal-case tracking-normal text-emerald-600 dark:text-emerald-400">
      Active
    </span>
  );
}

function ExchangePreview({
  lastUser,
  lastAssistant,
}: {
  lastUser: AiTurn | null;
  lastAssistant: AiTurn | null;
}) {
  return (
    <div className="space-y-2">
      {lastUser ? (
        <div className="text-[12.5px] text-[var(--pg-fg-soft)]">
          <span className="mr-1 font-medium text-[var(--pg-muted)]">You:</span>
          <span className="line-clamp-2 inline">{lastUser.text}</span>
        </div>
      ) : null}
      {lastAssistant ? (
        lastAssistant.status === "error" ? (
          <div className="line-clamp-2 text-[12.5px] text-red-500">
            <span className="mr-1 font-medium">AI:</span>
            {lastAssistant.error ?? "failed"}
          </div>
        ) : lastAssistant.text ? (
          <div
            className="pg-prose pg-prose-preview text-[13px] text-[var(--pg-fg-soft)]"
            dangerouslySetInnerHTML={{
              __html: clampHtmlPreview(lastAssistant.text),
            }}
          />
        ) : (
          <div className="text-[12.5px] italic text-[var(--pg-muted)]">
            <span className="mr-1 font-medium">AI:</span>
            thinking…
          </div>
        )
      ) : null}
    </div>
  );
}

// Soft clamp the assistant HTML so the card doesn't grow unbounded when
// the model returns a long answer. Falls back to a plaintext slice when
// the HTML is short enough that clamping isn't necessary.
function clampHtmlPreview(html: string): string {
  const plain = stripHtmlPreview(html);
  if (plain.length <= 320) return html;
  // Long answer — show the first ~320 chars of stripped prose. Pills
  // inside that range would get cut off awkwardly, so we serve plaintext
  // for the preview and keep the full HTML behind the "Open" affordance.
  return `<p>${plain.slice(0, 320)}…</p>`;
}
