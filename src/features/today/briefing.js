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

const segText = (s) => (typeof s === "string" ? s : s.num);

/**
 * { segments: (string | { num, tone })[], text, beats }. `beats` are the sentences Nova can walk
 * to while the briefing is read aloud: { from, to, target } with character offsets into `text`
 * and a `[data-brief-target]` value.
 */
export function buildBriefing(view, { now = new Date(), dueText }) {
  const segments = [];
  const beats = [];
  let length = 0;
  const push = (parts, target = null) => {
    const list = (Array.isArray(parts) ? parts : [parts]).filter(Boolean);
    if (!list.length) return;
    if (segments.length) {
      segments.push(" ");
      length += 1;
    }
    const from = length;
    for (const p of list) {
      segments.push(p);
      length += segText(p).length;
    }
    if (target) beats.push({ from, to: length, target });
  };
  push(greeting(now));
  if (!view?.hasCourses) {
    push("Connect Blackboard and sync your courses, and I'll brief you here every day.");
  } else {
    const tonight = view.tonight || [];
    push(taskSentence(tonight, dueText), tonight.length ? "tonight-0" : null);
    const overdue = view.overdue?.length || 0;
    push(overdueSentence(overdue), overdue ? "overdue" : null);
    const st = standingSegments(view.standing);
    const worst = view.standing?.courses?.[0];
    push(st, worst?.state === "warn" && worst.courseUuid ? `gauge-${worst.courseUuid}` : null);
  }
  const text = segments.map(segText).join("");
  return { segments, text, beats };
}
