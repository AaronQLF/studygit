"use client";

// Inline Accept / Reject card for a single buddy-proposed edit. Renders
// alongside the assistant turn that emitted the suggestion. Accepting
// dispatches `updateNodeData` against the resolved target node and
// optionally opens the node so the user can see the result; rejecting
// just dismisses the card. State is component-local so the same turn
// can be re-rendered without losing the user's accept/reject choice
// for the session, and a confirmation toast is pushed on success so
// the change is visible (and clearly attributable to the buddy).

import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Sparkles,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useToastStore } from "@/components/ui/Toast";
import {
  buildEditPatch,
  previewContent,
  resolveEditTarget,
  type EditSuggestion,
} from "@/lib/buddy-edits";
import type { AnyNodeData, CanvasNode } from "@/lib/types";

type AcceptedSnapshot = {
  nodeId: string;
  before: AnyNodeData;
  after: AnyNodeData;
};

export function EditSuggestionCard({
  suggestion,
}: {
  suggestion: EditSuggestion;
}) {
  const focusedNodeId = useStore((s) => s.focusedNodeId);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const nodes = useStore((s) => s.nodes);
  const updateNodeData = useStore((s) => s.updateNodeData);
  const openPanel = useStore((s) => s.openPanel);
  const pushToast = useToastStore((s) => s.push);

  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "accepted"; snapshot: AcceptedSnapshot }
    | { state: "rejected" }
    | { state: "error"; message: string }
  >({ state: "idle" });

  // Resolve "current" against the live focus state. We re-derive on
  // every render so the card always reflects what would happen if the
  // user clicked Accept *right now* — important because the user may
  // change focus between the buddy emitting the suggestion and them
  // deciding to accept.
  const resolved = useMemo(
    () =>
      resolveEditTarget(
        suggestion.target,
        focusedNodeId ?? selectedNodeId ?? null,
        nodes
      ),
    [suggestion.target, focusedNodeId, selectedNodeId, nodes]
  );

  const preview = useMemo(() => previewContent(suggestion), [suggestion]);

  const accept = () => {
    const node = resolved.node;
    if (!node) {
      setStatus({
        state: "error",
        message:
          suggestion.target === "current"
            ? "No editable page is focused — open a Page or Note first."
            : `Couldn't find the target node (${suggestion.target}).`,
      });
      return;
    }
    const patch = buildEditPatch(suggestion, node);
    if (!patch) {
      setStatus({
        state: "error",
        message: `“${describeKind(node)}” isn't an editable target.`,
      });
      return;
    }
    const before = node.data;
    const after = { ...before, ...patch } as AnyNodeData;
    updateNodeData(node.id, patch);
    setStatus({
      state: "accepted",
      snapshot: { nodeId: node.id, before, after },
    });
    pushToast(
      {
        message: `Applied: ${suggestion.title || "buddy edit"}`,
        actionLabel: "Open",
        onAction: () => openPanel(node.id),
      },
      4500
    );
  };

  const reject = () => setStatus({ state: "rejected" });

  const undo = () => {
    if (status.state !== "accepted") return;
    const { nodeId, before } = status.snapshot;
    // Push the entire prior data shape back as the patch. updateNodeData
    // does a shallow merge, so we have to overwrite every field that
    // could have changed; passing the full object is the simplest way
    // to make undo lossless.
    updateNodeData(nodeId, before as Partial<AnyNodeData>);
    setStatus({ state: "idle" });
  };

  return (
    <div
      className={clsx(
        "rounded-md border bg-[var(--pg-bg-elevated)] px-2.5 py-2 text-[12.5px] shadow-sm",
        status.state === "accepted"
          ? "border-emerald-500/40"
          : status.state === "rejected"
            ? "border-[var(--pg-border)] opacity-60"
            : status.state === "error"
              ? "border-red-500/40"
              : "border-[var(--pg-accent)]/40"
      )}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles size={11} className="shrink-0 text-[var(--pg-accent)]" />
        <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[var(--pg-muted)]">
          Proposed edit
        </span>
        {suggestion.title ? (
          <span className="truncate text-[12px] font-medium text-[var(--pg-fg)]">
            {suggestion.title}
          </span>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--pg-border)] px-1.5 py-0 text-[10px] text-[var(--pg-muted)]">
          {suggestion.mode}
          <ArrowRight size={9} />
          {resolved.node ? (
            <button
              type="button"
              onClick={() => resolved.node && openPanel(resolved.node.id)}
              className="inline-flex items-center gap-0.5 hover:text-[var(--pg-fg)]"
              title="Open target node"
            >
              <span className="max-w-[120px] truncate">
                {targetTitle(resolved.node)}
              </span>
              <ExternalLink size={9} />
            </button>
          ) : (
            <span className="text-red-500">target missing</span>
          )}
        </span>
      </div>

      <div className="mb-1.5 line-clamp-4 whitespace-pre-wrap break-words rounded-sm bg-[var(--pg-bg-subtle)] px-2 py-1 text-[12px] text-[var(--pg-fg-soft)]">
        {preview}
      </div>

      {suggestion.reason ? (
        <div className="mb-1.5 text-[11px] italic text-[var(--pg-muted)]">
          {suggestion.reason}
        </div>
      ) : null}

      {status.state === "error" ? (
        <div className="mb-1.5 inline-flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
          <TriangleAlert size={11} /> {status.message}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-1.5">
        {status.state === "idle" || status.state === "error" ? (
          <>
            <button
              type="button"
              onClick={reject}
              className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]"
            >
              <X size={11} /> Reject
            </button>
            <button
              type="button"
              onClick={accept}
              disabled={!resolved.node}
              className={clsx(
                "inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium",
                resolved.node
                  ? "bg-[var(--pg-accent)] text-white hover:opacity-90"
                  : "bg-[var(--pg-bg-subtle)] text-[var(--pg-muted)]"
              )}
            >
              <Check size={11} /> Accept
            </button>
          </>
        ) : status.state === "accepted" ? (
          <>
            <span className="mr-1 inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
              <Check size={11} /> Applied
            </span>
            <button
              type="button"
              onClick={undo}
              className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]"
            >
              <Undo2 size={11} /> Undo
            </button>
          </>
        ) : (
          <span className="text-[11px] text-[var(--pg-muted)]">Rejected</span>
        )}
      </div>
    </div>
  );
}

function targetTitle(node: CanvasNode): string {
  const data = node.data;
  if (data.kind === "page" || data.kind === "blog") return data.title || "Untitled page";
  if (data.kind === "note") {
    const text = (data.text ?? "").trim();
    return text.length > 30 ? `${text.slice(0, 30)}…` : text || "Note";
  }
  if (data.kind === "link") return data.extractedTitle || data.title || data.url || "Link";
  return data.kind;
}

function describeKind(node: CanvasNode): string {
  const k = node.data.kind;
  if (k === "page") return "Page";
  if (k === "note") return "Note";
  if (k === "link") return "Link";
  if (k === "pdf") return "PDF";
  if (k === "image") return "Image";
  if (k === "ai") return "AI conversation";
  if (k === "blog") return "Blog";
  return "Node";
}
