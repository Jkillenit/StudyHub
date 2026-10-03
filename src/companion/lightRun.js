import { sm2, getDueCards, localDateString } from "../study/sm2.js";
import { gradeTyped } from "../features/practice/practiceTest.js";
import { normTerm } from "../features/practice/questionPool.js";
import { shortCourse } from "../features/dashboard/courseLabel.js";

export const RUN_MODES = [
  { id: "quick", label: "QUICK RUN", blurb: "5–10 due cards. No timer." },
  { id: "streak", label: "STREAK RUN", blurb: "Keep going until your health runs out." },
  { id: "weak", label: "WEAK SPOTS", blurb: "Your 10 shakiest cards. Hints encouraged." },
  { id: "clock", label: "BEAT THE CLOCK", blurb: "60 seconds, multiple choice, speed bonus." },
];

export const CLOCK_SECONDS = 60;
const MIN_MC = 4;

export const cardKey = (c) => c?.uuid || c?.id;

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Every usable card for a deck ("all" or a course id), tagged with its course. */
export function deckCards(courses, deckId) {
  const out = [];
  for (const c of courses || []) {
    if (deckId !== "all" && c.id !== deckId) continue;
    for (const card of c.flashcards || []) {
      if (!String(card?.front || "").trim() || !String(card?.back || "").trim()) continue;
      out.push({
        ...card,
        courseId: c.id,
        courseUuid: c.uuid || c.id,
        courseName: c.name,
        courseLabel: (c.courseCode && shortCourse(c.courseCode)) || c.name,
      });
    }
  }
  return out;
}

const ease = (c) => (c.easeFactor == null ? 2.5 : c.easeFactor);

/** Cards for a run, in play order. Streak and clock runs cycle through the returned list. */
export function pickCards(cards, mode) {
  if (!cards.length) return [];
  if (mode === "quick") {
    const due = shuffle(getDueCards(cards));
    if (due.length >= 5) return due.slice(0, 10);
    const dueKeys = new Set(due.map(cardKey));
    const filler = cards.filter((c) => !dueKeys.has(cardKey(c))).sort((a, b) => ease(a) - ease(b));
    return shuffle([...due, ...filler.slice(0, Math.max(0, 5 - due.length))]);
  }
  if (mode === "weak") {
    const ranked = [...cards].sort((a, b) => {
      const reviewed = (c) => (c.lastReview || c.repetitions ? 0 : 1);
      return reviewed(a) - reviewed(b) || ease(a) - ease(b) || (a.repetitions || 0) - (b.repetitions || 0);
    });
    return shuffle(ranked.slice(0, 10));
  }
  const due = new Set(getDueCards(cards).map(cardKey));
  return cards
    .map((c) => ({ c, w: (ease(c) < 2.3 ? 2 : 0) + (due.has(cardKey(c)) ? 1 : 0) + Math.random() * 1.5 }))
    .sort((a, b) => b.w - a.w)
    .map((x) => x.c);
}

export function multiplier(streak) {
  if (streak >= 10) return 3;
  if (streak >= 6) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}

/** Points for one correct answer; `streak` is the streak before this answer. */
export function pointsFor({ streak, hint = false, partial = false, elapsedMs = null }) {
  let pts = 100 * multiplier(streak);
  if (hint) pts *= 0.5;
  if (partial) pts *= 0.75;
  if (elapsedMs != null) pts += Math.max(0, Math.round(50 - elapsedMs / 100));
  return Math.round(pts);
}

/** SM-2 quality for each outcome. */
export function sm2Grade({ correct, hint, partial }) {
  if (!correct) return 1;
  if (partial) return 3;
  if (hint) return 4;
  return 5;
}

const isShort = (text) => text.length <= 40 && text.split(/\s+/).length <= 5;

export function answerType(card, poolSize, mode, index) {
  if (mode === "clock") return "mc";
  const short = isShort(String(card.back));
  if (poolSize < MIN_MC) return short ? "typed" : "flip";
  const slot = index % 4;
  if (slot === 1 && short) return "typed";
  if (slot === 2) return "flip";
  return "mc";
}

function distractors(card, pool) {
  const target = String(card.back).length;
  const want = normTerm(card.back);
  const seen = new Set([want]);
  const scored = [];
  for (const p of pool) {
    const n = normTerm(p.back);
    if (cardKey(p) === cardKey(card) || seen.has(n)) continue;
    seen.add(n);
    const len = String(p.back).length;
    const lenScore = 1 - Math.abs(len - target) / Math.max(len, target, 1);
    scored.push({ text: p.back, score: lenScore + (p.courseId === card.courseId ? 0.6 : 0) + Math.random() * 0.5 });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.text);
}

export function buildQuestion(card, pool, mode, index) {
  let type = answerType(card, pool.length, mode, index);
  const q = { card, key: `${cardKey(card)}#${index}`, prompt: card.front, answer: card.back, type };
  if (type === "mc") {
    const wrong = distractors(card, pool);
    if (wrong.length < MIN_MC - 1) {
      type = isShort(String(card.back)) ? "typed" : "flip";
      return { ...q, type };
    }
    const options = shuffle([card.back, ...wrong]);
    return { ...q, options, answerIndex: options.indexOf(card.back) };
  }
  return q;
}

/** Typed answers: exact counts fully, a small typo counts as "partial". */
export function checkTyped(input, answer) {
  const verdict = gradeTyped(input, answer);
  return { correct: !!verdict, partial: verdict === "close" };
}

/** A hint that helps without giving the answer away. */
export function hintFor(q) {
  if (q.type === "mc") {
    const wrong = q.options.map((_, i) => i).filter((i) => i !== q.answerIndex);
    return { eliminate: shuffle(wrong).slice(0, 2) };
  }
  const words = String(q.answer).trim().split(/\s+/);
  const first = words[0].slice(0, Math.max(2, Math.ceil(words[0].length / 3)));
  return { text: `Starts with "${first}…" (${words.length} word${words.length === 1 ? "" : "s"})`, first };
}

/** New SM-2 fields for a reviewed card, in the shape course state uses. */
export function reviewCard(card, grade) {
  const r = sm2(card, grade);
  return {
    easeFactor: r.easeFactor,
    intervalDays: r.intervalDays,
    repetitions: r.repetitions,
    next_review: r.nextReview,
    lastReview: localDateString(),
    lastGrade: grade,
  };
}

/** XP award parts for a finished run (see XP_AWARDS). */
export function runAwards({ correct, answered }) {
  if (!answered) return [];
  return [
    ["simCorrect", correct],
    ["simWrong", answered - correct],
    ["simRun", 1],
    ["simPerfect", answered >= 5 && correct === answered ? 1 : 0],
  ];
}

/** Earliest next review among the cards touched this run, as a friendly label. */
export function nextDueLabel(dates) {
  const sorted = dates.filter(Boolean).sort();
  if (!sorted.length) return null;
  const today = localDateString();
  const d = sorted[0];
  if (d <= today) return "today";
  const [y, m, day] = d.split("-").map(Number);
  const diff = Math.round((new Date(y, m - 1, day) - new Date(`${today}T00:00:00`)) / 86400000);
  if (diff === 1) return "tomorrow";
  return `in ${diff} days`;
}
