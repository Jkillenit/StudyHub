import { EXAM_SCHEDULE } from "../study/sm2.js";
import { sessionOrder } from "./cardRun.js";

/** Exam ready % at which the student counts as ready for the exam. */
export const EXAM_READY_TARGET = 80;
export const EXAM_SESSION_EVENT = "studyhub-exam-session";

const NEXT_MIN_CARDS = 5;
const NEXT_MAX_CARDS = 20;
const DEFAULT_SECONDS_PER_CARD = 10;

const cardKey = (c) => c?.uuid || c?.id;

/** Latest rating counts toward exam ready % (same rule as sm2 examReadyPercent). */
export const isExamReady = (card) => card.lastGrade != null && card.lastGrade >= EXAM_SCHEDULE.readyGrade;

/** An exam's cards: those in `moduleIds`, or every card when the list is empty. */
export function cardsInScope(cards, moduleIds) {
  const list = Array.isArray(cards) ? cards : [];
  if (!moduleIds?.length) return list;
  const set = new Set(moduleIds);
  return list.filter((c) => set.has(c.moduleId));
}

/**
 * Card ids for an exam session: due cards first (shuffled, at most `max`), topped up to `min` with
 * not-ready cards (never rated first, then lowest grade). A scope under `min` runs whole; empty gives [].
 */
export function pickExamCards(cards, exam, { isDue, max = 20, min = 10, random = Math.random } = {}) {
  const scope = cardsInScope(cards, exam?.moduleIds);
  if (scope.length < min) return sessionOrder(scope, isDue, random);
  const picked = sessionOrder(scope.filter(isDue), () => true, random).slice(0, max);
  if (picked.length >= min) return picked;
  const taken = new Set(picked);
  const topUp = scope
    .filter((c) => !taken.has(cardKey(c)) && !isExamReady(c))
    .sort((a, b) => (a.lastGrade ?? -1) - (b.lastGrade ?? -1))
    .slice(0, min - picked.length)
    .map(cardKey);
  return [...picked, ...topUp];
}

/** Nova's opening line key and its facts. */
export function examOpening({ title, daysUntil, total, due, readyPct }) {
  const key = daysUntil === 0 ? "examOpenToday" : daysUntil === 1 ? "examOpenTomorrow" : "examOpen";
  return { key, vars: { title, days: daysUntil, total, due, ready: readyPct } };
}

/** Nova's closing line key: ready at the target, up when ready % rose, flat otherwise. */
export function examEnd({ title, before, after }) {
  const key = after >= EXAM_READY_TARGET ? "examEndReady" : after > before ? "examEndUp" : "examEndFlat";
  return { key, vars: { title, before, after } };
}

/** What to do next, for the results screen. Exam day comes first: the day-before pass is already past. */
export function examNextStep({ readyPct, daysUntil, notReady, secondsPerCard }) {
  if (daysUntil === 0) return { kind: "today", text: "Exam today. Quick pass on misses only." };
  if (readyPct >= EXAM_READY_TARGET) return { kind: "ready", text: "Exam-ready. One light pass the day before." };
  const cards = Math.min(NEXT_MAX_CARDS, Math.max(NEXT_MIN_CARDS, Math.ceil(notReady / Math.max(1, daysUntil))));
  const pace = secondsPerCard > 0 ? secondsPerCard : DEFAULT_SECONDS_PER_CARD;
  const minutes = Math.max(1, Math.ceil((cards * pace) / 60));
  return { kind: "next", cards, minutes, text: `Next: tomorrow, ~${cards} cards (${minutes} min)` };
}

/** `{ phase: "open" | "end", key, vars }`; Nova says it (companion/hooks/useNovaExamSession.js). */
export function emitExamSession(detail) {
  window.dispatchEvent(new CustomEvent(EXAM_SESSION_EVENT, { detail }));
}
