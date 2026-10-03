import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadFlashcardDeck, persistFlashcardDeck, resetFlashcardDeckToSeed } from "./flashcardPersistence.js";

const UPDATED = "studyhub-flashcards-updated";

export const cardKey = (c) => c?.uuid || c?.id;

const hasText = (c) => String(c?.front || "").trim() && String(c?.back || "").trim();

function uid() {
  return "fc_" + Math.random().toString(36).slice(2, 12);
}

/**
 * A deck's cards and edits, in one of two storage modes:
 *  - user course (onSaveCards given): cards come from props, changes go back through onSaveCards.
 *  - built-in OM 300 deck: cards and SM-2 progress live in localStorage; every write announces
 *    `studyhub-flashcards-updated` so the deck list, the session and the quiz stay in step.
 */
export function useDeckCards({ cards: externalCards = null, onSaveCards = null } = {}) {
  const isUserDeck = typeof onSaveCards === "function";
  const [localCards, setLocalCards] = useState(() => (isUserDeck ? null : loadFlashcardDeck()));

  useEffect(() => {
    if (isUserDeck) return undefined;
    const reload = () => setLocalCards(loadFlashcardDeck());
    window.addEventListener(UPDATED, reload);
    return () => window.removeEventListener(UPDATED, reload);
  }, [isUserDeck]);

  const cards = useMemo(
    () => (isUserDeck ? (Array.isArray(externalCards) ? externalCards : []).filter(hasText) : localCards || []),
    [isUserDeck, externalCards, localCards]
  );
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const commit = useCallback(
    (next) => {
      cardsRef.current = next;
      if (isUserDeck) {
        onSaveCards(next);
        return;
      }
      setLocalCards(next);
      persistFlashcardDeck(next);
      window.dispatchEvent(new CustomEvent(UPDATED));
    },
    [isUserDeck, onSaveCards]
  );

  const addCard = useCallback(
    (front, back, moduleId = null) =>
      commit([...cardsRef.current, { id: uid(), front, back, source: "manual", ...(moduleId ? { moduleId } : {}) }]),
    [commit]
  );

  const editCard = useCallback(
    (key, front, back) => commit(cardsRef.current.map((c) => (cardKey(c) === key ? { ...c, front, back } : c))),
    [commit]
  );

  const deleteCard = useCallback((key) => commit(cardsRef.current.filter((c) => cardKey(c) !== key)), [commit]);

  const restoreSeed = useCallback(() => {
    if (isUserDeck) return;
    if (!window.confirm("Replace your entire flashcard deck with the starter set? Custom cards will be removed.")) return;
    setLocalCards(resetFlashcardDeckToSeed());
    window.dispatchEvent(new CustomEvent(UPDATED));
  }, [isUserDeck]);

  return { cards, cardsRef, isUserDeck, commit, addCard, editCard, deleteCard, restoreSeed };
}
