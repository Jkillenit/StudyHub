const { ipcMain } = require("electron");
const { getDb } = require("./database.cjs");
const { courseIdFor, newUuid, saveFullCourse } = require("./dbHandlers.cjs");
const { applyBbGrades, resolveMappings, loadForCourse } = require("./gradeMapping.cjs");
const { courseCards, examCardStats } = require("./examCards.cjs");
const { examScopes, parseExamCoverage, setExamScope } = require("./examCoverage.cjs");

let registered = false;

/** The Study Hub course linked to a Blackboard course, created (with one empty module) if missing. */
function ensureCourseForBb(db, { bbCourseId, name, courseCode, term }) {
  const existing = db.prepare("SELECT uuid FROM courses WHERE bb_course_id = ? ORDER BY id ASC LIMIT 1").get(bbCourseId);
  if (existing) return { courseUuid: existing.uuid, created: false };
  const courseUuid = newUuid("uc");
  saveFullCourse(db, {
    uuid: courseUuid,
    name: String(name || courseCode || "Blackboard Course").slice(0, 200),
    subtitle: "BLACKBOARD",
    bbCourseId,
    courseCode: courseCode || null,
    term: term || null,
    meta: { activeModuleId: null, materialPaths: [], pptxReviewBlocks: {} },
    modules: [{ uuid: newUuid("m"), title: "General", html: "", content: [] }],
    flashcards: [],
    glossary: [],
  });
  return { courseUuid, created: true };
}

function isoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Applies one Blackboard sweep for a course. Everything is keyed by Blackboard id, so re-syncing
 * is idempotent; manual assignments (bb_id NULL) and local completion flags are never touched.
 */
function applyBbSync(db, courseUuid, payload) {
  const courseId = courseIdFor(db, courseUuid);
  if (!courseId) return { success: false, error: "Course not found" };
  const counts = { contents: 0, announcements: 0, assignments: 0, grades: 0 };

  db.transaction(() => {
    const contentStmt = db.prepare(`
      INSERT INTO bb_items (course_id, bb_id, parent_bb_id, title, kind, url, position, synced_at)
      VALUES (@courseId, @bbId, @parentBbId, @title, @kind, @url, @position, datetime('now'))
      ON CONFLICT(course_id, bb_id) DO UPDATE SET
        parent_bb_id = excluded.parent_bb_id, title = excluded.title, kind = excluded.kind,
        url = excluded.url, position = excluded.position, synced_at = excluded.synced_at
    `);
    (payload?.contents || []).forEach((item, position) => {
      if (!item?.id || !item?.title) return;
      contentStmt.run({
        courseId,
        bbId: String(item.id),
        parentBbId: item.parentId ? String(item.parentId) : null,
        title: String(item.title).slice(0, 500),
        kind: item.kind || null,
        url: item.url || null,
        position,
      });
      counts.contents += 1;
    });

    const annStmt = db.prepare(`
      INSERT INTO announcements (uuid, course_id, bb_id, title, body, posted_at)
      VALUES (@uuid, @courseId, @bbId, @title, @body, @postedAt)
      ON CONFLICT(course_id, bb_id) WHERE bb_id IS NOT NULL DO UPDATE SET
        title = excluded.title, body = excluded.body, posted_at = excluded.posted_at
    `);
    (payload?.announcements || []).forEach((a) => {
      if (!a?.id || !a?.title) return;
      annStmt.run({
        uuid: newUuid("ann"),
        courseId,
        bbId: String(a.id),
        title: String(a.title).slice(0, 500),
        body: a.body ? String(a.body).slice(0, 20000) : null,
        postedAt: isoOrNull(a.postedAt),
      });
      counts.announcements += 1;
    });

    const asgStmt = db.prepare(`
      INSERT INTO assignments (uuid, course_id, bb_id, title, due_date, kind, url, points_possible, score, source, updated_at)
      VALUES (@uuid, @courseId, @bbId, @title, @dueDate, @kind, @url, @points, @score, 'blackboard', datetime('now'))
      ON CONFLICT(course_id, bb_id) WHERE bb_id IS NOT NULL DO UPDATE SET
        title = excluded.title, due_date = excluded.due_date, kind = excluded.kind, url = excluded.url,
        points_possible = excluded.points_possible,
        score = COALESCE(excluded.score, assignments.score),
        updated_at = excluded.updated_at
    `);
    (payload?.assignments || []).forEach((a) => {
      if (!a?.id || !a?.title) return;
      asgStmt.run({
        uuid: newUuid("asg"),
        courseId,
        bbId: String(a.id),
        title: String(a.title).slice(0, 500),
        dueDate: isoOrNull(a.dueDate),
        kind: a.kind || "assignment",
        url: a.url || null,
        points: Number.isFinite(a.pointsPossible) ? a.pointsPossible : null,
        score: Number.isFinite(a.score) ? a.score : null,
      });
      counts.assignments += 1;
    });

    const gradeStmt = db.prepare(`
      INSERT INTO bb_grade_items (course_id, bb_id, name, score, points_possible, graded_at, category, synced_at)
      VALUES (@courseId, @bbId, @name, @score, @points, @gradedAt, @category, datetime('now'))
      ON CONFLICT(course_id, bb_id) DO UPDATE SET
        name = excluded.name, score = excluded.score, points_possible = excluded.points_possible,
        graded_at = excluded.graded_at, category = excluded.category, synced_at = excluded.synced_at
    `);
    (payload?.gradeItems || []).forEach((g) => {
      if (!g?.id || !g?.name) return;
      gradeStmt.run({
        courseId,
        bbId: String(g.id),
        name: String(g.name).slice(0, 300),
        score: Number.isFinite(g.score) ? g.score : null,
        points: Number.isFinite(g.pointsPossible) ? g.pointsPossible : null,
        gradedAt: isoOrNull(g.gradedAt),
        category: g.category ? String(g.category).slice(0, 100) : null,
      });
      counts.grades += 1;
    });

    db.prepare("UPDATE courses SET updated_at = datetime('now') WHERE id = ?").run(courseId);
  })();

  const graded = applyBbGrades(db, courseId);
  return { success: true, counts: { ...counts, componentsFilled: graded.filled } };
}

