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

/** Average needed across unscored components to finish at `target`, or null when nothing is left. */
export function neededAverage(components, target) {
  const list = components || [];
  const scoredContrib = list.filter(hasScore).reduce((sum, c) => sum + Number(c.score) * weightOf(c), 0);
  const remaining = remainingWeight(list);
  return remaining > 0 ? (target - scoredContrib) / remaining : null;
}
