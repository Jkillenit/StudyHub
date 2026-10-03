/**
 * The Today briefing: a short local template built only from DB facts (no API key needed).
 * Returns segments so grades can render in mono; `text` is the plain sentence for speech.
 */
import { ITEM_TYPES, formatPct } from "./priority.js";
import { line } from "../../companion/character.js";

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const countWord = (n) => WORDS[n] || String(n);
const JUST_UNDER = 3;

export function greeting(date) {
  const h = new Date(date).getHours();
  if (h < 5) return line("home.late");
  if (h < 12) return line("home.morning");
  if (h < 17) return line("home.afternoon");
  return line("home.evening");
}

function timeOf(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function lowerFirst(s) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function taskSentence(tonight, dueText) {
  if (!tonight.length) return line("home.clear");
  const today = tonight.filter((it) => it.daysUntil === 0);
  if (today.length >= 2) {
    const courses = new Set(today.map((it) => it.courseLabel));
    const who = courses.size === 1 ? `${today[0].courseLabel} items` : "items";
    return `${countWord(today.length)} ${who} are due today, the first at ${timeOf(today[0].dueDate)}.`;
  }
  if (today.length === 1) {
    const it = today[0];
    if (it.type === ITEM_TYPES.EXAM_PREP) return `Your ${it.courseLabel} exam is today at ${timeOf(it.dueDate)}.`;
    return `${it.title} for ${it.courseLabel} is due at ${timeOf(it.dueDate)} today.`;
  }
  const next = tonight[0];
  const when = next.dueDate ? `, ${lowerFirst(dueText(next.dueDate, next.daysUntil, next.type === ITEM_TYPES.EXAM_PREP))}` : "";
  return `Nothing is due today. Next up is ${next.title} for ${next.courseLabel}${when}.`;
}

function overdueSentence(count) {
  if (!count) return null;
  return count === 1 ? "One overdue item still needs attention." : `${countWord(count)} overdue items still need attention.`;
}

function standingSegments(standing) {
  const rows = standing?.courses || [];
  const worst = rows[0];
  if (worst?.state === "warn") {
    const grade = { num: formatPct(worst.current), tone: "warn" };
    if (worst.gap < JUST_UNDER) {
      return [`${worst.label} is your pressure point at `, grade, `, just under your ${worst.targetLetter}.`];
    }
    return [`${worst.label} is your pressure point at `, grade, `, ${formatPct(worst.gap)} below your ${worst.targetLetter}.`];
  }
  if (rows.some((r) => r.state === "ok")) return ["Every graded course is on target."];
  return [];
}

const segText = (s) => (typeof s === "string" ? s : s.num);

/**
 * Facts for Nova's spoken briefing scene (scenes/briefing.json), all from the Today view.
 * Anything missing is null so the scene skips that part.
 */
export function briefingContext(view, { now = new Date(), dueText }) {
  const next = view?.tonight?.[0];
  const rows = view?.standing?.courses || [];
  const worst = rows[0];
  const risk = worst?.state === "warn" && worst.courseUuid ? worst : null;
  return {
    greeting: greeting(now),
    hasCourses: !!view?.hasCourses,
    task: next
      ? { title: next.title, course: next.courseLabel, when: lowerFirst(dueText(next.dueDate, next.daysUntil, next.type === ITEM_TYPES.EXAM_PREP)) || null }
      : null,
    overdue: view?.overdue?.length ? { count: view.overdue.length } : null,
    risk: risk ? { uuid: risk.courseUuid, course: risk.label, current: formatPct(risk.current), gap: formatPct(risk.gap), letter: risk.targetLetter } : null,
    onTrack: !risk && rows.some((r) => r.state === "ok"),
    courses: rows
      .filter((r) => r.current != null && r.courseUuid)
      .map((r) => ({
        uuid: r.courseUuid,
        course: r.label,
        current: r.current,
        pct: formatPct(r.current),
        gap: formatPct(Math.abs(r.gap)),
        behind: r.gap > 0,
        letter: r.targetLetter,
      })),
  };
}

/** { segments: (string | { num, tone })[], text }: the panel's written briefing. */
export function buildBriefing(view, { now = new Date(), dueText }) {
  const segments = [];
  const push = (parts) => {
    const list = (Array.isArray(parts) ? parts : [parts]).filter(Boolean);
    if (!list.length) return;
    if (segments.length) segments.push(" ");
    segments.push(...list);
  };
  push(greeting(now));
  if (!view?.hasCourses) {
    push("Connect Blackboard and sync your courses, and I'll brief you here every day.");
  } else {
    push(taskSentence(view.tonight || [], dueText));
    push(overdueSentence(view.overdue?.length || 0));
    push(standingSegments(view.standing));
  }
  return { segments, text: segments.map(segText).join("") };
}

const CLOCK = /\b\d{1,2}:\d{2}(?:\s?[AP]M)?/gi;

/** The home screen's one line: greeting + the task sentence, clock times as accent numbers. */
export function homeLine(view, { now = new Date(), dueText }) {
  const text = view?.hasCourses
    ? taskSentence(view.tonight || [], dueText)
    : "Connect Blackboard and I'll tell you what matters every day.";
  const segments = [greeting(now), " "];
  let i = 0;
  for (const m of text.matchAll(CLOCK)) {
    segments.push(text.slice(i, m.index), { num: m[0], tone: "accent" });
    i = m.index + m[0].length;
  }
  segments.push(text.slice(i));
  return segments.filter((s) => s !== "");
}
