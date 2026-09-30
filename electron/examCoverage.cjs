/**
 * Which modules an exam covers. Explicit picks live in exam_modules (assignments.scope_source =
 * 'manual', where no rows means the whole course). Otherwise coverage comes from rules parsed out of
 * the syllabus ("Exam 1: Chapters 1-4"), resolved against current module titles at read time so
 * modules imported later are picked up. With neither, an exam covers the whole course.
 */

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
const NUM = "(\\d{1,2}|i{1,3}|iv|vi?)";
const MAX_REFS = 40;
const SEGMENT_CHARS = 160;

function toNumber(token) {
  if (!token) return null;
  const t = String(token).toLowerCase();
  return /^\d+$/.test(t) ? Number(t) : ROMAN[t] ?? null;
}

const LABEL_RES = [
  { kind: "midterm", re: new RegExp(`\\bmid-?term(?:\\s+exam(?:ination)?)?(?:\\s*#?\\s*${NUM}\\b)?`, "gi") },
  { kind: "final", re: /\bfinal(?:\s+exam(?:ination)?)?\b(?!\s+(?:project|paper|presentation|report|essay|portfolio|grade))/gi },
  { kind: "exam", re: new RegExp(`\\b(?:exam(?:ination)?|test)\\b(?:\\s*#?\\s*${NUM}\\b)?`, "gi") },
];

/** Every exam label in a string with its key ("exam1", "midterm", "final") and position. */
function findLabels(text) {
  const found = [];
  for (const { kind, re } of LABEL_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const n = kind === "final" ? null : toNumber(m[1]);
      found.push({ key: `${kind}${n ?? ""}`, index: m.index, end: m.index + m[0].length });
    }
  }
  found.sort((a, b) => a.index - b.index || b.end - a.end);
  return found.filter((l, i) => !found.slice(0, i).some((p) => l.index < p.end));
}

/** Matching key for an exam title, or null when the title names no exam. */
function examKey(title) {
  return findLabels(String(title || ""))[0]?.key ?? null;
}

const REF_RE =
  /(?<![a-z])(?:chapters?|chaps?\.?|chs?\.?|modules?|units?|lessons?|topics?)\s*((?:\d{1,2}(?:\s*(?:-|–|—|to|through|thru)\s*\d{1,2})?(?:\s*(?:,|&|and|\/)\s*(?=\d))?)+)/gi;
const CUMULATIVE_RE = /\b(?:cumulative|comprehensive|all\s+(?:chapters|modules|units|material))\b/i;

function expandRefs(list) {
  const out = [];
  for (const part of list.split(/\s*(?:,|&|and|\/)\s*/i)) {
    const range = /^(\d{1,2})\s*(?:-|–|—|to|through|thru)\s*(\d{1,2})$/i.exec(part.trim());
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])];
      for (let n = Math.min(a, b); n <= Math.max(a, b) && out.length < MAX_REFS; n += 1) out.push(n);
    } else if (/^\d{1,2}$/.test(part.trim())) out.push(Number(part.trim()));
  }
  return out;
}

/**
 * Coverage rules from syllabus text: [{ key, refs: [chapter numbers], cumulative }]. Only the text
 * after a label up to the next label on the same line is read, and the first mention with coverage
 * wins, so schedule rows and repeated mentions don't pile up.
 */
function parseExamCoverage(text) {
  const rules = new Map();
  for (const line of String(text || "").split(/\r?\n/)) {
    const labels = findLabels(line);
    labels.forEach((label, i) => {
      if (rules.has(label.key)) return;
      const stop = Math.min(labels[i + 1]?.index ?? line.length, label.end + SEGMENT_CHARS);
      const segment = line.slice(label.end, stop);
      const refs = [];
      for (const m of segment.matchAll(REF_RE)) refs.push(...expandRefs(m[1]));
      const cumulative = CUMULATIVE_RE.test(segment);
      if (refs.length || cumulative) rules.set(label.key, { key: label.key, refs: [...new Set(refs)], cumulative });
    });
  }
  return [...rules.values()];
}

const escapeNum = (n) => `0*${Number(n)}(?!\\d)`;

