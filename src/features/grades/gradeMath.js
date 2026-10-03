/**
 * Pure grade math shared by the grade calculator and the Today priority engine.
 * Component shape: { weight: 0..1, score: percent | null }.
 */

export const hasScore = (c) => c.score !== null && c.score !== undefined && !Number.isNaN(Number(c.score));

const weightOf = (c) => Number(c.weight || 0);

/** Weighted average over scored components, or null when nothing is scored. */
export function currentGrade(components) {
  const scored = (components || []).filter(hasScore);
  const scoredWeight = scored.reduce((sum, c) => sum + weightOf(c), 0);
  if (!scored.length || scoredWeight <= 0) return null;
  return scored.reduce((sum, c) => sum + Number(c.score) * weightOf(c), 0) / scoredWeight;
}

/** Total weight of components with no score yet. */
export function remainingWeight(components) {
  return (components || []).filter((c) => !hasScore(c)).reduce((sum, c) => sum + weightOf(c), 0);
}

/**
 * Score needed on one item worth `share` (0..1) of the final grade to finish at `target`, assuming the
 * rest of the open work lands at the current grade. With no scores yet, that is the target itself.
 */
export function neededOnItem(current, target, share) {
  if (!(share > 0)) return null;
  if (current == null) return target;
  return current + (target - current) / share;
}

/** Average needed across unscored components to finish at `target`, or null when nothing is left. */
export function neededAverage(components, target) {
  const list = components || [];
  const scoredContrib = list.filter(hasScore).reduce((sum, c) => sum + Number(c.score) * weightOf(c), 0);
  const remaining = remainingWeight(list);
  return remaining > 0 ? (target - scoredContrib) / remaining : null;
}

export function totalWeight(components) {
  return (components || []).reduce((sum, c) => sum + weightOf(c), 0);
}

/** Weights scaled to sum to 1, so a syllabus that lists 90% (or 110%) still yields sane numbers. */
export function normalized(components) {
  const list = components || [];
  const total = totalWeight(list);
  return total > 0 ? list.map((c) => ({ ...c, weight: weightOf(c) / total })) : list;
}

const DEFAULT_SCALE = Object.freeze({ A: 90, B: 80, C: 70, D: 60 });

/** Letter for a percent on `scale` ({ letter: minPercent }), the default A–D scale when none is set. */
export function letterFor(grade, scale) {
  if (grade == null) return null;
  const s = scale && Object.keys(scale).length ? scale : DEFAULT_SCALE;
  const sorted = Object.entries(s).sort((a, b) => b[1] - a[1]);
  for (const [letter, min] of sorted) if (grade >= min) return letter;
  return "F";
}

export function gradeTone(pct) {
  if (pct == null) return "none";
  if (pct >= 80) return "ok";
  if (pct >= 70) return "warn";
  return "danger";
}

export function neededTone(needed) {
  if (needed <= 85) return "ok";
  if (needed <= 95) return "warn";
  return "danger";
}

export function averageScore(entries) {
  if (!entries?.length) return null;
  const avg = entries.reduce((sum, e) => sum + Number(e.score || 0), 0) / entries.length;
  return Math.round(avg * 10) / 10;
}
