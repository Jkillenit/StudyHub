/**
 * Shapes the Today snapshot for the holographic Today screen. Pure and read-only: it reuses the
 * priority engine's ranking and standing math and only decides what goes in which panel.
 */
import { shortCourse } from "../dashboard/courseLabel.js";
import { ITEM_TYPES, PRIORITY_CONFIG, courseStanding, daysUntil, formatPct, rankToday } from "./priority.js";

export const TONIGHT_MAX = 3;
export const WEEK_DAYS = 7;
export const WEEK_LIST_MAX = 4;
export const STANDING_MAX = 3;

const DEFAULT_SCALE = Object.freeze({ A: 90, B: 80, C: 70, D: 60 });
const DAY_MS = 86400000;

/** Letter for a percentage on a { letter: minPercent } scale; the default is a plain 90/80/70/60 split. */
export function letterFor(grade, scale) {
  if (grade == null) return null;
  const s = scale && Object.keys(scale).length ? scale : DEFAULT_SCALE;
  const sorted = Object.entries(s).sort((a, b) => b[1] - a[1]);
  for (const [letter, min] of sorted) if (grade >= min) return letter;
  return "F";
}

export function courseLabel(course) {
  return shortCourse(course?.courseCode || course?.name) || course?.name || "";
}

/** "warn" below target, "ok" at or above it, "none" before any grade is in. */
export function courseState(standing) {
  if (!standing || standing.current == null) return "none";
  return standing.gap > 0 ? "warn" : "ok";
}

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function weekdayLabel(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: "short" });
}

/** "Due 10:00 AM today", "Due tomorrow 9:00 AM", "Due Tue 11:59 PM", "Exam Oct 14". */
export function dueText(iso, days, isExam = false) {
  if (!iso || days == null) return "";
  const noun = isExam ? "Exam" : "Due";
  if (days === 0) return `${noun} ${timeLabel(iso)} today`;
  if (days === 1) return `${noun} tomorrow ${timeLabel(iso)}`;
  if (days < 7) return `${noun} ${weekdayLabel(iso)} ${timeLabel(iso)}`;
  return `${noun} ${new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

function shareText(share) {
  const pct = share * 100;
  return `${pct < 1 ? formatPct(pct) : Math.round(pct)}% of grade`;
}

/** One reason line for a Tonight row. Course standing is left to the Standing panel. */
export function tonightReason(item) {
  const parts = [dueText(item.dueDate, item.daysUntil, item.type === ITEM_TYPES.EXAM_PREP)];
  if (item.shareKnown) parts.push(shareText(item.share));
  if (item.needed != null) parts.push(item.needed > 100 ? "target out of reach" : `need ${formatPct(Math.max(0, item.needed))}%`);
  if (item.examReady != null) parts.push(`${item.examReady}% exam ready`);
  return parts.filter(Boolean);
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * {
 *   synced, hasCourses,
 *   tonight:  up to 3 ranked items (never overdue, never a course-level grade risk),
 *   overdue:  late assignments inside the engine's overdue window, most overdue first,
 *   standing: { courses, shown, more, target, letter, uniformTarget },
 *   week:     { days: 7 columns from today, later: items due after today },
 *   states:   { [courseUuid]: "warn" | "ok" | "none" },
 * }
 */
export function buildTodayView(data, { now, scales = {}, config = PRIORITY_CONFIG } = {}) {
  const at = now ?? data?.now ?? new Date().toISOString();
  const courses = data?.courses || [];
  const byUuid = new Map(courses.map((c) => [c.uuid, c]));

  const standingRows = courses.map((c) => {
    const s = courseStanding(c, config);
    const scale = scales[c.uuid];
    return {
      courseUuid: c.uuid,
      label: courseLabel(c),
      current: s.current,
      target: s.target,
      gap: s.gap,
      state: courseState(s),
      targetLetter: letterFor(s.target, scale),
    };
  });
  const states = Object.fromEntries(standingRows.map((r) => [r.courseUuid, r.state]));
  const stateRank = { warn: 0, ok: 1, none: 2 };
  const sortedStanding = [...standingRows].sort(
    (a, b) => stateRank[a.state] - stateRank[b.state] || b.gap - a.gap || a.label.localeCompare(b.label)
  );
  const targets = [...new Set(standingRows.map((r) => r.target))];

  const tonight = rankToday(data, { config, now: at })
    .filter((it) => it.type !== ITEM_TYPES.GRADE_RISK && (it.daysUntil == null || it.daysUntil >= 0))
    .slice(0, TONIGHT_MAX)
    .map((it) => {
      const course = byUuid.get(it.courseUuid);
      return { ...it, courseLabel: courseLabel(course), courseState: states[it.courseUuid] || "none", reasonParts: tonightReason(it) };
    });
  const tonightIds = new Set(tonight.map((it) => it.id.split(":")[1]));

  const open = [];
  for (const c of courses) {
    for (const a of c.assignments || []) {
      if (a.completed || a.score != null) continue;
      const days = daysUntil(a.dueDate, at);
      if (days == null) continue;
      open.push({ a, c, days });
    }
  }

  const overdue = open
    .filter(({ a, days }) => days < 0 && days >= -config.overdueWindowDays && a.kind !== "exam")
    .sort((x, y) => x.days - y.days || String(x.a.dueDate).localeCompare(String(y.a.dueDate)))
    .map(({ a, c, days }) => ({ uuid: a.uuid, title: a.title, courseUuid: c.uuid, courseLabel: courseLabel(c), daysLate: -days, url: a.url || null }));

  const today0 = startOfDay(at);
  const days = Array.from({ length: WEEK_DAYS }, (_, i) => {
    const d = new Date(today0.getTime() + i * DAY_MS + 12 * 3600000);
    return {
      offset: i,
      isToday: i === 0,
      weekday: d.toLocaleDateString([], { weekday: "short" }).toUpperCase(),
      dayNum: d.getDate(),
      dots: [],
    };
  });
  const upcoming = open
    .filter(({ days: n }) => n >= 0 && n < WEEK_DAYS)
    .sort((x, y) => String(x.a.dueDate).localeCompare(String(y.a.dueDate)));
  for (const { a, c, days: n } of upcoming) {
    days[n].dots.push({ uuid: a.uuid, state: states[c.uuid] || "none", title: a.title });
  }
  const later = upcoming
    .filter(({ days: n }) => n >= 1)
    .slice(0, WEEK_LIST_MAX)
    .map(({ a, c, days: n }) => ({
      uuid: a.uuid,
      title: a.title,
      courseUuid: c.uuid,
      courseLabel: courseLabel(c),
      dayLabel: `${days[n].weekday} ${days[n].dayNum}`,
      time: timeLabel(a.dueDate),
      inTonight: tonightIds.has(a.uuid),
    }));

  return {
    synced: !!data?.synced,
    hasCourses: courses.length > 0,
    tonight,
    overdue,
    standing: {
      courses: sortedStanding.slice(0, STANDING_MAX),
      more: Math.max(0, sortedStanding.length - STANDING_MAX),
      uniformTarget: targets.length === 1 ? targets[0] : null,
      uniformLetter: targets.length === 1 ? sortedStanding[0]?.targetLetter : null,
    },
    week: { days, later },
    states,
  };
}
