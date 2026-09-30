/**
 * Today priority engine. Pure: takes the snapshot from courseStore.loadTodayData() and returns
 * ranked items. score = urgency × weight × risk, every constant lives in PRIORITY_CONFIG.
 *
 * Item types:
 *   ASSIGNMENT  non-exam work due within the horizon, or overdue within the overdue window
 *   EXAM_PREP   an exam within the horizon (the exam itself is never also an ASSIGNMENT)
 *   GRADE_RISK  a course whose current grade is under its target with weight still open
 */
import { currentGrade, remainingWeight } from "../grades/gradeMath.js";

export const PRIORITY_CONFIG = Object.freeze({
  horizonDays: 14,
  overdueWindowDays: 7,
  /** urgency = 1 / (1 + days / urgencyHalfDays): due today 1, in 2 days 0.5, in 14 days 0.125. */
  urgencyHalfDays: 2,
  overdueUrgency: 1.1,
  /** Share of the final grade assumed when an item can't be matched to a weighted component. */
  defaultShare: Object.freeze({ exam: 0.15, project: 0.08, quiz: 0.03, assignment: 0.03, reading: 0.01, other: 0.02 }),
  /**
   * Without points, a component's weight is split across at least this many items per category, so a
   * half-synced "Homework 30%" with two known items doesn't make each worth 15%.
   */
  minItemsPerComponent: Object.freeze({ homework: 8, quiz: 6, discussion: 8, lab: 8, participation: 1, exam: 1, project: 1, other: 1 }),
  /** weight = share ** weightExponent, so a 20% exam doesn't bury tomorrow's 2% homework. */
  weightExponent: 0.5,
  /** risk = 1 + riskPerPoint × points under target, capped at maxRisk. */
  riskPerPoint: 0.05,
  maxRisk: 2,
  gradeRiskUrgency: 0.1,
  defaultTarget: 80,
  topN: 5,
});

export const ITEM_TYPES = Object.freeze({ ASSIGNMENT: "ASSIGNMENT", EXAM_PREP: "EXAM_PREP", GRADE_RISK: "GRADE_RISK" });

const DAY_MS = 86400000;