function gradeItemsWithMapping(db, courseUuid) {
  const courseId = courseIdFor(db, courseUuid);
  if (!courseId) return [];
  const { components, items } = loadForCourse(db, courseId);
  return resolveMappings(items, components);
}

const TODAY_LOOKBACK_DAYS = 30;

/**
 * Everything the Today priority engine needs, per course: target, weighted components (with how many
 * points / items each holds, for an item's share of the final grade), open assignments mapped to a
 * component, and flashcards due. The engine itself is pure and runs in the renderer.
 */
function todayData(db, courseUuid = null) {
  const courses = db
    .prepare(`
      SELECT id, uuid, name, course_code, bb_course_id, target_grade FROM courses
      WHERE type = 'user' ${courseUuid ? "AND uuid = ?" : ""} ORDER BY name COLLATE NOCASE ASC
    `)
    .all(...(courseUuid ? [courseUuid] : []));
  const since = new Date(Date.now() - TODAY_LOOKBACK_DAYS * 86400000).toISOString();
  const today = localDate(0);
  const componentStmt = db.prepare(`
    SELECT gc.id, gc.uuid, gc.name, gc.weight, gc.category, ge.score AS score
    FROM grade_components gc
    LEFT JOIN grade_entries ge ON ge.component_id = gc.id AND ge.is_main = 1
    WHERE gc.course_id = ? GROUP BY gc.id ORDER BY gc.position ASC
  `);
  const assignmentStmt = db.prepare(`
    SELECT uuid, bb_id, component_id, title, kind, due_date, completed, score, points_possible, url, source
    FROM assignments WHERE course_id = ? AND completed = 0 AND due_date IS NOT NULL AND due_date >= ?
    ORDER BY due_date ASC
  `);
  const countStmt = db.prepare("SELECT component_id, bb_id, title FROM assignments WHERE course_id = ?");
  const cardsStmt = db.prepare(`
    SELECT COUNT(f.id) AS total,
           COALESCE(SUM(CASE WHEN m.next_review IS NULL OR m.next_review <= ? THEN 1 ELSE 0 END), 0) AS due
    FROM flashcards f LEFT JOIN mastery m ON m.flashcard_id = f.id WHERE f.course_id = ?
  `);

  const result = courses.map((course) => {
    const components = componentStmt.all(course.id);
    const byId = new Map(components.map((c) => [c.id, c]));
    const { items } = loadForCourse(db, course.id);
    const resolvedItems = components.length ? resolveMappings(items, components) : [];
    const componentOfBb = new Map(resolvedItems.map((i) => [String(i.bb_id), i.componentUuid]));
    const componentFor = (row) => {
      if (row.component_id && byId.has(row.component_id)) return byId.get(row.component_id).uuid;
      if (row.bb_id && componentOfBb.has(String(row.bb_id))) return componentOfBb.get(String(row.bb_id));
      if (!components.length) return null;
      return resolveMappings([{ name: row.title, component_uuid: null }], components)[0].componentUuid;
    };

    const totals = new Map();
    for (const item of resolvedItems) {
      if (!item.componentUuid) continue;
      const t = totals.get(item.componentUuid) || { points: 0, items: 0 };
      t.items += 1;
      t.points += Number(item.points_possible) || 0;
      totals.set(item.componentUuid, t);
    }
    if (!resolvedItems.length) {
      for (const row of countStmt.all(course.id)) {
        const uuid = componentFor(row);
        if (!uuid) continue;
        const t = totals.get(uuid) || { points: 0, items: 0 };
        t.items += 1;
        totals.set(uuid, t);
      }
    }

    const cards = cardsStmt.get(today, course.id);
    const openAssignments = assignmentStmt.all(course.id, since);
    const hasExam = openAssignments.some((a) => a.kind === "exam");
    const deck = hasExam ? courseCards(db, course.id) : [];
    const scopes = hasExam ? examScopes(db, course.id) : new Map();
    return {
      uuid: course.uuid,
      name: course.name,
      courseCode: course.course_code || "",
      bbCourseId: course.bb_course_id || "",
      targetGrade: Number.isFinite(course.target_grade) ? course.target_grade : 80,
      cardsTotal: cards.total || 0,
      cardsDue: cards.due || 0,
      components: components.map((c) => ({
        uuid: c.uuid,
        name: c.name,
        weight: Number(c.weight) || 0,
        category: c.category || "other",
        score: c.score ?? null,
        pointsTotal: totals.get(c.uuid)?.points || 0,
        itemCount: totals.get(c.uuid)?.items || 0,
      })),
      assignments: openAssignments.map((a) => ({
        uuid: a.uuid,
        title: a.title,
        kind: a.kind || "assignment",
        dueDate: a.due_date,
        score: a.score ?? null,
        pointsPossible: a.points_possible ?? null,
        url: a.url || null,
        source: a.source,
        componentUuid: componentFor(a),
        ...(a.kind === "exam"
          ? {
              examCards: examCardStats(deck, { dueDate: a.due_date, moduleIds: scopes.get(a.uuid)?.moduleIds || [] }),
              scopeSource: scopes.get(a.uuid)?.source || "course",
            }
          : {}),
      })),
    };
  });

  const synced =
    db.prepare("SELECT 1 FROM assignments WHERE source = 'blackboard' LIMIT 1").get() ||
    db.prepare("SELECT 1 FROM bb_items LIMIT 1").get() ||
    db.prepare("SELECT 1 FROM bb_grade_items LIMIT 1").get();
  return { now: new Date().toISOString(), synced: !!synced, courses: result };
}

