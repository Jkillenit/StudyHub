/**
 * SM-2 spaced repetition algorithm.
 * grade 5 = Know It perfectly
 * grade 0 = Complete blackout (Again)
 */
export function sm2(card, grade) {
  let {
    easeFactor = 2.5,
    intervalDays = 0,
    repetitions = 0,
  } = card;

  if (grade < 3) {
    // Failed — reset, review tomorrow
    repetitions = 0;
    intervalDays = 1;
  } else {
    // Passed
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
    repetitions += 1;
  }

  // Update ease factor — min 1.3
  easeFactor = Math.max(
    1.3,
    easeFactor + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)
  );

  // Calculate next review date
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + intervalDays);

  return {
    easeFactor,
    intervalDays,
    repetitions,
    nextReview: nextReview.toISOString().split("T")[0],
  };
}

/**
 * Get cards due for review today.
 * Filters a cards array by next_review <= today.
 */
export function getDueCards(cards) {
  const today = new Date().toISOString().split("T")[0];
  return cards.filter((c) => !c.next_review || c.next_review <= today);
}

/**
 * Get days until next review for a card.
 * Returns 0 if due today or overdue.
 */
export function daysUntilReview(card) {
  if (!card.next_review) return 0;
  const today = new Date();
  const next = new Date(card.next_review);
  const diff = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

/**
 * Calculate mastery percentage for a set
 * of cards. A card is "mastered" when
 * repetitions >= 3 and easeFactor > 2.0
 */
export function masteryPercent(cards) {
  if (!cards?.length) return 0;
  const mastered = cards.filter(
    (c) => (c.repetitions || 0) >= 3 && (c.easeFactor || 2.5) > 2.0
  ).length;
  return Math.round((mastered / cards.length) * 100);
}
