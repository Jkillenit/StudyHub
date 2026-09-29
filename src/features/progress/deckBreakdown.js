import { getDueCards, getWeakCards } from "../../study/sm2.js";

export const isMastered = (c) => (c.repetitions || 0) >= 3 && (c.easeFactor || 2.5) > 2.0;
export const isNew = (c) => !c.lastReview && !c.next_review && !(c.repetitions > 0);

/** Buckets are exclusive: mastered, weak, new, learning. */
export function deckBreakdown(cards) {
  const list = Array.isArray(cards) ? cards : [];
  const weakIds = new Set(getWeakCards(list).map((c) => c.id || c.uuid));
  const out = { total: list.length, mastered: 0, weak: 0, fresh: 0, learning: 0, due: getDueCards(list).length };
  for (const c of list) {
    if (isMastered(c)) out.mastered += 1;
    else if (weakIds.has(c.id || c.uuid)) out.weak += 1;
    else if (isNew(c)) out.fresh += 1;
    else out.learning += 1;
  }
  return out;
}

export function moduleBreakdown(course) {
  const cards = Array.isArray(course?.flashcards) ? course.flashcards : [];
  return (course?.modules || [])
    .map((m) => {
      const own = cards.filter((c) => c.moduleId === m.id);
      const b = deckBreakdown(own);
      return { id: m.id, title: m.title || m.label, ...b, pct: b.total ? Math.round((b.mastered / b.total) * 100) : 0 };
    })
    .filter((r) => r.total > 0);
}
