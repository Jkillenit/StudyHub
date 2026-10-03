/** Local calendar date (YYYY-MM-DD). Review scheduling is by the student's day, not UTC. */
export function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const EXAM_SCHEDULE = Object.freeze({
  /** Every exam card is reviewed at least once from this many days before the exam through exam day. */
  finalWindowDays: 2,
  /** Latest rating at or above this counts toward exam ready %. */
  readyGrade: 3,
});

const DAY_MS = 86400000;

/** Local day number. Bare YYYY-MM-DD strings are local dates, not UTC midnight. */
function dayNumber(value) {
  if (value == null || value === "") return null;
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (bare) return Date.UTC(+bare[1], +bare[2] - 1, +bare[3]) / DAY_MS;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
}

/** Calendar days from `now` to the exam: 0 on exam day, negative after it, null without a date. */
export function daysUntilExam(examDate, now = new Date()) {
  const exam = dayNumber(examDate);
  return exam == null ? null : exam - dayNumber(now);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * SM-2 spaced repetition algorithm.
 * grade 5 = Know It perfectly
 * grade 0 = Complete blackout (Again)
 *
 * With an upcoming `examDate`, the interval is capped at days until the exam − 1 (minimum 1) so the
 * card comes back before the exam. On exam day and after, scheduling is plain SM-2.
 */
export function sm2(card, grade, { examDate = null, now = new Date() } = {}) {
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

  const days = examDate ? daysUntilExam(examDate, now) : null;
  if (days != null && days > 0) intervalDays = Math.min(intervalDays, Math.max(1, days - 1));

  return {
    easeFactor,
    intervalDays,
    repetitions,
    nextReview: localDateString(addDays(now, intervalDays)),
  };
}

export const RATINGS = Object.freeze([
  { id: "again", label: "Again", grade: 1, key: "1" },
  { id: "hard", label: "Hard", grade: 3, key: "2" },
  { id: "good", label: "Good", grade: 4, key: "3" },
  { id: "easy", label: "Easy", grade: 5, key: "4" },
]);

export function intervalLabel(days, beforeExam = false) {
  return `${days} ${days === 1 ? "day" : "days"}${beforeExam ? " · before exam" : ""}`;
}

/** What each rating would schedule, for the rating buttons. Pure: calls sm2 without writing. */
export function previewIntervals(card, { examDate = null, now = new Date() } = {}) {
  return RATINGS.map((r) => {
    const days = sm2(card, r.grade, { examDate, now }).intervalDays;
    const beforeExam = !!examDate && days < sm2(card, r.grade, { now }).intervalDays;
    return { ...r, days, beforeExam, label: intervalLabel(days, beforeExam) };
  });
}

/**
 * Due today or overdue (never-reviewed cards are due). With an exam date, a card not reviewed since
 * the final window opened is also due once the window is open, whatever its next review date.
 */
export function isCardDue(card, { examDate = null, now = new Date() } = {}) {
  if (!card.next_review || card.next_review <= localDateString(now)) return true;
  const days = examDate ? daysUntilExam(examDate, now) : null;
  if (days == null || days < 0 || days > EXAM_SCHEDULE.finalWindowDays) return false;
  const windowStart = localDateString(addDays(now, days - EXAM_SCHEDULE.finalWindowDays));
  return !card.lastReview || card.lastReview < windowStart;
}

/** Cards due today or overdue. `examFor(card)` returns the exam date that governs a card, if any. */
export function getDueCards(cards, { examFor = null, now = new Date() } = {}) {
  return (cards || []).filter((c) => isCardDue(c, { examDate: examFor ? examFor(c) : null, now }));
}

/**
 * The nearest exam (today or later) whose scope covers the card. `exams` are { dueDate, moduleIds };
 * an empty moduleIds list covers the whole course.
 */
export function examForCard(card, exams, now = new Date()) {
  let best = null;
  let bestDays = Infinity;
  for (const exam of exams || []) {
    const days = daysUntilExam(exam.dueDate, now);
    if (days == null || days < 0 || days >= bestDays) continue;
    if (exam.moduleIds?.length && !exam.moduleIds.includes(card.moduleId)) continue;
    best = exam;
    bestDays = days;
  }
  return best;
}

/** Share of an exam's cards (0-100) whose latest rating is at least EXAM_SCHEDULE.readyGrade. */
export function examReadyPercent(cards) {
  if (!cards?.length) return 0;
  const ready = cards.filter((c) => c.lastGrade != null && c.lastGrade >= EXAM_SCHEDULE.readyGrade).length;
  return Math.round((ready / cards.length) * 100);
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
