import { loadJson, saveJson } from "../../lib/storage.js";
import { SEED_FLASHCARDS } from "./seedCards.js";

const KEY = "studyHub.v2.builtin.flashcards.v1";
const SM2_FIELDS = ["easeFactor", "intervalDays", "repetitions", "next_review", "lastReview"];

function cloneSeed() {
  return SEED_FLASHCARDS.map((c) => ({ ...c }));
}

function pickSm2(card) {
  const out = {};
  for (const field of SM2_FIELDS) {
    if (card?.[field] !== undefined && card?.[field] !== null) out[field] = card[field];
  }
  return out;
}

/** The built-in OM 300 deck lives in localStorage, including its SM-2 progress. */
export function loadFlashcardDeck() {
  const data = loadJson(KEY, null);
  if (data?.cards?.length) {
    return data.cards.map((c) => {
      const kind = c.kind;
      const normalized = kind === "formula" || kind === "concept" || kind === "definition" ? kind : undefined;
      return {
        id: c.id,
        front: String(c.front ?? ""),
        back: String(c.back ?? ""),
        ...(normalized ? { kind: normalized } : {}),
        ...pickSm2(c),
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
      ...pickSm2(c),
    })),
  });
}

export function resetFlashcardDeckToSeed() {
  const cards = cloneSeed();
  persistFlashcardDeck(cards);
  return cards;
}
