import { applyAnswer, initShield, isDepleted } from "./shield.js";

const cardKey = (c) => c?.uuid || c?.id;

function shuffle(list, random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Session order for a deck: due cards first, each group shuffled. */
export function sessionOrder(cards, isDue, random = Math.random) {
  const list = cards || [];
  return [...shuffle(list.filter(isDue), random), ...shuffle(list.filter((c) => !isDue(c)), random)].map(cardKey);
}

export function startCardRun(ids, { now = Date.now() } = {}) {
  return { order: [...ids], index: 0, shield: initShield(), rated: 0, correct: 0, streak: 0, best: 0, misses: [], reviewed: {}, startedAt: now, done: false };
}

export const currentCardId = (run) => run.order[run.index];

/**
 * One rating (SM-2 grade 1/3/4/5). Again (< 3) is a miss for the shield; a lost health chunk
 * re-queues the card at the end. `end` is true when the order is exhausted or health is gone.
 */
export function rateCard(run, grade, { nextReview = null } = {}) {
  if (!run || run.done) return { run, end: false };
  const id = currentCardId(run);
  const correct = grade >= 3;
  const shield = applyAnswer(run.shield, correct);
  const order = shield.last === "health" ? [...run.order, id] : run.order;
  const streak = correct ? run.streak + 1 : 0;
  const index = run.index + 1;
  const end = isDepleted(shield) || index >= order.length;
  return {
    run: {
      ...run,
      order,
      index,
      shield,
      rated: run.rated + 1,
      correct: run.correct + (correct ? 1 : 0),
      streak,
      best: Math.max(run.best, streak),
      misses: correct || run.misses.includes(id) ? run.misses : [...run.misses, id],
      reviewed: { ...run.reviewed, [id]: nextReview },
      done: end,
    },
    end,
  };
}

/** Leaving early: results when anything was rated, otherwise just close. */
export const cardRunEnd = (run) => (run?.rated ? "results" : "close");
