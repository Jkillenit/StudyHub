import { loadJson, saveJson } from "../../lib/storage.js";
import { SEED_FLASHCARDS } from "./seedCards.js";

const KEY = "studyHub.v2.builtin.flashcards.v1";

function cloneSeed() {
  return SEED_FLASHCARDS.map((c) => ({ ...c }));
}

export function loadFlashcardDeck() {
  const data = loadJson(KEY, null);
  if (data?.cards?.length) {
    return data.cards.map((c) => {
      const kind = c.kind;
      const normalized =
        kind === "formula" || kind === "concept" || kind === "definition" ? kind : undefined;
      return {
        id: c.id,
        front: String(c.front ?? ""),
        back: String(c.back ?? ""),
        ...(normalized ? { kind: normalized } : {}),
      };
    });
  }
  return cloneSeed();
}

export function persistFlashcardDeck(cards) {
  saveJson(KEY, {
    cards: cards.map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      ...(c.kind ? { kind: c.kind } : {}),
    })),
  });
}

export function resetFlashcardDeckToSeed() {
  const cards = cloneSeed();
  persistFlashcardDeck(cards);
  return cards;
}
