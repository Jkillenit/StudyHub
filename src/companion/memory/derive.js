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
/** Days a topic stays her "toughest" before it becomes the running joke. */
export const NEMESIS_AFTER_DAYS = 3;
/** A run this long is worth remembering. */
export const EPISODE_COMBO = 15;
/** A session ending in these hours is a late-night story. */
export const LATE_EPISODE_HOURS = [2, 5];
const DAY_MS = 86400000;
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

/** The course with the most sessions in the window, once there are TOP_COURSE_MIN of them. */
export const TOP_COURSE_MIN = 3;
export function topCourse(sessions) {
  const counts = new Map();
  for (const s of sessions || []) {
    const course = s.course_uuid ? courseName(s) : "OM 300";
    if (!course) continue;
    const key = s.course_uuid || "builtin";
    const cur = counts.get(key) || { courseUuid: s.course_uuid || null, course, sessions: 0 };
    cur.sessions += 1;
    counts.set(key, cur);
  }
  const top = [...counts.values()].sort((a, b) => b.sessions - a.sessions)[0];
  return top && top.sessions >= TOP_COURSE_MIN ? top : null;
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
  const prevWeak = memory.weak_topic?.value;
  const weakSince = weak && prevWeak?.moduleUuid === weak.moduleUuid && prevWeak.since ? prevWeak.since : now.toISOString();
  put("weak_topic", weak && { ...weak, since: weakSince });
  put("strong_topic", strong);

  /* Running joke: a topic that stays her pick for "toughest" becomes the nemesis, until it isn't. */
  const joke = memory["joke:nemesis"]?.value;
  const active = joke?.status === "active";
  const jokeRow = active && (facts?.topics || []).find((r) => r.module_uuid === joke.moduleUuid && r.reviews > 0);
  if (weak && now - Date.parse(weakSince) >= NEMESIS_AFTER_DAYS * DAY_MS && !(active && joke.moduleUuid === weak.moduleUuid)) {
    if (!active) {
      const nemesis = { moduleUuid: weak.moduleUuid, courseUuid: weak.courseUuid, topic: weak.topic, course: weak.course, since: weakSince, status: "active", refs: 0, lastRef: null };
      put("joke:nemesis", nemesis, "observed");
    }
  } else if (jokeRow && jokeRow.misses / jokeRow.reviews < WEAK_MISS_RATE && !muted("joke:nemesis")) {
    const retired = { ...joke, status: "retired", retiredAt: now.toISOString(), said: false };
    put("joke:nemesis", retired, "observed");
    news.push({ type: "joke_retired", ...retired });
  }

  /* Episodes: moments worth bringing up later. Records only move forward. */
  const episode = (kind, value, beats) => {
    const prev = memory[`episode:${kind}`]?.value;
    if (value && (!prev || beats(prev))) put(`episode:${kind}`, { ...value, refs: 0, lastRef: null }, "observed");
  };
  const best = sessions.reduce((b, s) => ((s.best_combo || 0) > (b?.best_combo || 0) ? s : b), null);
  if (best?.best_combo >= EPISODE_COMBO) {
    const combo = { combo: best.best_combo, course: best.course_uuid ? courseName(best) : "OM 300", at: best.ended_at || best.started_at };
    episode("best_combo", combo, (p) => combo.combo > p.combo);
  }
  const late = sessions.find((s) => {
    const h = new Date(s.ended_at || s.started_at).getHours();
    return h >= LATE_EPISODE_HOURS[0] && h < LATE_EPISODE_HOURS[1];
  });
  if (late) {
    const at = late.ended_at || late.started_at;
    const time = new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    episode("late_night", { course: late.course_uuid ? courseName(late) : "OM 300", at, time }, (p) => Date.parse(at) > Date.parse(p.at));
  }

  put("streak", facts?.days?.length ? streaks(facts.days, now) : null);
  put("last_session", lastSession(sessions));
  put("top_course", topCourse(sessions));

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

/** Episodes she can bring up, most memorable first, and the rapport each needs. */
export const CALLBACKS = [
  { key: "joke:nemesis", kind: "nemesis", tier: "friend", every: 3 },
  { key: "episode:best_combo", kind: "best_combo", tier: "partner", every: 7 },
  { key: "episode:grade_up", kind: "grade_up", tier: "partner", every: 7 },
  { key: "episode:late_night", kind: "late_night", tier: "partner", every: 10 },
  { key: "episode:long_absence", kind: "long_absence", tier: "friend", every: 14 },
];
/** An episode has to be at least this old before it's a "remember when". */
const CALLBACK_MIN_AGE_MS = DAY_MS;

/**
 * { key, kind, vars } for the memory she'd bring up now, or null. Each can come back every
 * `every` days; `allowed(tier)` says whether the relationship is there yet.
 */
export function callbackFor(memory, { allowed, now = new Date() }) {
  for (const c of CALLBACKS) {
    const v = known(memory, c.key);
    if (!v || !allowed(c.tier) || (c.kind === "nemesis" && v.status !== "active")) continue;
    if (now - Date.parse(v.since || v.at) < CALLBACK_MIN_AGE_MS) continue;
    if (v.lastRef && now - Date.parse(v.lastRef) < c.every * DAY_MS) continue;
    const sinceLabel = v.since ? new Date(v.since).toLocaleDateString([], { month: "short", day: "numeric" }) : null;
    return { key: c.key, kind: c.kind, vars: { ...v, sinceLabel } };
  }
  return null;
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
