// Cross-deck study aggregation for the Today view: every due card in
// every workspace, plus the streak-day helper. Pure functions over the
// node list so the header badge, the dock badge, and the overlay all
// agree on what "due" means.

import { isDue } from "./flashcards";
import type { CanvasNode, Flashcard, FlashcardsNodeData } from "./types";

export type DueCardRef = {
  nodeId: string;
  workspaceId: string;
  deckTitle: string;
  card: Flashcard;
};

/** Every due card across all decks/workspaces, most-overdue first. */
export function collectDueCards(
  nodes: CanvasNode[],
  now: number = Date.now()
): DueCardRef[] {
  const out: DueCardRef[] = [];
  for (const node of nodes) {
    if (node.data.kind !== "flashcards") continue;
    const data = node.data as FlashcardsNodeData;
    for (const card of data.cards ?? []) {
      if (!isDue(card, now)) continue;
      out.push({
        nodeId: node.id,
        workspaceId: node.workspaceId,
        deckTitle: data.title || "Untitled deck",
        card,
      });
    }
  }
  out.sort((a, b) => a.card.dueAt - b.card.dueAt);
  return out;
}

export function totalDueCount(
  nodes: CanvasNode[],
  now: number = Date.now()
): number {
  let count = 0;
  for (const node of nodes) {
    if (node.data.kind !== "flashcards") continue;
    for (const card of (node.data as FlashcardsNodeData).cards ?? []) {
      if (isDue(card, now)) count += 1;
    }
  }
  return count;
}

/** Local-timezone day stamp (YYYY-MM-DD), optionally offset by days. */
export function localDayString(offsetDays = 0, now: number = Date.now()): string {
  const d = new Date(now + offsetDays * 86_400_000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
