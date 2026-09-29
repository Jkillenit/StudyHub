import { deckBreakdown } from "../progress/deckBreakdown.js";
import { daysFromToday } from "../dashboard/dateLabels.js";

/** Reviews a card typically needs before it is exam-ready, by SM-2 bucket. */
export const REVIEWS_TO_READY = { fresh: 4, weak: 3, learning: 2, mastered: 0.3 };
const DEFAULT_SECONDS_PER_CARD = 10;

export const scopeKey = (examUuid) => `studyGuide.scope.${examUuid}`;

export async function loadScope(examUuid) {
  if (!examUuid) return [];
  try {
    const raw = await window.studyHub?.db?.settings?.get?.(scopeKey(examUuid));
    const ids = JSON.parse(raw || "[]");
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export function saveScope(examUuid, moduleIds) {
  if (!examUuid) return;
  void window.studyHub?.db?.settings?.set?.({ key: scopeKey(examUuid), value: JSON.stringify(moduleIds || []) });
}

export function cardsInScope(cards, moduleIds) {
  const list = Array.isArray(cards) ? cards : [];
  if (!moduleIds?.length) return list;
  const set = new Set(moduleIds);
  return list.filter((c) => set.has(c.moduleId));
}

/**
 * Minutes of review left before a card set is exam-ready. Uses the student's own pace when
 * there is session history (clamped so one odd session can't skew it), else 10s per card.
 */
export function estimateExam(cards, { avgSecondsPerCard = null, examDate = null } = {}) {
  const b = deckBreakdown(cards);
  const pace = avgSecondsPerCard ? Math.min(Math.max(avgSecondsPerCard, 5), 40) : DEFAULT_SECONDS_PER_CARD;
  const reviews =
    b.fresh * REVIEWS_TO_READY.fresh +
    b.weak * REVIEWS_TO_READY.weak +
    b.learning * REVIEWS_TO_READY.learning +
    b.mastered * REVIEWS_TO_READY.mastered;
  const totalMinutes = Math.ceil((reviews * pace) / 60);
  const days = examDate ? daysFromToday(examDate) : null;
  const studyDays = days == null ? null : Math.max(days, 1);
  const readiness = b.total ? Math.round(((b.mastered + b.learning * 0.5) / b.total) * 100) : 0;
  return {
    ...b,
    pace,
    reviews: Math.round(reviews),
    totalMinutes,
    days,
    perDayMinutes: studyDays ? Math.ceil(totalMinutes / studyDays) : null,
    readiness,
  };
}

export function formatMinutes(min) {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
}
