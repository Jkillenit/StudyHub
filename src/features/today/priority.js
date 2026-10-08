/**
 * Today priority engine. Pure: takes the snapshot from courseStore.loadTodayData() and returns
 * ranked items. score = urgency × weight × risk, every constant lives in PRIORITY_CONFIG.
 *
 * Item types:
 *   ASSIGNMENT  non-exam work due within the horizon, or overdue within the overdue window
 *   EXAM_PREP   an exam within the horizon (the exam itself is never also an ASSIGNMENT)
 *   GRADE_RISK  a course whose current grade is under its target with weight still open
 */
import {
  currentGrade,
  hasScore,
  neededAverage,
  neededOnItem,
  normalized,
  remainingWeight,
  totalWeight,
} from "../grades/gradeMath.js";
import { daysBetween, localDayKey } from "../../lib/dates.js";

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
  /**
   * risk = 1 + riskPerPoint × pressure, capped at maxRisk, where pressure = average needed on the open
   * work minus the current grade (just the gap when nothing is open). Only applies under target.
   */
  riskPerPoint: 0.03,
  maxRisk: 2,
  /** An upcoming exam/project, or anything worth at least this share, is a "major item". */
  majorShare: 0.1,
  gradeRiskUrgency: 0.1,
  defaultTarget: 80,
  topN: 5,
});

export const ITEM_TYPES = Object.freeze({ ASSIGNMENT: "ASSIGNMENT", EXAM_PREP: "EXAM_PREP", GRADE_RISK: "GRADE_RISK" });

/** The ranked item id for an assignment row (exams rank as EXAM_PREP). */
export const assignmentItemId = (a) => `${a.kind === "exam" ? "exam" : "asg"}:${a.uuid}`;

/** Calendar days from `now` to `date` in local time: 0 today, 1 tomorrow, -1 yesterday. */
export function daysUntil(date, now) {
  if (!date) return null;
  return daysBetween(date, now);
}

/** Blocked days (YYYY-MM-DD) from today up to, not including, the due day. */
export function blockedBefore(days, now, blocked) {
  if (!blocked?.size || days == null || days <= 0) return 0;
  let n = 0;
  for (let i = 0; i < days; i += 1) if (blocked.has(localDayKey(now, i))) n += 1;
  return n;
}

export function urgency(days, config = PRIORITY_CONFIG) {
  if (days < 0) return config.overdueUrgency;
  return 1 / (1 + days / config.urgencyHalfDays);
}

function targetOf(course, config) {
  const t = Number(course.targetGrade);
  return Number.isFinite(t) ? t : config.defaultTarget;
}

/**
 * { current, target, gap, neededAvg, pressure }. gap > 0 means under target; current is null with no
 * scores; neededAvg is the average needed on the open weight (null when nothing is open).
 */
export function courseStanding(course, config = PRIORITY_CONFIG) {
  const components = normalized(course.components || []);
  const current = currentGrade(components);
  const target = targetOf(course, config);
  const gap = current == null ? 0 : target - current;
  const neededAvg = current == null ? null : neededAverage(components, target);
  const pressure = neededAvg == null ? gap : neededAvg - current;
  return { current, target, gap, neededAvg, pressure };
}

export function riskFactor(standing, config = PRIORITY_CONFIG) {
  if (standing.current == null || standing.gap <= 0) return 1;
  return Math.min(config.maxRisk, 1 + Math.max(0, standing.pressure) * config.riskPerPoint);
}

/**
 * Share of the final grade (0..1) an assignment carries: its component's weight split by points
 * when known, otherwise evenly across the component's items. `known` is false for the kind default.
 */
