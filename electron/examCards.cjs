/**
 * Exam card stats for the Today snapshot. The due and ready rules must match isCardDue and
 * examReadyPercent in src/study/sm2.js (an ESM renderer module); examCards.test.js checks parity.
 */
const FINAL_WINDOW_DAYS = 2;
const READY_GRADE = 3;
const DAY_MS = 86400000;

function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayNumber(value) {
  if (value == null || value === "") return null;
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (bare) return Date.UTC(+bare[1], +bare[2] - 1, +bare[3]) / DAY_MS;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
}

function daysUntilExam(examDate, now) {
  const exam = dayNumber(examDate);
  return exam == null ? null : exam - dayNumber(now);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Card fields as the renderer names them: { moduleId, next_review, lastReview, lastGrade }. */
function isCardDue(card, examDate, now) {
  if (!card.next_review || card.next_review <= localDateString(now)) return true;
  const days = examDate ? daysUntilExam(examDate, now) : null;
  if (days == null || days < 0 || days > FINAL_WINDOW_DAYS) return false;
  const windowStart = localDateString(addDays(now, days - FINAL_WINDOW_DAYS));
  return !card.lastReview || card.lastReview < windowStart;
}

/** { total, due, ready } for the cards an exam covers; an empty moduleIds list covers the course. */
function examCardStats(cards, { dueDate, moduleIds = [] }, now = new Date()) {
  const scope = moduleIds.length ? new Set(moduleIds) : null;
  const own = (cards || []).filter((c) => !scope || scope.has(c.moduleId));
  const due = own.filter((c) => isCardDue(c, dueDate, now)).length;
  const passed = own.filter((c) => c.lastGrade != null && c.lastGrade >= READY_GRADE).length;
  return { total: own.length, due, ready: own.length ? Math.round((passed / own.length) * 100) : 0 };
}

/** Module scope saved by the study guide for an exam (settings key studyGuide.scope.{uuid}). */
function examScope(db, examUuid) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(`studyGuide.scope.${examUuid}`);
  try {
    const ids = JSON.parse(row?.value || "[]");
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch {
    return [];
  }
}

function courseCards(db, courseId) {
  return db
    .prepare(`
      SELECT mo.uuid AS module_uuid, m.next_review, m.last_review, m.last_grade
      FROM flashcards f
      LEFT JOIN modules mo ON mo.id = f.module_id
      LEFT JOIN mastery m ON m.flashcard_id = f.id
      WHERE f.course_id = ?
    `)
    .all(courseId)
    .map((r) => ({
      moduleId: r.module_uuid || null,
      next_review: r.next_review || null,
      lastReview: r.last_review || null,
      lastGrade: r.last_grade ?? null,
    }));
}

module.exports = { FINAL_WINDOW_DAYS, READY_GRADE, isCardDue, examCardStats, examScope, courseCards };
