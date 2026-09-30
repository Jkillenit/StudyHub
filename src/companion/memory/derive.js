/**
 * Turns local study data into the facts Nova remembers. Pure: takes the rows from
 * courseStore.companionStudyFacts() and loadTodayData() plus her current memory, and returns
 * the memory writes. Nothing here is invented; a fact without enough data is left out.
 */
import { courseStanding } from "../../features/today/priority.js";
import { shortCourse } from "../../features/dashboard/courseLabel.js";

/** Sessions needed before she claims a study-time or session-length pattern. */
export const PATTERN_MIN_SESSIONS = 5;
export const WEAK_MISS_RATE = 0.35;
export const STRONG_MISS_RATE = 0.15;
export const EXAM_READY_PCT = 80;
export const CARDS_MILESTONE = 100;
/** Sessions before 5am count as the night before, so 1am sits after 11pm, not before 9am. */
const NIGHT_ROLLOVER_H = 5;
const MAX_SESSION_MIN = 180;

export function courseName(row) {
  return shortCourse(row?.course_code || row?.courseCode || row?.course_name || row?.name) || row?.course_name || row?.name || "";
}

/** Local YYYY-MM-DD. */
export function localDay(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + n, 12));
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** "10pm", "9am", "noon", "midnight". */
export function hourLabel(h) {
  const hour = ((Math.round(h) % 24) + 24) % 24;
  if (hour === 0) return "midnight";
  if (hour === 12) return "noon";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

/** { after, typical } in rolled-over hours (a 1am start is 25), from session start times. */
export function studyTimes(sessions) {
  const hours = sessions
    .map((s) => new Date(s.started_at))
    .filter((d) => !Number.isNaN(d.getTime()))
    .map((d) => {
      const h = d.getHours() + d.getMinutes() / 60;
      return h < NIGHT_ROLLOVER_H ? h + 24 : h;
    })
    .sort((a, b) => a - b);
  if (hours.length < PATTERN_MIN_SESSIONS) return null;
  return { after: Math.floor(quantile(hours, 0.25)), typical: Math.round(quantile(hours, 0.5)), sessions: hours.length };
}

export function sessionMinutes(sessions) {
  const mins = sessions
    .map((s) => (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60000)
    .filter((m) => Number.isFinite(m) && m > 0.5)
    .map((m) => Math.min(m, MAX_SESSION_MIN))
    .sort((a, b) => a - b);
  if (mins.length < PATTERN_MIN_SESSIONS) return null;
  return Math.max(1, Math.round(quantile(mins, 0.5)));
}

/** { current, best } from distinct local study days (ascending). Current survives until tomorrow ends. */
export function streaks(days, now) {
  const set = new Set(days);
  let best = 0;
  let run = 0;
  let prev = null;
  for (const day of [...set].sort()) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  const today = localDay(now);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, best };
}

export function topics(rows) {
  const scored = (rows || [])
    .filter((r) => r.reviews > 0)
    .map((r) => ({
      moduleUuid: r.module_uuid,
      topic: r.title,
      courseUuid: r.course_uuid,
      course: courseName(r),
      reviews: r.reviews,
      missRate: r.misses / r.reviews,
    }));
  const byMiss = [...scored].sort((a, b) => b.missRate - a.missRate || b.reviews - a.reviews);
  const weak = byMiss.find((t) => t.missRate >= WEAK_MISS_RATE) || null;
  const strong = [...byMiss].reverse().find((t) => t.missRate <= STRONG_MISS_RATE && t.moduleUuid !== weak?.moduleUuid) || null;
  const pct = (t) => t && { ...t, missRate: undefined, missPct: Math.round(t.missRate * 100) };
  return { weak: pct(weak), strong: pct(strong) };
}

function lastSession(sessions) {
  const s = sessions[0];
  if (!s) return null;
  return {
    at: s.ended_at || s.started_at,
    kind: s.kind,
    courseUuid: s.course_uuid || null,
    course: s.course_uuid ? courseName(s) : "OM 300",
    cards: s.cards_reviewed || 0,
    correct: s.correct || 0,
    bestCombo: s.best_combo || 0,
  };
}

/**
 * { entries: [{ key, value, source }], news: [{ type, ... }] }.
 * `memory` maps key -> { value, muted }; muted keys are never written. `news` lists what just
 * changed (a comeback, a new milestone) so she can mention it.
 */
export function deriveMemory({ facts, today, memory = {}, now = new Date() }) {
  const entries = [];
  const news = [];
  const muted = (key) => !!memory[key]?.muted;
  const put = (key, value, source = "derived") => {
    if (!muted(key)) entries.push({ key, value, source });
  };
  const sessions = facts?.sessions || [];

  const times = studyTimes(sessions);
  put("study_time", times);
  const minutes = sessionMinutes(sessions);
  put("session_length", minutes ? { minutes } : null);

  const { weak, strong } = topics(facts?.topics);
  put("weak_topic", weak);
  put("strong_topic", strong);

  put("streak", facts?.days?.length ? streaks(facts.days, now) : null);
  put("last_session", lastSession(sessions));

  const below = [];
  for (const course of today?.courses || []) {
    const s = courseStanding(course);
    if (s.current == null) continue;
    const label = courseName(course);
    const isBelow = s.gap > 0;
    if (isBelow) below.push({ uuid: course.uuid, course: label, current: Math.round(s.current), target: Math.round(s.target) });
    const key = `standing:${course.uuid}`;
    const prev = memory[key]?.value;
    if (prev?.below && !isBelow && !muted(`comeback:${course.uuid}`)) {
      const comeback = { courseUuid: course.uuid, course: label, current: Math.round(s.current), target: Math.round(s.target), at: now.toISOString(), said: false };
      put(`comeback:${course.uuid}`, comeback, "observed");
      news.push({ type: "comeback", ...comeback });
      if (!memory["milestone:first_comeback"] && !muted("milestone:first_comeback")) {
        put("milestone:first_comeback", { at: now.toISOString(), course: label, celebrated: false }, "observed");
        news.push({ type: "milestone", id: "first_comeback", course: label });
      }
    }
    put(key, { course: label, current: Math.round(s.current), target: Math.round(s.target), below: isBelow }, "observed");
  }
  put("below_target", below.length ? { courses: below } : null);

  const milestone = (id, value) => {
    const key = `milestone:${id}`;
    if (memory[key] || muted(key)) return;
    put(key, { ...value, at: now.toISOString(), celebrated: false }, "observed");
    news.push({ type: "milestone", id, ...value });
  };
  const cards = facts?.totals?.cards || 0;
  if (cards >= CARDS_MILESTONE) milestone("cards100", { cards });
  for (const course of today?.courses || []) {
    const exam = (course.assignments || []).find((a) => a.kind === "exam" && a.examCards?.total && a.examCards.ready >= EXAM_READY_PCT);
    if (exam) {
      milestone("exam_ready", { exam: exam.title, course: courseName(course), ready: exam.examCards.ready });
      break;
    }
  }

  return { entries, news };
}

/** Memory rows as a key map, dropping empty values. */
export function memoryMap(rows) {
  const out = {};
  for (const r of rows || []) out[r.key] = { value: r.value, muted: !!r.muted, source: r.source, updatedAt: r.updatedAt };
  return out;
}

/** The fact's value when it's known and not muted, else null. */
export function known(memory, key) {
  const m = memory?.[key];
  return m && !m.muted && m.value != null ? m.value : null;
}