export function itemShare(assignment, course, config = PRIORITY_CONFIG) {
  const components = course.components || [];
  const comp = components.find((c) => c.uuid === assignment.componentUuid);
  if (comp && Number(comp.weight) > 0) {
    const w = Number(comp.weight) / totalWeight(components);
    const pts = Number(assignment.pointsPossible);
    if (pts > 0 && comp.pointsTotal >= pts) return { share: (w * pts) / comp.pointsTotal, known: true };
    const minItems = config.minItemsPerComponent[comp.category] ?? config.minItemsPerComponent.other;
    return { share: w / Math.max(comp.itemCount || 0, minItems, 1), known: true };
  }
  const share = config.defaultShare[assignment.kind] ?? config.defaultShare.other;
  return { share, known: false };
}

const FINAL_RE = /\bfinal\b/i;

/**
 * Standing plus the score needed to hold the target on the next major item and on the final.
 * `needed` is null when the item's weight is only a guess or there are no scores to project from.
 */
export function neededScores(course, { config = PRIORITY_CONFIG, now = new Date().toISOString() } = {}) {
  const standing = courseStanding(course, config);
  const upcoming = (course.assignments || [])
    .filter((a) => !a.completed && a.score == null)
    .map((a) => ({ a, days: daysUntil(a.dueDate, now), ...itemShare(a, course, config) }))
    .filter((x) => x.days != null && x.days >= 0)
    .sort((x, y) => x.days - y.days || String(x.a.dueDate).localeCompare(String(y.a.dueDate)));

  const needFor = (share, known) => (known && standing.current != null ? neededOnItem(standing.current, standing.target, share) : null);
  const fromAssignment = (x) =>
    x && { uuid: x.a.uuid, title: x.a.title, dueDate: x.a.dueDate, share: x.share, needed: needFor(x.share, x.known) };

  const major = upcoming.find((x) => x.a.kind === "exam" || x.a.kind === "project" || x.share >= config.majorShare);
  let final = fromAssignment(upcoming.find((x) => x.a.kind === "exam" && FINAL_RE.test(x.a.title)));
  if (!final) {
    const comp = normalized(course.components || []).find((c) => FINAL_RE.test(c.name) && !hasScore(c) && c.weight > 0);
    if (comp) final = { uuid: null, title: comp.name, dueDate: null, share: comp.weight, needed: needFor(comp.weight, true) };
  }
  return { ...standing, next: fromAssignment(major) || null, final: final || null };
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

function neededPhrase(needed, target) {
  if (needed > 100) return `${formatPct(target)}% target out of reach even with 100%`;
  return `need ${formatPct(Math.max(0, needed))}% to hold ${formatPct(target)}%`;
}

const cardsPhrase = (n) => `${n} card${n === 1 ? "" : "s"} due`;

/** Exam-scoped card stats when the snapshot has them, else the course-wide due count. */
function examCardPhrases(a, course) {
  const stats = a.examCards;
  if (stats) {
    if (!stats.total) return ["no flashcards yet"];
    return [...(stats.due > 0 ? [cardsPhrase(stats.due)] : []), `${stats.ready}% exam ready`];
  }
  if (course.cardsDue > 0) return [cardsPhrase(course.cardsDue)];
  return course.cardsTotal ? [] : ["no flashcards yet"];
}

/** The needed score for this assignment if it is the course's next major item or its final. */
function neededFor(a, needs) {
  if (needs.next?.uuid === a.uuid && needs.next.needed != null) return needs.next.needed;
  if (needs.final?.uuid === a.uuid && needs.final.needed != null) return needs.final.needed;
  return null;
}

/** `blocked` days before the due date don't count as working time, so the item ranks as if due sooner. */
function assignmentItem(a, course, needs, days, config, blocked = 0) {
  const isExam = a.kind === "exam";
  const { share, known } = itemShare(a, course, config);
  const workDays = days < 0 ? days : Math.max(0, days - blocked);
  const score = urgency(workDays, config) * share ** config.weightExponent * riskFactor(needs, config);
  const needed = neededFor(a, needs);
  const parts = [whenPhrase(days, isExam)];
  if (known) parts.push(`worth ${sharePct(share)}% of grade`);
  if (needed != null) parts.push(neededPhrase(needed, needs.target));
  if (isExam) parts.push(...examCardPhrases(a, course));
  const standingText = needed == null ? standingPhrase(needs) : null;
  if (standingText) parts.push(standingText);

  let action;
  if (isExam) action = { type: "review", courseUuid: course.uuid, examUuid: a.uuid, label: "Start review" };
  else if (a.url) action = { type: "blackboard", url: a.url, label: "Open in Blackboard" };
  else action = { type: "course", courseUuid: course.uuid, label: "Open course" };

  return {
    id: assignmentItemId(a),
    type: isExam ? ITEM_TYPES.EXAM_PREP : ITEM_TYPES.ASSIGNMENT,
    kind: a.kind,
    courseUuid: course.uuid,
    courseName: course.name,
    title: a.title,
    dueDate: a.dueDate,
    daysUntil: days,
    share,
    shareKnown: known,
    needed,
    examReady: isExam && a.examCards?.total ? a.examCards.ready : null,
    blockedBefore: blocked,
    score,
    reason: parts.join(" · "),
    action,
  };
}

function gradeRiskReason(needs, open) {
  const { current, target, gap, neededAvg } = needs;
  if (neededAvg != null && neededAvg > 100) {
    return `At ${formatPct(current)}%, ${formatPct(target)}% is out of reach (needs ${formatPct(
      neededAvg
    )}% on everything left) · consider a lower target`;
  }
  const parts = [`At ${formatPct(current)}%, ${formatPct(gap)} pts under your ${formatPct(target)}% target`];
  const focus = needs.next?.needed != null ? needs.next : needs.final?.needed != null ? needs.final : null;
  if (focus) parts.push(`need ${formatPct(Math.max(0, focus.needed))}% on ${focus.title}`);
  else parts.push(`${Math.round(open * 100)}% of the grade still open`);
  return parts.join(" · ");
}

function gradeRiskItem(course, needs, config) {
  const components = course.components || [];
  const total = totalWeight(components);
  const open = total > 0 ? remainingWeight(components) / total : 0;
  if (needs.current == null || needs.gap <= 0 || open <= 0) return null;
  const score = config.gradeRiskUrgency * open ** config.weightExponent * riskFactor(needs, config);
  const focus = needs.next?.needed != null ? needs.next : needs.final?.needed != null ? needs.final : null;
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
    needed: needs.neededAvg != null && needs.neededAvg > 100 ? needs.neededAvg : focus?.needed ?? null,
    score,
    reason: gradeRiskReason(needs, open),
    action: { type: "grades", courseUuid: course.uuid, label: "Grade calculator" },
  };
}

/**
 * All candidate items, highest score first. Slice to config.topN for the Today list.
 * `blockedDays`: YYYY-MM-DD days the student marked unavailable.
 */
export function rankToday(data, { config = PRIORITY_CONFIG, now, blockedDays = null } = {}) {
  const at = now ?? data?.now ?? new Date().toISOString();
  const blocked = blockedDays ? new Set(blockedDays) : null;
  const items = [];
  for (const course of data?.courses || []) {
    const needs = neededScores(course, { config, now: at });
    for (const a of course.assignments || []) {
      if (a.completed || a.score != null) continue;
      const days = daysUntil(a.dueDate, at);
      if (days == null || days > config.horizonDays) continue;
      if (a.kind === "exam" ? days < 0 : days < -config.overdueWindowDays) continue;
      items.push(assignmentItem(a, course, needs, days, config, blockedBefore(days, at, blocked)));
    }
    const risk = gradeRiskItem(course, needs, config);
    if (risk) items.push(risk);
  }
  return items.sort(
    (x, y) =>
      y.score - x.score ||
      String(x.dueDate || "9999").localeCompare(String(y.dueDate || "9999")) ||
      x.title.localeCompare(y.title)
  );
}
