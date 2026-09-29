/** Local calendar date (YYYY-MM-DD). Review scheduling is by the student's day, not UTC. */
export function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * SM-2 spaced repetition algorithm.
 * grade 5 = Know It perfectly
 * grade 0 = Complete blackout (Again)
 */
export function sm2(card, grade) {
  let { easeFactor = 2.5, intervalDays = 0, repetitions = 0 } = card;

  if (grade < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
    repetitions += 1;
  }

  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + intervalDays);

  return {
    easeFactor,
    intervalDays,
    repetitions,
    nextReview: localDateString(nextReview),
  };
}

/** Cards due today or overdue (never-reviewed cards are due). */
export function getDueCards(cards) {
  const today = localDateString();
  return (cards || []).filter((c) => !c.next_review || c.next_review <= today);
}

/** Cards the student has struggled with: low ease, or reviewed but not yet retained. */
export function getWeakCards(cards) {
  return (cards || []).filter(
    (c) => (c.easeFactor != null && c.easeFactor < 2.3) || (c.lastReview && (c.repetitions || 0) === 0)
  );
}

/** Days until next review. Returns 0 if due today or overdue. */
export function daysUntilReview(card) {
  if (!card.next_review) return 0;
  const [y, m, d] = String(card.next_review).split("-").map(Number);
  const next = new Date(y, (m || 1) - 1, d || 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((next - today) / 86400000));
}

/** A card is "mastered" when repetitions >= 3 and easeFactor > 2.0. */
export function masteryPercent(cards) {
  if (!cards?.length) return 0;
  const mastered = cards.filter((c) => (c.repetitions || 0) >= 3 && (c.easeFactor || 2.5) > 2.0).length;
  return Math.round((mastered / cards.length) * 100);
}