function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sessionStats(db, courseUuid) {
  const courseId = courseUuid ? courseIdFor(db, courseUuid) : null;
  const where = courseId ? "WHERE course_id = ?" : "";
  const args = courseId ? [courseId] : [];
  const days = db
    .prepare(
      `SELECT date(started_at, 'localtime') AS day, SUM(cards_reviewed) AS reviewed, COUNT(*) AS sessions
       FROM study_sessions ${where}
       GROUP BY day ORDER BY day DESC LIMIT 60`
    )
    .all(...args);
  const daySet = new Set(days.map((d) => d.day));
  let streak = 0;
  let offset = daySet.has(localDate(0)) ? 0 : -1;
  while (daySet.has(localDate(offset))) {
    streak += 1;
    offset -= 1;
  }
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS sessions, COALESCE(SUM(cards_reviewed), 0) AS reviewed,
              COALESCE(SUM(correct), 0) AS correct, COALESCE(SUM(incorrect), 0) AS incorrect,
              COALESCE(SUM((julianday(ended_at) - julianday(started_at)) * 86400), 0) AS seconds
       FROM study_sessions ${where}`
    )
    .get(...args);
  const last14 = [];
  for (let i = 13; i >= 0; i -= 1) {
    const day = localDate(-i);
    const hit = days.find((d) => d.day === day);
    last14.push({ day, reviewed: hit?.reviewed || 0 });
  }
  const avgSecondsPerCard = totals.reviewed > 0 ? totals.seconds / totals.reviewed : null;
  return { streak, last14, ...totals, avgSecondsPerCard };
}

function registerMirrorHandlers() {
  if (registered) return;
  registered = true;
  const db = getDb();

  /* ---------------- assignments / calendar ---------------- */

  ipcMain.handle("db:assignments:getByCourse", (_, courseUuid) => {
    return db
      .prepare(`
        SELECT a.* FROM assignments a JOIN courses c ON c.id = a.course_id
        WHERE c.uuid = ? ORDER BY COALESCE(a.due_date, '9999') ASC
      `)
      .all(courseUuid);
  });

  ipcMain.handle("db:assignments:getRange", (_, { from, to }) => {
    return db
      .prepare(`
        SELECT a.*, c.uuid AS course_uuid, c.name AS course_name, c.color AS course_color
        FROM assignments a JOIN courses c ON c.id = a.course_id
        WHERE a.due_date IS NOT NULL AND a.due_date >= ? AND a.due_date < ?
        ORDER BY a.due_date ASC
      `)
      .all(from, to);
  });

  ipcMain.handle("db:assignments:save", (_, a) => {
    const courseId = courseIdFor(db, a?.courseUuid);
    if (!courseId) return { success: false, error: "Course not found" };
    const uuid = a.uuid || newUuid("asg");
    db.prepare(`
      INSERT INTO assignments (uuid, course_id, title, due_date, kind, est_minutes, notes, completed, source, updated_at)
      VALUES (@uuid, @courseId, @title, @dueDate, @kind, @estMinutes, @notes, @completed, 'manual', datetime('now'))
      ON CONFLICT(uuid) DO UPDATE SET
        title = excluded.title, due_date = excluded.due_date, kind = excluded.kind,
        est_minutes = excluded.est_minutes, notes = excluded.notes, completed = excluded.completed,
        updated_at = excluded.updated_at
    `).run({
      uuid,
      courseId,
      title: String(a.title || "Untitled").slice(0, 500),
      dueDate: isoOrNull(a.dueDate),
      kind: a.kind || "assignment",
      estMinutes: Number.isFinite(a.estMinutes) ? a.estMinutes : null,
      notes: a.notes || null,
      completed: a.completed ? 1 : 0,
    });
    return { success: true, uuid };
  });

  ipcMain.handle("db:assignments:setCompleted", (_, { uuid, completed }) => {
    db.prepare("UPDATE assignments SET completed = ?, updated_at = datetime('now') WHERE uuid = ?").run(
      completed ? 1 : 0,
      uuid
    );
    return { success: true };
  });

  ipcMain.handle("db:assignments:delete", (_, uuid) => {
    db.prepare("DELETE FROM assignments WHERE uuid = ? AND source = 'manual'").run(uuid);
    return { success: true };
  });

  /* ---------------- announcements / BB mirror ---------------- */

  ipcMain.handle("db:announcements:getByCourse", (_, courseUuid) => {
    return db
      .prepare(`
        SELECT a.* FROM announcements a JOIN courses c ON c.id = a.course_id
        WHERE c.uuid = ? ORDER BY COALESCE(a.posted_at, a.created_at) DESC LIMIT 100
      `)
      .all(courseUuid);
  });

  ipcMain.handle("db:announcements:markRead", (_, uuid) => {
    db.prepare("UPDATE announcements SET read = 1 WHERE uuid = ?").run(uuid);
    return { success: true };
  });

  ipcMain.handle("db:bb:getItems", (_, courseUuid) => {
    return db
      .prepare(`
        SELECT b.* FROM bb_items b JOIN courses c ON c.id = b.course_id
        WHERE c.uuid = ? ORDER BY b.position ASC
      `)
      .all(courseUuid);
  });

  ipcMain.handle("db:bb:getGradeItems", (_, courseUuid) => gradeItemsWithMapping(db, courseUuid));

  /** componentUuid: a component uuid, "none" to exclude, or null to go back to the automatic match. */
  ipcMain.handle("db:bb:setItemComponent", (_, { courseUuid, bbId, componentUuid }) => {
    const courseId = courseIdFor(db, courseUuid);
    if (!courseId) return { success: false };
    db.prepare("UPDATE bb_grade_items SET component_uuid = ? WHERE course_id = ? AND bb_id = ?").run(
      componentUuid || null,
      courseId,
      String(bbId)
    );
    const result = applyBbGrades(db, courseId);
    return { success: true, ...result, items: gradeItemsWithMapping(db, courseUuid) };
  });

  ipcMain.handle("db:bb:applyGrades", (_, courseUuid) => {
    const courseId = courseIdFor(db, courseUuid);
    if (!courseId) return { success: false };
    return { success: true, ...applyBbGrades(db, courseId) };
  });

  ipcMain.handle("db:bb:applySync", (_, { courseUuid, payload }) => applyBbSync(db, courseUuid, payload));

  /* ---------------- dashboard ---------------- */

  ipcMain.handle("db:dashboard:get", () => {
    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 86400000);
    const upcoming = db
      .prepare(`
        SELECT a.*, c.uuid AS course_uuid, c.name AS course_name, c.color AS course_color
        FROM assignments a JOIN courses c ON c.id = a.course_id
        WHERE a.completed = 0 AND a.due_date IS NOT NULL AND a.due_date >= ? AND a.due_date < ?
        ORDER BY a.due_date ASC LIMIT 20
      `)
      .all(new Date(now.getTime() - 86400000).toISOString(), horizon.toISOString());
    const announcements = db
      .prepare(`
        SELECT a.uuid, a.title, substr(a.body, 1, 600) AS body, a.posted_at, a.read,
               c.uuid AS course_uuid, c.name AS course_name
        FROM announcements a JOIN courses c ON c.id = a.course_id
        ORDER BY COALESCE(a.posted_at, a.created_at) DESC LIMIT 8
      `)
      .all();
    const today = localDate(0);
    const dueCards = db
      .prepare(`
        SELECT c.uuid AS course_uuid, c.name AS course_name, COUNT(f.id) AS total,
               SUM(CASE WHEN m.next_review IS NULL OR m.next_review <= ? THEN 1 ELSE 0 END) AS due
        FROM courses c JOIN flashcards f ON f.course_id = c.id
        LEFT JOIN mastery m ON m.flashcard_id = f.id
        WHERE c.type = 'user'
        GROUP BY c.id HAVING total > 0
        ORDER BY due DESC
      `)
      .all(today);
    const recentGrades = db
      .prepare(`
        SELECT g.name, g.score, g.points_possible, g.graded_at, c.uuid AS course_uuid, c.name AS course_name
        FROM bb_grade_items g JOIN courses c ON c.id = g.course_id
        WHERE g.score IS NOT NULL
        ORDER BY COALESCE(g.graded_at, g.synced_at) DESC LIMIT 6
      `)
      .all();
    return { upcoming, announcements, dueCards, recentGrades, stats: sessionStats(db, null) };
  });

  ipcMain.handle("db:today:get", (_, args) => todayData(db, args?.courseUuid ? String(args.courseUuid) : null));

  /* ---------------- exam ↔ module scope ---------------- */

  ipcMain.handle("db:exams:getScopes", (_, courseUuid) => {
    const courseId = courseIdFor(db, courseUuid);
    if (!courseId) return [];
    return [...examScopes(db, courseId)].map(([examUuid, scope]) => ({ examUuid, ...scope }));
  });

  ipcMain.handle("db:exams:setScope", (_, { examUuid, moduleIds }) =>
    setExamScope(db, String(examUuid || ""), Array.isArray(moduleIds) ? moduleIds.map(String) : null)
  );

  /** Stores coverage rules from syllabus text; a syllabus with no coverage keeps the previous rules. */
  ipcMain.handle("db:exams:setSyllabusCoverage", (_, { courseUuid, text }) => {
    const courseId = courseIdFor(db, courseUuid);
    if (!courseId) return { success: false, count: 0 };
    const rules = parseExamCoverage(String(text || "").slice(0, 200000));
    if (rules.length) db.prepare("UPDATE courses SET exam_coverage_json = ? WHERE id = ?").run(JSON.stringify(rules), courseId);
    return { success: true, count: rules.length };
  });

  /** Not an edit to the course itself, so updated_at (course list order) is left alone. */
  ipcMain.handle("db:courses:setTargetGrade", (_, { courseUuid, targetGrade }) => {
    const value = Number(targetGrade);
    if (!Number.isFinite(value) || value < 0 || value > 100) return { success: false };
    const res = db.prepare("UPDATE courses SET target_grade = ? WHERE uuid = ?").run(value, courseUuid);
    return { success: res.changes > 0 };
  });

  /* ---------------- study sessions ---------------- */

  ipcMain.handle("db:sessions:log", (_, s) => {
    const courseId = s?.courseUuid ? courseIdFor(db, s.courseUuid) : null;
    const reviewed = Math.max(0, Number(s?.reviewed) || 0);
    if (!reviewed) return { success: true, skipped: true };
    db.prepare(`
      INSERT INTO study_sessions (uuid, course_id, kind, started_at, ended_at, cards_reviewed, correct, incorrect)
      VALUES (@uuid, @courseId, @kind, @startedAt, @endedAt, @reviewed, @correct, @incorrect)
    `).run({
      uuid: s.uuid || newUuid("ses"),
      courseId,
      kind: s.kind || "drill",
      startedAt: isoOrNull(s.startedAt) || new Date().toISOString(),
      endedAt: isoOrNull(s.endedAt) || new Date().toISOString(),
      reviewed,
      correct: Math.max(0, Number(s.correct) || 0),
      incorrect: Math.max(0, Number(s.incorrect) || 0),
    });
    return { success: true };
  });

  ipcMain.handle("db:sessions:stats", (_, courseUuid) => sessionStats(db, courseUuid || null));

  ipcMain.handle("db:sessions:history", (_, args) => {
    const courseId = args?.courseUuid ? courseIdFor(db, args.courseUuid) : null;
    if (args?.courseUuid && !courseId) return [];
    const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 200);
    return db
      .prepare(`
        SELECT uuid, kind, started_at, ended_at, cards_reviewed, correct, incorrect
        FROM study_sessions ${courseId ? "WHERE course_id = ?" : ""}
        ORDER BY started_at DESC LIMIT ?
      `)
      .all(...(courseId ? [courseId, limit] : [limit]));
  });

  /* ---------------- web resources ---------------- */

  ipcMain.handle("db:web:getByCourse", (_, courseUuid) => {
    return db
      .prepare(`
        SELECT w.*, m.uuid AS module_uuid FROM web_resources w
        JOIN courses c ON c.id = w.course_id
        LEFT JOIN modules m ON m.id = w.module_id
        WHERE c.uuid = ? ORDER BY w.saved_at DESC
      `)
      .all(courseUuid);
  });

  ipcMain.handle("db:web:save", (_, r) => {
    const courseId = courseIdFor(db, r?.courseUuid);
    if (!courseId || !/^https?:\/\//i.test(String(r?.url || ""))) return { success: false };
    const moduleId = r.moduleUuid
      ? db.prepare("SELECT id FROM modules WHERE uuid = ?").get(r.moduleUuid)?.id ?? null
      : null;
    const uuid = r.uuid || newUuid("web");
    db.prepare(`
      INSERT INTO web_resources (uuid, course_id, module_id, title, url, summary, source)
      VALUES (@uuid, @courseId, @moduleId, @title, @url, @summary, @source)
      ON CONFLICT(uuid) DO UPDATE SET title = excluded.title, summary = excluded.summary, module_id = excluded.module_id
    `).run({
      uuid,
      courseId,
      moduleId,
      title: String(r.title || r.url).slice(0, 300),
      url: String(r.url),
      summary: r.summary ? String(r.summary).slice(0, 1000) : null,
      source: r.source || "web",
    });
    return { success: true, uuid };
  });

  ipcMain.handle("db:web:delete", (_, uuid) => {
    db.prepare("DELETE FROM web_resources WHERE uuid = ?").run(uuid);
    return { success: true };
  });
}

module.exports = { registerMirrorHandlers, applyBbSync, ensureCourseForBb };
