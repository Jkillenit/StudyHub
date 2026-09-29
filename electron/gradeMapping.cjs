const STOPWORDS = new Set([
  "the", "of", "and", "a", "an", "for", "to", "in", "on", "no", "grade", "grades", "score", "scores",
  "point", "points", "pts", "total", "percent", "week", "wk", "chapter", "ch", "unit", "module", "part",
]);

const CATEGORY_PATTERNS = [
  ["exam", /\b(exam|midterm|final|test)/],
  ["quiz", /\bquiz/],
  ["homework", /\b(homework|hw|assignment|problem set|pset|worksheet|exercise)/],
  ["project", /\b(project|paper|essay|report|presentation|case|portfolio)/],
  ["lab", /\b(lab|laboratory)/],
  ["discussion", /\b(discussion|forum|post|reply|journal|blog)/],
  ["participation", /\b(participation|attendance|engagement|in-class|in class|clicker|tophat|top hat)/],
];

/** Blackboard's built-in gradebook category titles → our categories. */
const BB_CATEGORY = {
  test: "exam",
  exam: "exam",
  quiz: "quiz",
  assignment: "homework",
  homework: "homework",
  discussion: "discussion",
  journal: "discussion",
  blog: "discussion",
  project: "project",
  participation: "participation",
  attendance: "participation",
};

function inferCategory(name) {
  const n = String(name || "").toLowerCase();
  for (const [category, re] of CATEGORY_PATTERNS) if (re.test(n)) return category;
  return "other";
}

function singular(word) {
  if (word.endsWith("zzes")) return word.slice(0, -3);
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ses") || word.endsWith("xes")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

function tokens(name) {
  return new Set(
    String(name || "")
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
      .map(singular)
  );
}

function categoryOf(component) {
  return component.category && component.category !== "other" ? component.category : inferCategory(component.name);
}

/** Best component for a Blackboard grade column, or null when nothing is a reasonable match. */
function matchComponent(item, components) {
  const itemTokens = tokens(item.name);
  const itemCategory = inferCategory(item.name);
  const bbCategory = BB_CATEGORY[String(item.category || "").toLowerCase()] || null;
  const lowerName = String(item.name || "").toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const component of components) {
    const compTokens = tokens(component.name);
    const compCategory = categoryOf(component);
    let score = 0;
    for (const t of itemTokens) if (compTokens.has(t)) score += 3;
    if (itemCategory !== "other" && itemCategory === compCategory) score += 2;
    if (bbCategory && bbCategory === compCategory) score += 1;
    // "Final Exam" belongs to a "Final" component over a generic "Exams" one, and vice versa.
    const compLower = String(component.name || "").toLowerCase();
    for (const key of ["final", "midterm"]) {
      const inItem = lowerName.includes(key);
      const inComp = compLower.includes(key);
      if (inItem && inComp) score += 4;
      else if (inComp && !inItem) score -= 3;
    }
    if (score > bestScore) {
      bestScore = score;
      best = component;
    }
  }
  return bestScore >= 2 ? best : null;
}

/** Items with `componentUuid` resolved from the manual override or the automatic match. */
function resolveMappings(items, components) {
  const byUuid = new Map(components.map((c) => [c.uuid, c]));
  return items.map((item) => {
    if (item.component_uuid === "none") return { ...item, componentUuid: null, auto: false, excluded: true };
    if (item.component_uuid && byUuid.has(item.component_uuid)) {
      return { ...item, componentUuid: item.component_uuid, auto: false, excluded: false };
    }
    const match = matchComponent(item, components);
    return { ...item, componentUuid: match?.uuid || null, auto: true, excluded: false };
  });
}

function loadForCourse(db, courseId) {
  const components = db
    .prepare("SELECT id, uuid, name, category FROM grade_components WHERE course_id = ? ORDER BY position ASC")
    .all(courseId);
  const items = db
    .prepare("SELECT * FROM bb_grade_items WHERE course_id = ? ORDER BY COALESCE(graded_at, synced_at) DESC")
    .all(courseId);
  return { components, items };
}

/**
 * Fills each component's score (percent) from its mapped, graded Blackboard columns as
 * total points earned / total points possible. Components with no graded columns keep their manual score.
 */
function applyBbGrades(db, courseId) {
  const { components, items } = loadForCourse(db, courseId);
  if (!components.length || !items.length) return { filled: 0, mapped: 0 };
  const resolved = resolveMappings(items, components);
  const totals = new Map();
  for (const item of resolved) {
    if (!item.componentUuid || item.score == null || !item.points_possible) continue;
    const t = totals.get(item.componentUuid) || { earned: 0, possible: 0 };
    t.earned += Number(item.score);
    t.possible += Number(item.points_possible);
    totals.set(item.componentUuid, t);
  }
  const find = db.prepare("SELECT id FROM grade_entries WHERE component_id = ? AND is_main = 1 ORDER BY id ASC LIMIT 1");
  const update = db.prepare("UPDATE grade_entries SET score = ?, graded_at = datetime('now') WHERE id = ?");
  const insert = db.prepare(
    "INSERT INTO grade_entries (component_id, score, is_main, graded_at) VALUES (?, ?, 1, datetime('now'))"
  );
  let filled = 0;
  db.transaction(() => {
    for (const component of components) {
      const t = totals.get(component.uuid);
      if (!t || t.possible <= 0) continue;
      const pct = Math.round((t.earned / t.possible) * 1000) / 10;
      const row = find.get(component.id);
      if (row) update.run(pct, row.id);
      else insert.run(component.id, pct);
      filled += 1;
    }
  })();
  return { filled, mapped: resolved.filter((r) => r.componentUuid).length };
}

module.exports = { applyBbGrades, resolveMappings, loadForCourse, inferCategory };
