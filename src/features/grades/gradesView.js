/**
 * Shapes the Today snapshot for the Grades hub. Pure: standing and needed scores come from the
 * priority engine, letters from todayView; this only words the next step and builds the trend.
 */
import { PRIORITY_CONFIG, formatPct, neededScores } from "../today/priority.js";
import { courseState, letterFor } from "../today/todayView.js";
import { currentGrade, hasScore } from "./gradeMath.js";

const usable = (item, known) =>
  item.componentUuid && !item.excluded && known.has(item.componentUuid) && item.score != null && Number(item.points_possible) > 0;

/**
 * Running current grade after each graded Blackboard item, oldest first (graded date, else sync time).
 * Components with no graded items keep their own (manual) score throughout.
 */
export function gradeTrend(components, items) {
  const comps = components || [];
  const known = new Set(comps.map((c) => c.uuid));
  const graded = (items || [])
    .filter((i) => usable(i, known))
    .map((i) => ({ i, t: Date.parse(i.graded_at || i.synced_at) }))
    .sort((a, b) => (Number.isNaN(a.t) ? Infinity : a.t) - (Number.isNaN(b.t) ? Infinity : b.t))
    .map(({ i }) => i);
  const withItems = new Set(graded.map((i) => i.componentUuid));
  const baseline = comps.filter((c) => !withItems.has(c.uuid) && hasScore(c));
  const totals = new Map();
  const trend = [];
  for (const i of graded) {
    const t = totals.get(i.componentUuid) || { earned: 0, possible: 0 };
    t.earned += Number(i.score);
    t.possible += Number(i.points_possible);
    totals.set(i.componentUuid, t);
    const running = comps
      .filter((c) => totals.has(c.uuid))
      .map((c) => ({ weight: c.weight, score: (totals.get(c.uuid).earned / totals.get(c.uuid).possible) * 100 }));
    trend.push(currentGrade([...baseline, ...running]));
  }
  return trend;
}

/** "Need 84 on Midterm to reach B", "On track for B", or null before anything is graded. */
function nextStepText(needs, targetLetter) {
  if (needs.current == null) return null;
  if (needs.gap <= 0) return `On track for ${targetLetter}`;
  const focus = needs.next?.needed != null ? needs.next : needs.final?.needed != null ? needs.final : null;
  if (focus) {
    if (focus.needed > 100) return `Even 100 on ${focus.title} won't reach ${targetLetter}`;
    return `Need ${formatPct(Math.max(0, focus.needed))} on ${focus.title} to reach ${targetLetter}`;
  }
  if (needs.neededAvg != null) {
    if (needs.neededAvg > 100) return `${targetLetter} is out of reach, even with 100 on what's left`;
    return `Need ${formatPct(Math.max(0, needs.neededAvg))} average on what's left to reach ${targetLetter}`;
  }
  return null;
}

const STATE_RANK = { warn: 0, ok: 1, none: 2 };

/**
 * One row per course, at risk first: { courseId, name, current|null, letter|null, atRisk, trend, nextStep|null }.
 * `scales`: { [courseUuid]: { letter: minPercent } }; `gradeItems`: { [courseUuid]: Blackboard grade items }.
 */
export function buildGradesView(courses, { scales = {}, gradeItems = {}, now, config = PRIORITY_CONFIG } = {}) {
  return (courses || [])
    .map((c) => {
      const needs = neededScores(c, { config, now });
      const scale = scales[c.uuid];
      const state = courseState(needs);
      return {
        courseId: c.uuid,
        name: c.name,
        current: needs.current,
        letter: letterFor(needs.current, scale),
        atRisk: state === "warn",
        trend: gradeTrend(c.components, gradeItems[c.uuid]),
        nextStep: nextStepText(needs, letterFor(needs.target, scale)),
        state,
      };
    })
    .sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || String(a.name).localeCompare(String(b.name)))
    .map(({ state, ...row }) => row);
}