function dayIndex(value) {
  const d = new Date(value);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** Calendar days from `now` to `date` in local time: 0 today, 1 tomorrow, -1 yesterday. */
export function daysUntil(date, now) {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  return dayIndex(date) - dayIndex(now);
}

export function urgency(days, config = PRIORITY_CONFIG) {
  if (days < 0) return config.overdueUrgency;
  return 1 / (1 + days / config.urgencyHalfDays);
}

function targetOf(course, config) {
  const t = Number(course.targetGrade);
  return Number.isFinite(t) ? t : config.defaultTarget;
}

/** { current, target, gap } where gap > 0 means under target; current is null with no scores. */
export function courseStanding(course, config = PRIORITY_CONFIG) {
  const current = currentGrade(course.components || []);
  const target = targetOf(course, config);
  return { current, target, gap: current == null ? 0 : target - current };
}

export function riskFactor(standing, config = PRIORITY_CONFIG) {
  if (standing.current == null || standing.gap <= 0) return 1;
  return Math.min(config.maxRisk, 1 + standing.gap * config.riskPerPoint);
}

function totalWeight(components) {
  return components.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
}

/**
 * Share of the final grade (0..1) an assignment carries: its component's weight split by points
 * when known, otherwise evenly across the component's items. `known` is false for the kind default.
 */
export function itemShare(assignment, course, config = PRIORITY_CONFIG) {
  const components = course.components || [];
  const comp = components.find((c) => c.uuid === assignment.componentUuid);
  if (comp && Number(comp.weight) > 0) {
    const w = Number(comp.weight) / Math.max(totalWeight(components), 1);
    const pts = Number(assignment.pointsPossible);
    if (pts > 0 && comp.pointsTotal >= pts) return { share: (w * pts) / comp.pointsTotal, known: true };
    const minItems = config.minItemsPerComponent[comp.category] ?? config.minItemsPerComponent.other;
    return { share: w / Math.max(comp.itemCount || 0, minItems, 1), known: true };
  }
  const share = config.defaultShare[assignment.kind] ?? config.defaultShare.other;
  return { share, known: false };
}

export function formatPct(n) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function sharePct(share) {
  const pct = share * 100;
  return pct < 1 ? formatPct(pct) : String(Math.round(pct));
}

function whenPhrase(days, isExam) {
  if (days < 0) return days === -1 ? "Overdue since yesterday" : `Overdue by ${-days} days`;
  const noun = isExam ? "Exam" : "Due";
  if (days === 0) return `${noun} today`;
  if (days === 1) return `${noun} tomorrow`;
  return `${noun} in ${days} days`;
}

function standingPhrase(standing) {
  if (standing.current == null || standing.gap <= 0) return null;
  return `course at ${formatPct(standing.current)}% vs ${formatPct(standing.target)}% target`;
}

function assignmentItem(a, course, standing, days, config) {
  const isExam = a.kind === "exam";
  const { share, known } = itemShare(a, course, config);
  const score = urgency(days, config) * share ** config.weightExponent * riskFactor(standing, config);
  const parts = [whenPhrase(days, isExam)];
  if (known) parts.push(`worth ${sharePct(share)}% of grade`);
  if (isExam) {
    if (course.cardsDue > 0) parts.push(`${course.cardsDue} card${course.cardsDue === 1 ? "" : "s"} due`);
    else if (!course.cardsTotal) parts.push("no flashcards yet");
  }
  const standingText = standingPhrase(standing);
  if (standingText) parts.push(standingText);

  let action;
  if (isExam) action = { type: "review", courseUuid: course.uuid, label: "START REVIEW" };
  else if (a.url) action = { type: "blackboard", url: a.url, label: "OPEN IN BLACKBOARD" };
  else action = { type: "course", courseUuid: course.uuid, label: "OPEN COURSE" };

  return {
    id: `${isExam ? "exam" : "asg"}:${a.uuid}`,
    type: isExam ? ITEM_TYPES.EXAM_PREP : ITEM_TYPES.ASSIGNMENT,
    kind: a.kind,
    courseUuid: course.uuid,
    courseName: course.name,
    title: a.title,
    dueDate: a.dueDate,
    daysUntil: days,
    share,
    shareKnown: known,
    score,
    reason: parts.join(" · "),
    action,
  };
}

function gradeRiskItem(course, standing, config) {
  const components = course.components || [];
  const total = totalWeight(components);
  const open = total > 0 ? remainingWeight(components) / total : 0;
  if (standing.current == null || standing.gap <= 0 || open <= 0) return null;
  const score = config.gradeRiskUrgency * open ** config.weightExponent * riskFactor(standing, config);
  return {
    id: `risk:${course.uuid}`,
    type: ITEM_TYPES.GRADE_RISK,
    kind: "grade",
    courseUuid: course.uuid,
    courseName: course.name,
    title: `${course.courseCode || course.name} below target`,
    dueDate: null,
    daysUntil: null,
    share: open,
    shareKnown: true,
    score,
    reason: `At ${formatPct(standing.current)}%, ${formatPct(standing.gap)} pts under your ${formatPct(
      standing.target
    )}% target · ${Math.round(open * 100)}% of the grade still open`,
    action: { type: "grades", courseUuid: course.uuid, label: "GRADE CALCULATOR" },
  };
}

/** All candidate items, highest score first. Slice to config.topN for the Today list. */
export function rankToday(data, { config = PRIORITY_CONFIG, now } = {}) {
  const at = now ?? data?.now ?? new Date().toISOString();
  const items = [];
  for (const course of data?.courses || []) {
    const standing = courseStanding(course, config);
    for (const a of course.assignments || []) {
      if (a.completed || a.score != null) continue;
      const days = daysUntil(a.dueDate, at);
      if (days == null || days > config.horizonDays) continue;
      if (a.kind === "exam" ? days < 0 : days < -config.overdueWindowDays) continue;
      items.push(assignmentItem(a, course, standing, days, config));
    }
    const risk = gradeRiskItem(course, standing, config);
    if (risk) items.push(risk);
  }
  return items.sort(
    (x, y) =>
      y.score - x.score ||
      String(x.dueDate || "9999").localeCompare(String(y.dueDate || "9999")) ||
      x.title.localeCompare(y.title)
  );
}
