"use client";

// "→ Flashcard" from the selection toolbar: turn the selected passage of
// a page into spaced-repetition cards with one click.
//
// Deck resolution: reuse the flashcards node already connected to this
// page by an edge if there is one; otherwise create a deck beside the
// page on the canvas and connect it. With AI configured the cards are
// generated from the exact excerpt (1–3 depending on length); without,
// we add a single card with the selection as the front so the student
// fills in the answer themselves.

import { useStore } from "@/lib/store";
import { hasAiCredentials, readAiSettings } from "@/lib/ai-settings";
import { generateCardsFromSources } from "@/lib/flashcards-generate";
import { newCard } from "@/lib/flashcards";
import type { Flashcard, FlashcardsNodeData } from "@/lib/types";

export type SelectionToCardsResult = {
  ok: boolean;
  message: string;
  deckNodeId?: string;
};

function cardCountFor(text: string): number {
  if (text.length < 240) return 1;
  if (text.length < 800) return 2;
  return 3;
}

export async function addFlashcardsFromSelection(opts: {
  pageNodeId: string;
  workspaceId: string;
  selectionText: string;
  pageTitle: string;
}): Promise<SelectionToCardsResult> {
  const { pageNodeId, workspaceId, pageTitle } = opts;
  const selectionText = opts.selectionText.replace(/\s+/g, " ").trim();
  if (!selectionText) return { ok: false, message: "Nothing selected" };

  const store = useStore.getState();
  const page = store.nodes.find((n) => n.id === pageNodeId);

  // 1. Find a deck already wired to this page…
  let deckId: string | null = null;
  for (const edge of store.edges) {
    if (edge.workspaceId !== workspaceId) continue;
    const otherId =
      edge.source === pageNodeId
        ? edge.target
        : edge.target === pageNodeId
          ? edge.source
          : null;
    if (!otherId) continue;
    const other = store.nodes.find((n) => n.id === otherId);
    if (other?.data.kind === "flashcards") {
      deckId = other.id;
      break;
    }
  }

  // 2. …or create one beside the page and connect it.
  if (!deckId) {
    const position = page
      ? {
          x: page.position.x + (page.width ?? 440) + 90,
          y: page.position.y,
        }
      : { x: 160, y: 160 };
    deckId = store.addNode(
      workspaceId,
      {
        kind: "flashcards",
        title: pageTitle ? `Cards from ${pageTitle}` : "Cards",
        cards: [],
      },
      position
    );
    store.addEdge(workspaceId, pageNodeId, deckId);
  }

  const appendCards = (cards: Flashcard[]) => {
    const fresh = useStore.getState();
    const deck = fresh.nodes.find((n) => n.id === deckId);
    if (!deck || deck.data.kind !== "flashcards") return false;
    const data = deck.data as FlashcardsNodeData;
    fresh.updateNodeData(deckId!, {
      cards: [...cards, ...(data.cards ?? [])],
    } as Partial<FlashcardsNodeData>);
    return true;
  };

  // 3. AI path: 1–3 cards generated from the exact excerpt.
  if (hasAiCredentials()) {
    const result = await generateCardsFromSources(
      [
        {
          sid: "s1",
          label: pageTitle || "Selection",
          locator: null,
          excerpt: selectionText,
          nodeId: pageNodeId,
          highlightId: null,
          page: null,
        },
      ],
      cardCountFor(selectionText),
      "Write cards strictly from this exact excerpt — do not bring in outside facts.",
      readAiSettings()
    );
    if (result.ok) {
      const cards = result.cards.map((c) => ({
        ...newCard(c.front, c.back, pageNodeId),
        ...(c.type === "cloze" ? { type: "cloze" as const } : {}),
      }));
      if (!appendCards(cards)) {
        return { ok: false, message: "Deck disappeared while generating" };
      }
      return {
        ok: true,
        deckNodeId: deckId,
        message: `Added ${cards.length} ${cards.length === 1 ? "card" : "cards"} to the deck`,
      };
    }
    // AI failed (network, provider) — fall through to the manual card so
    // the student's click still produces something.
  }

  // 4. Manual fallback: selection becomes the front, answer left blank.
  const front =
    selectionText.length > 300 ? `${selectionText.slice(0, 300)}…` : selectionText;
  if (!appendCards([newCard(front, "", pageNodeId)])) {
    return { ok: false, message: "Deck disappeared while adding the card" };
  }
  return {
    ok: true,
    deckNodeId: deckId,
    message: "Added a card — open the deck to write the answer",
  };
}