/** Module uuids whose titles name the referenced numbers ("Chapter 3", "Ch3", "03 Forecasting"). */
function modulesForRefs(refs, modules) {
  const out = [];
  for (const n of refs || []) {
    const keyword = new RegExp(`(?:^|[^a-z])(?:chapters?|chap|ch|modules?|mod|units?|lessons?|topics?)[\\s._#-]*${escapeNum(n)}`, "i");
    const leading = new RegExp(`^\\s*${escapeNum(n)}`);
    let hits = modules.filter((m) => keyword.test(m.title || ""));
    if (!hits.length) hits = modules.filter((m) => leading.test(m.title || ""));
    for (const m of hits) if (!out.includes(m.uuid)) out.push(m.uuid);
  }
  return out;
}

/** The syllabus suggestion for an exam title: { moduleIds, cumulative } or null. */
function suggestionFor(title, rules, modules) {
  const key = examKey(title);
  const rule = key && (rules || []).find((r) => r.key === key);
  if (!rule) return null;
  if (rule.cumulative && !rule.refs.length) return { moduleIds: [], cumulative: true };
  const moduleIds = modulesForRefs(rule.refs, modules);
  return moduleIds.length ? { moduleIds, cumulative: false } : null;
}

function readRules(json) {
  try {
    const rules = JSON.parse(json || "[]");
    return Array.isArray(rules) ? rules : [];
  } catch {
    return [];
  }
}

/**
 * Effective scope of every exam in a course, keyed by exam uuid:
 * { moduleIds, source: 'manual' | 'syllabus' | 'course', suggestion }.
 */
function examScopes(db, courseId) {
  const course = db.prepare("SELECT exam_coverage_json FROM courses WHERE id = ?").get(courseId);
  const rules = readRules(course?.exam_coverage_json);
  const modules = db.prepare("SELECT id, uuid, title FROM modules WHERE course_id = ? AND disabled = 0").all(courseId);
  const exams = db.prepare("SELECT id, uuid, title, scope_source FROM assignments WHERE course_id = ? AND kind = 'exam'").all(courseId);
  const picked = new Map();
  for (const row of db
    .prepare(`
      SELECT em.exam_id, mo.uuid FROM exam_modules em
      JOIN modules mo ON mo.id = em.module_id
      WHERE mo.course_id = ? ORDER BY mo.position ASC
    `)
    .all(courseId)) {
    if (!picked.has(row.exam_id)) picked.set(row.exam_id, []);
    picked.get(row.exam_id).push(row.uuid);
  }
  const out = new Map();
  for (const exam of exams) {
    const suggestion = suggestionFor(exam.title, rules, modules);
    if (exam.scope_source === "manual") out.set(exam.uuid, { moduleIds: picked.get(exam.id) || [], source: "manual", suggestion });
    else if (suggestion) out.set(exam.uuid, { moduleIds: suggestion.moduleIds, source: "syllabus", suggestion });
    else out.set(exam.uuid, { moduleIds: [], source: "course", suggestion: null });
  }
  return out;
}

/** Saves the student's pick; `moduleIds` null clears it so syllabus coverage applies again. */
function setExamScope(db, examUuid, moduleIds) {
  const exam = db.prepare("SELECT id, course_id FROM assignments WHERE uuid = ? AND kind = 'exam'").get(examUuid);
  if (!exam) return { success: false, error: "Exam not found" };
  db.transaction(() => {
    db.prepare("DELETE FROM exam_modules WHERE exam_id = ?").run(exam.id);
    if (moduleIds == null) {
      db.prepare("UPDATE assignments SET scope_source = NULL WHERE id = ?").run(exam.id);
      return;
    }
    const moduleId = db.prepare("SELECT id FROM modules WHERE uuid = ? AND course_id = ?");
    const insert = db.prepare("INSERT OR IGNORE INTO exam_modules (exam_id, module_id) VALUES (?, ?)");
    for (const uuid of moduleIds) {
      const row = moduleId.get(String(uuid), exam.course_id);
      if (row) insert.run(exam.id, row.id);
    }
    db.prepare("UPDATE assignments SET scope_source = 'manual' WHERE id = ?").run(exam.id);
  })();
  return { success: true };
}

module.exports = { examKey, parseExamCoverage, modulesForRefs, suggestionFor, examScopes, setExamScope, readRules };
