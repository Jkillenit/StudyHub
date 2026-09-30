/** Plain-words descriptions of Nova's memory for the "What she knows" screen. Pure. */
import { hourLabel } from "./derive.js";

function shortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function dayDate(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return shortDate(new Date(y, m - 1, d, 12).toISOString());
}

const MILESTONES = {
  cards100: (v) => `Milestone: ${v.cards} cards reviewed.`,
  exam_ready: (v) => `Milestone: ${v.exam} reached ${v.ready}% ready.`,
  first_comeback: (v) => `Milestone: first course back over target (${v.course}).`,
};

/** Group for a key, used to order the list and name muted facts. */
export function factGroup(key) {
  if (key === "name") return { id: "you", label: "Your name" };
  if (key === "study_time" || key === "session_length") return { id: "habits", label: key === "study_time" ? "When you study" : "Session length" };
  if (key === "weak_topic" || key === "strong_topic") return { id: "topics", label: key === "weak_topic" ? "Toughest topic" : "Strongest topic" };
  if (key === "streak" || key === "last_session") return { id: "habits", label: key === "streak" ? "Streaks" : "Last session" };
  if (key === "below_target" || key.startsWith("standing:") || key.startsWith("comeback:")) return { id: "grades", label: "Grades" };
  if (key.startsWith("milestone:")) return { id: "milestones", label: "Milestones" };
  if (key.startsWith("blocked:")) return { id: "blocked", label: `Blocked day ${dayDate(key.slice(8))}` };
  if (key.startsWith("gameday:")) return { id: "blocked", label: `Game day ${dayDate(key.slice(8))}` };
  if (key === "top_course") return { id: "habits", label: "Most-studied course" };
  if (key === "last_seen") return { id: "habits", label: "Last visit" };
  return { id: "other", label: key };
}

/** One sentence for a fact, or null when there's nothing to show. */
export function describeFact(key, value) {
  if (value == null || key.startsWith("_")) return null;
  switch (key) {
    case "name":
      return value.name ? `You go by ${value.name}.` : null;
    case "study_time":
      return `You usually start studying after ${hourLabel(value.after)}.`;
    case "session_length":
      return `Your sessions usually run about ${value.minutes} minutes.`;
    case "weak_topic":
      return `Your toughest topic lately: ${value.topic}${value.course ? ` (${value.course})` : ""}. You miss about ${value.missPct}% of those cards.`;
    case "strong_topic":
      return `Your strongest topic lately: ${value.topic}${value.course ? ` (${value.course})` : ""}. You miss only ${value.missPct}%.`;
    case "streak":
      return value.current ? `You're on a ${value.current}-day streak. Your best is ${value.best}.` : `Your best streak is ${value.best} days.`;
    case "last_session": {
      const combo = value.bestCombo >= 2 ? `, best run ${value.bestCombo}` : "";
      return `Last session: ${value.cards} cards in ${value.course}${combo}, ${shortDate(value.at)}.`;
    }
    case "below_target":
      return `Below target: ${value.courses.map((c) => `${c.course} (${c.current}% vs ${c.target}%)`).join(", ")}.`;
    case "top_course":
      return `You've studied ${value.course} the most lately (${value.sessions} sessions).`;
    case "last_seen":
      return `You last opened Study Hub ${shortDate(value)}.`;
    default:
      break;
  }
  if (key.startsWith("standing:")) return `${value.course} was at ${value.current}% (target ${value.target}%) when she last checked.`;
  if (key.startsWith("comeback:")) return `${value.course} climbed back over your ${value.target}% target on ${shortDate(value.at)}.`;
  if (key.startsWith("milestone:")) return MILESTONES[key.slice(10)]?.(value) || null;
  if (key.startsWith("blocked:")) return `${dayDate(key.slice(8))} is blocked${value.reason ? ` (${value.reason})` : ""}.`;
  if (key.startsWith("gameday:")) return `${dayDate(key.slice(8))} is a game day.`;
  return null;
}

const GROUP_ORDER = ["you", "habits", "topics", "grades", "milestones", "blocked", "other"];

/** Rows for the screen: { known: [{ key, text, group }], muted: [{ key, label }] }. */
export function factList(rows) {
  const knownRows = [];
  const muted = [];
  for (const r of rows || []) {
    if (r.key.startsWith("_")) continue;
    const group = factGroup(r.key);
    if (r.muted) {
      muted.push({ key: r.key, label: group.label });
      continue;
    }
    const text = describeFact(r.key, r.value);
    if (text) knownRows.push({ key: r.key, text, group: group.id });
  }
  knownRows.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.key.localeCompare(b.key));
  return { known: knownRows, muted };
}
