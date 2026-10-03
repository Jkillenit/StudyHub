import { applyAnswer, isDepleted } from "./shield.js";
import { buildQuestion, cardKey } from "../companion/lightRun.js";

/** Quick and weak runs have a fixed queue; streak and clock cycle through theirs. */
export const finiteMode = (mode) => mode === "quick" || mode === "weak";

/**
 * One quiz-run transition. Events:
 *  - `{ type: "answer", correct, partial, picked, points, fields }` (fields = the card's new SM-2 fields)
 *  - `{ type: "next" }` after an answer, `{ type: "skip" }` before one (ungraded), `{ type: "quit" }`
 * Returns `{ run, end }`; `end` is null, "results" (something was answered) or "close" (nothing was).
 */
export function quizStep(run, event, { now = Date.now() } = {}) {
  if (!run || run.summary) return { run, end: null };
  if (event.type === "quit") return { run, end: run.answered ? "results" : "close" };
  if (event.type === "answer") return run.result ? { run, end: null } : { run: answered(run, event), end: null };
  if (event.type === "next" && !run.result) return { run, end: null };
  if (event.type === "skip" && run.result) return { run, end: null };

  const outOfCards = finiteMode(run.mode) && run.index + 1 >= run.queue.length;
  const outOfTime = run.mode === "clock" && now >= run.endsAt;
  if (isDepleted(run.shield) || outOfCards || outOfTime) return { run, end: run.answered ? "results" : "close" };
  const index = run.index + 1;
  const card = run.queue[index % run.queue.length];
  return {
    run: { ...run, index, q: buildQuestion(card, run.pool, run.mode, index), hint: null, selected: null, revealed: false, result: null, qStartedAt: now },
    end: null,
  };
}

/** A graded answer: shield, score, streak, misses (once per card), and a lost health chunk re-queues the card. */
function answered(run, { correct, partial = false, picked = null, points = 0, fields }) {
  const card = run.q.card;
  const key = cardKey(card);
  const refresh = (c) => (cardKey(c) === key ? { ...c, ...fields } : c);
  const shield = applyAnswer(run.shield, correct);
  let queue = run.queue.map(refresh);
  if (shield.last === "health" && finiteMode(run.mode)) queue = [...queue, queue[run.index % queue.length]];
  const streak = correct ? run.streak + 1 : 0;
  const courseUuids = new Set(run.courseUuids);
  courseUuids.add(card.courseUuid);
  return {
    ...run,
    queue,
    pool: run.pool.map(refresh),
    score: run.score + points,
    streak,
    best: Math.max(run.best, streak),
    answered: run.answered + 1,
    correct: run.correct + (correct ? 1 : 0),
    misses: correct || run.misses.some((m) => m.key === key) ? run.misses : [...run.misses, { key, front: card.front, back: card.back }],
    dates: [...run.dates, fields.next_review],
    reviewed: { ...run.reviewed, [key]: fields.next_review },
    courseUuids,
    shield,
    result: { correct, partial, picked, points },
  };
}
