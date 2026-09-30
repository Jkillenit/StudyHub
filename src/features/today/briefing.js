/**
 * The Today briefing: a short local template built only from DB facts (no API key needed).
 * Returns segments so grades can render in mono; `text` is the plain sentence for speech.
 */
import { ITEM_TYPES, formatPct } from "./priority.js";

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const countWord = (n) => WORDS[n] || String(n);
const JUST_UNDER = 3;

export function greeting(date) {
  const h = new Date(date).getHours();
  if (h < 5) return "Late one.";
  if (h < 12) return "Morning.";
  if (h < 17) return "Afternoon.";
  return "Evening.";
}

function timeOf(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function lowerFirst(s) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function taskSentence(tonight, dueText) {
  if (!tonight.length) return "Nothing is due in the next two weeks.";
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

/** { segments: (string | { num, tone })[], text } */
export function buildBriefing(view, { now = new Date(), dueText }) {
  const segments = [];
  const push = (s) => {
    if (!s) return;
    if (segments.length) segments.push(" ");
    segments.push(s);
  };
  push(greeting(now));
  if (!view?.hasCourses) {
    push("Connect Blackboard and sync your courses, and I'll brief you here every day.");
  } else {
    push(taskSentence(view.tonight || [], dueText));
    push(overdueSentence(view.overdue?.length || 0));
    const st = standingSegments(view.standing);
    if (st.length) {
      segments.push(" ");
      segments.push(...st);
    }
  }
  const text = segments.map((s) => (typeof s === "string" ? s : s.num)).join("");
  return { segments, text };
}
