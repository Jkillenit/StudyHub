const { ipcMain } = require("electron");
const { getDb } = require("./database.cjs");

let handlersRegistered = false;

function newUuid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function courseIdFor(db, courseUuid) {
  return db.prepare("SELECT id FROM courses WHERE uuid = ?").get(courseUuid)?.id ?? null;
}

function moduleIdFor(db, moduleUuid) {
  if (!moduleUuid) return null;
  return db.prepare("SELECT id FROM modules WHERE uuid = ?").get(moduleUuid)?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* Granular upserts. Rows missing from the incoming list are deleted   */
/* individually, so untouched rows (and their mastery/grade children)  */
/* are never cascaded away.                                            */
/* ------------------------------------------------------------------ */

function upsertCourse(db, course) {
  const row = {
    uuid: course.uuid,
    name: String(course.name || "Untitled course"),
    color: course.color || null,
    bbCourseId: course.bbCourseId || null,
    subtitle: course.subtitle || null,
    term: course.term || null,
    courseCode: course.courseCode || null,
    instructor: course.instructor || null,
    metaJson: course.meta ? JSON.stringify(course.meta) : null,
  };
  db.prepare(`
    INSERT INTO courses (uuid, name, type, color, bb_course_id, subtitle, term, course_code, instructor, meta_json)
    VALUES (@uuid, @name, 'user', @color, @bbCourseId, @subtitle, @term, @courseCode, @instructor, @metaJson)
    ON CONFLICT(uuid) DO UPDATE SET
      name = excluded.name,
      color = excluded.color,
      bb_course_id = COALESCE(excluded.bb_course_id, courses.bb_course_id),
      subtitle = excluded.subtitle,
      term = COALESCE(excluded.term, courses.term),
      course_code = COALESCE(excluded.course_code, courses.course_code),
      instructor = COALESCE(excluded.instructor, courses.instructor),
      meta_json = COALESCE(excluded.meta_json, courses.meta_json),
      updated_at = datetime('now')
  `).run(row);
  return courseIdFor(db, course.uuid);
}

function upsertModule(db, courseId, mod, position) {
  db.prepare(`
    INSERT INTO modules (uuid, course_id, title, position, reviewed, disabled)
    VALUES (@uuid, @courseId, @title, @position, @reviewed, @disabled)
    ON CONFLICT(uuid) DO UPDATE SET
      title = excluded.title,
      position = excluded.position,
      reviewed = excluded.reviewed,
      disabled = excluded.disabled,
      updated_at = datetime('now')
    WHERE modules.course_id = excluded.course_id
  `).run({
    uuid: mod.uuid,
    courseId,
    title: String(mod.title || "General"),
    position,
    reviewed: mod.reviewed ? 1 : 0,
    disabled: mod.disabled ? 1 : 0,
  });
  return moduleIdFor(db, mod.uuid);
}

function saveNote(db, moduleId, html) {
  db.prepare(`
    INSERT INTO notes (module_id, html, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(module_id) DO UPDATE SET html = excluded.html, updated_at = excluded.updated_at
    WHERE notes.html IS NOT excluded.html
  `).run(moduleId, String(html || ""));
}

function syncContentItems(db, moduleId, items) {
  const rows = Array.isArray(items) ? items : [];
  const keep = new Set(rows.map((item) => item.uuid).filter(Boolean));
  const existing = db.prepare("SELECT uuid FROM content_items WHERE module_id = ?").all(moduleId);
  const del = db.prepare("DELETE FROM content_items WHERE uuid = ?");
  existing.forEach((row) => {
    if (!keep.has(row.uuid)) del.run(row.uuid);
  });
  const stmt = db.prepare(`
    INSERT INTO content_items (
      uuid, module_id, section_type, section_title, term, definition,
      body, items_json, is_numbered, confidence, source, enhanced_by_ai, position
    ) VALUES (
      @uuid, @moduleId, @sectionType, @sectionTitle, @term, @definition,
      @body, @itemsJson, @isNumbered, @confidence, @source, @enhancedByAI, @position
    )
    ON CONFLICT(uuid) DO UPDATE SET
      module_id = excluded.module_id,
      section_type = excluded.section_type,
      section_title = excluded.section_title,
      term = excluded.term,
      definition = excluded.definition,
      body = excluded.body,
      items_json = excluded.items_json,
      is_numbered = excluded.is_numbered,
      confidence = excluded.confidence,
      source = excluded.source,
      enhanced_by_ai = excluded.enhanced_by_ai,
      position = excluded.position
  `);
  rows.forEach((item, index) => {
    stmt.run({
      uuid: item.uuid || newUuid("ci"),
      moduleId,
      sectionType: item.section_type || "definitions",
      sectionTitle: item.section_title || null,
      term: item.term || null,
      definition: item.definition || null,
      body: item.body || null,
      itemsJson: item.items_json || (item.items ? JSON.stringify(item.items) : null),
      isNumbered: item.is_numbered ? 1 : 0,
      confidence: item.confidence || "high",
      source: item.source || "pptx",
      enhancedByAI: item.enhanced_by_ai ? 1 : 0,
      position: Number.isFinite(item.position) ? item.position : index,
    });
  });
}

function upsertFlashcard(db, courseId, card, fallbackModuleId = null) {
  const front = String(card.front || "").trim();
  const back = String(card.back || "").trim();
  if (!front || !back) return;
  db.prepare(`
    INSERT INTO flashcards (uuid, course_id, module_id, front, back, source)
    VALUES (@uuid, @courseId, @moduleId, @front, @back, @source)
    ON CONFLICT(uuid) DO UPDATE SET
      module_id = excluded.module_id,
      front = excluded.front,
      back = excluded.back,
      source = excluded.source
    WHERE flashcards.course_id = excluded.course_id
  `).run({
    uuid: card.uuid || card.id || newUuid("fc"),
    courseId,
    moduleId: moduleIdFor(db, card.moduleUuid) ?? fallbackModuleId,
    front,
    back,
    source: card.source || "manual",
  });
}

function syncFlashcards(db, courseId, cards) {
  const rows = Array.isArray(cards) ? cards : [];
  const keep = new Set(rows.map((card) => card.uuid || card.id).filter(Boolean));
  const existing = db.prepare("SELECT uuid FROM flashcards WHERE course_id = ?").all(courseId);
  const del = db.prepare("DELETE FROM flashcards WHERE uuid = ?");
  existing.forEach((row) => {
    if (!keep.has(row.uuid)) del.run(row.uuid);
  });
  rows.forEach((card) => upsertFlashcard(db, courseId, card));
}

function upsertGlossaryTerm(db, courseId, term, fallbackModuleId = null) {
  const text = String(term.term || "").trim();
  const definition = String(term.definition || "").trim();
  if (!text || !definition) return;
  const uuid = term.uuid || term.id || newUuid("gls");
  const params = {
    uuid,
    courseId,
    moduleId: moduleIdFor(db, term.moduleUuid) ?? fallbackModuleId,
    term: text,
    definition,
    confidence: term.confidence || "high",
    source: term.source || "manual",
  };
  const exists = db.prepare("SELECT id FROM glossary_terms WHERE uuid = ?").get(uuid);
  try {
    if (exists) {
      db.prepare(`
        UPDATE glossary_terms
        SET module_id = @moduleId, term = @term, definition = @definition,
            confidence = @confidence, source = @source
        WHERE uuid = @uuid AND course_id = @courseId
      `).run(params);
    } else {
      db.prepare(`
        INSERT OR IGNORE INTO glossary_terms (uuid, course_id, module_id, term, definition, confidence, source)
        VALUES (@uuid, @courseId, @moduleId, @term, @definition, @confidence, @source)
      `).run(params);
    }
  } catch (err) {
    if (!String(err?.message || "").includes("UNIQUE")) throw err;
  }
}

function syncGlossary(db, courseId, terms) {
  const rows = Array.isArray(terms) ? terms : [];
  const keep = new Set(rows.map((t) => t.uuid || t.id).filter(Boolean));
  const existing = db.prepare("SELECT uuid FROM glossary_terms WHERE course_id = ?").all(courseId);
  const del = db.prepare("DELETE FROM glossary_terms WHERE uuid = ?");
  existing.forEach((row) => {
    if (!keep.has(row.uuid)) del.run(row.uuid);
  });
  rows.forEach((term) => upsertGlossaryTerm(db, courseId, term));
}

function syncGradeComponents(db, courseId, components) {
  const rows = Array.isArray(components) ? components : [];
  const existing = db.prepare("SELECT id, uuid FROM grade_components WHERE course_id = ?").all(courseId);
  const byUuid = new Map(existing.map((row) => [row.uuid, row]));
  const byId = new Map(existing.map((row) => [row.id, row]));
  const resolved = rows.map((component) => {
    const match = (component.uuid && byUuid.get(component.uuid)) || (component.id && byId.get(component.id)) || null;
    return { component, uuid: match?.uuid || component.uuid || newUuid("gc") };
  });
  const keep = new Set(resolved.map((r) => r.uuid));
  const del = db.prepare("DELETE FROM grade_components WHERE uuid = ?");
  existing.forEach((row) => {
    if (!keep.has(row.uuid)) del.run(row.uuid);
  });
  const stmt = db.prepare(`
    INSERT INTO grade_components (uuid, course_id, name, weight, category, position)
    VALUES (@uuid, @courseId, @name, @weight, @category, @position)
    ON CONFLICT(uuid) DO UPDATE SET
      name = excluded.name,
      weight = excluded.weight,
      category = excluded.category,
      position = excluded.position
  `);
  resolved.forEach(({ component, uuid }, position) => {
    stmt.run({
      uuid,
      courseId,
      name: String(component.name || "Component"),
      weight: Number(component.weight) || 0,
      category: component.category || "other",
      position,
    });
  });
}

function getGradeComponentsWithScores(db, courseUuid) {
  return db
    .prepare(`
      SELECT gc.*, ge.score AS score
      FROM grade_components gc
      JOIN courses c ON c.id = gc.course_id
      LEFT JOIN grade_entries ge ON ge.component_id = gc.id AND ge.is_main = 1
      WHERE c.uuid = ?
      GROUP BY gc.id
      ORDER BY gc.position ASC
    `)
    .all(courseUuid);
}

function getFullCourse(db, courseUuid) {
  const course = db.prepare("SELECT * FROM courses WHERE uuid = ?").get(courseUuid);
  if (!course) return null;
  const modules = db
    .prepare(`
      SELECT m.*, n.html AS note_html
      FROM modules m
      LEFT JOIN notes n ON n.module_id = m.id
      WHERE m.course_id = ?
      ORDER BY m.position ASC, m.id ASC
    `)
    .all(course.id);
  const contentStmt = db.prepare("SELECT * FROM content_items WHERE module_id = ? ORDER BY position ASC, id ASC");
  const flashcards = db
    .prepare(`
      SELECT f.*, mod.uuid AS module_uuid, m.ease_factor, m.interval_days, m.repetitions,
             m.next_review, m.last_review, m.last_grade
      FROM flashcards f
      LEFT JOIN modules mod ON mod.id = f.module_id
      LEFT JOIN mastery m ON m.flashcard_id = f.id
      WHERE f.course_id = ?
      ORDER BY f.created_at ASC, f.id ASC
    `)
    .all(course.id);
  const glossary = db
    .prepare(`
      SELECT g.*, mod.uuid AS module_uuid
      FROM glossary_terms g
      LEFT JOIN modules mod ON mod.id = g.module_id
      WHERE g.course_id = ?
      ORDER BY lower(g.term) ASC
    `)
    .all(course.id);
  return {
    course: { ...course, meta: safeJsonParse(course.meta_json, {}) },
    modules: modules.map((m) => ({ ...m, content: contentStmt.all(m.id) })),
    flashcards,
    glossary,
  };
}

function saveFullCourse(db, payload) {
  const tx = db.transaction((data) => {
    const courseId = upsertCourse(db, data);
    const modules = Array.isArray(data.modules) ? data.modules : [];
    const keep = new Set(modules.map((m) => m.uuid));
    const existing = db.prepare("SELECT uuid FROM modules WHERE course_id = ?").all(courseId);
    const del = db.prepare("DELETE FROM modules WHERE uuid = ?");
    existing.forEach((row) => {
      if (!keep.has(row.uuid)) del.run(row.uuid);
    });
    modules.forEach((mod, position) => {
      const moduleId = upsertModule(db, courseId, mod, position);
      if (!moduleId) return;
      saveNote(db, moduleId, mod.html);
      syncContentItems(db, moduleId, mod.content);
    });
    syncFlashcards(db, courseId, data.flashcards);
    syncGlossary(db, courseId, data.glossary);
  });
  tx(payload);
  return { success: true };
}

function deleteCourse(db, courseUuid) {
  const course = db.prepare("SELECT id FROM courses WHERE uuid = ?").get(courseUuid);
  if (!course) return { success: true };
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM settings WHERE key = ?").run(`grading_scale_${courseUuid}`);
    db.prepare("DELETE FROM courses WHERE id = ?").run(course.id);
  });
  tx();
  return { success: true };
}

function registerDbHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;

  const db = getDb();

  /* ---------------- courses ---------------- */

  ipcMain.handle("db:courses:getAll", () => {
    return db
      .prepare(`
        SELECT c.*, COUNT(DISTINCT m.id) as module_count
        FROM courses c
        LEFT JOIN modules m ON m.course_id = c.id
        WHERE c.type = 'user'
        GROUP BY c.id
        ORDER BY c.updated_at DESC
      `)
      .all();
  });

  ipcMain.handle("db:courses:get", (_, uuid) => db.prepare("SELECT * FROM courses WHERE uuid = ?").get(uuid));

  ipcMain.handle("db:courses:getFull", (_, uuid) => getFullCourse(db, uuid));

  ipcMain.handle("db:courses:saveFull", (_, payload) => {
    if (!payload?.uuid) return { success: false, error: "Missing course uuid" };
    return saveFullCourse(db, payload);
  });

  ipcMain.handle("db:courses:create", (_, course) => {
    upsertCourse(db, course);
    return db.prepare("SELECT * FROM courses WHERE uuid = ?").get(course.uuid);
  });

  ipcMain.handle("db:courses:update", (_, { uuid, ...fields }) => {
    const columns = {
      name: "name",
      color: "color",
      subtitle: "subtitle",
      bbCourseId: "bb_course_id",
      term: "term",
      courseCode: "course_code",
      instructor: "instructor",
    };
    const keys = Object.keys(fields).filter((key) => columns[key]);
    if (!keys.length) return null;
    const sets = keys.map((key) => `${columns[key]} = @${key}`).join(", ");
    db.prepare(`UPDATE courses SET ${sets}, updated_at = datetime('now') WHERE uuid = @uuid`).run({ uuid, ...fields });
    return db.prepare("SELECT * FROM courses WHERE uuid = ?").get(uuid);
  });

  ipcMain.handle("db:courses:findByBbId", (_, bbCourseId) => {
    if (!bbCourseId) return null;
    return db.prepare("SELECT * FROM courses WHERE bb_course_id = ? ORDER BY id ASC LIMIT 1").get(bbCourseId) || null;
  });

  ipcMain.handle("db:courses:delete", (_, courseUuid) => {
    if (!courseUuid) return { success: false };
    try {
      return deleteCourse(db, courseUuid);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /* ---------------- modules / notes / content ---------------- */

  ipcMain.handle("db:modules:getByCourse", (_, courseUuid) => {
    return db
      .prepare(`
        SELECT m.* FROM modules m
        JOIN courses c ON c.id = m.course_id
        WHERE c.uuid = ?
        ORDER BY m.position ASC
      `)
      .all(courseUuid);
  });

  ipcMain.handle("db:modules:create", (_, moduleData) => {
    const courseId = courseIdFor(db, moduleData.courseUuid);
    if (!courseId) throw new Error("Course not found");
    upsertModule(db, courseId, moduleData, moduleData.position || 0);
    return db.prepare("SELECT * FROM modules WHERE uuid = ?").get(moduleData.uuid);
  });

  ipcMain.handle("db:modules:update", (_, { uuid, ...fields }) => {
    const columns = { title: "title", position: "position", reviewed: "reviewed", disabled: "disabled" };
    const keys = Object.keys(fields).filter((key) => columns[key] && fields[key] !== undefined);
    if (!keys.length) return { success: true };
    const params = { uuid };
    keys.forEach((key) => {
      const value = fields[key];
      params[key] = typeof value === "boolean" ? (value ? 1 : 0) : value;
    });
    const sets = keys.map((key) => `${columns[key]} = @${key}`).join(", ");
    db.prepare(`UPDATE modules SET ${sets}, updated_at = datetime('now') WHERE uuid = @uuid`).run(params);
    return { success: true };
  });

  ipcMain.handle("db:modules:delete", (_, uuid) => {
    db.prepare("DELETE FROM modules WHERE uuid = ?").run(uuid);
    return { success: true };
  });

  ipcMain.handle("db:notes:get", (_, moduleUuid) => {
    return db
      .prepare("SELECT n.* FROM notes n JOIN modules m ON m.id = n.module_id WHERE m.uuid = ?")
      .get(moduleUuid);
  });

  ipcMain.handle("db:notes:save", (_, { moduleUuid, html }) => {
    const moduleId = moduleIdFor(db, moduleUuid);
    if (!moduleId) return { success: true, skipped: true };
    saveNote(db, moduleId, html);
    return { success: true };
  });

  ipcMain.handle("db:content:getByModule", (_, moduleUuid) => {
    return db
      .prepare(`
        SELECT ci.* FROM content_items ci
        JOIN modules m ON m.id = ci.module_id
        WHERE m.uuid = ?
        ORDER BY ci.position ASC
      `)
      .all(moduleUuid);
  });

  ipcMain.handle("db:content:saveMany", (_, { moduleUuid, items }) => {
    const moduleId = moduleIdFor(db, moduleUuid);
    if (!moduleId) throw new Error("Module not found");
    db.transaction(() => syncContentItems(db, moduleId, items))();
    return { success: true, count: (items || []).length };
  });

  /* ---------------- flashcards / mastery ---------------- */

  ipcMain.handle("db:flashcards:getByCourse", (_, courseUuid) => {
    return db
      .prepare(`
        SELECT f.*, mod.uuid as module_uuid, m.ease_factor, m.interval_days, m.repetitions,
               m.next_review, m.last_review, m.last_grade
        FROM flashcards f
        JOIN courses c ON c.id = f.course_id
        LEFT JOIN modules mod ON mod.id = f.module_id
        LEFT JOIN mastery m ON m.flashcard_id = f.id
        WHERE c.uuid = ?
        ORDER BY f.created_at ASC
      `)
      .all(courseUuid);
  });

  ipcMain.handle("db:flashcards:getDue", (_, courseUuid) => {
    return db
      .prepare(`
        SELECT f.*, m.ease_factor, m.interval_days, m.repetitions, m.next_review
        FROM flashcards f
        JOIN courses c ON c.id = f.course_id
        LEFT JOIN mastery m ON m.flashcard_id = f.id
        WHERE c.uuid = ?
          AND (m.next_review IS NULL OR m.next_review <= date('now', 'localtime'))
        ORDER BY COALESCE(m.next_review, '1970-01-01') ASC
      `)
      .all(courseUuid);
  });

  ipcMain.handle("db:flashcards:saveMany", (_, { courseUuid, moduleUuid, cards }) => {
    const courseId = courseIdFor(db, courseUuid);
    if (!courseId) throw new Error("Course not found");
    const fallbackModuleId = moduleIdFor(db, moduleUuid);
    db.transaction(() => (cards || []).forEach((card) => upsertFlashcard(db, courseId, card, fallbackModuleId)))();
    return { success: true };
  });

  ipcMain.handle("db:flashcards:replaceForCourse", (_, { courseUuid, cards }) => {
    const courseId = courseIdFor(db, courseUuid);
    if (!courseId) throw new Error("Course not found");
    db.transaction(() => syncFlashcards(db, courseId, cards))();
    return { success: true };
  });

  ipcMain.handle(
    "db:mastery:update",
    (_, { flashcardUuid, grade, easeFactor, intervalDays, repetitions, nextReview, sessionId }) => {
      const card = db.prepare("SELECT id FROM flashcards WHERE uuid = ?").get(flashcardUuid);
      if (!card) return { success: false, error: "Flashcard not found" };
      db.transaction(() => {
        db.prepare(`
          INSERT INTO mastery (flashcard_id, ease_factor, interval_days, repetitions, next_review, last_review, last_grade)
          VALUES (@cardId, @easeFactor, @intervalDays, @repetitions, @nextReview, date('now', 'localtime'), @grade)
          ON CONFLICT(flashcard_id) DO UPDATE
          SET ease_factor = @easeFactor, interval_days = @intervalDays, repetitions = @repetitions,
              next_review = @nextReview, last_review = date('now', 'localtime'), last_grade = @grade,
              updated_at = datetime('now')
        `).run({ cardId: card.id, easeFactor, intervalDays, repetitions, nextReview, grade });
        db.prepare("INSERT INTO card_reviews (flashcard_id, grade, session_id) VALUES (?, ?, ?)").run(
          card.id,
          grade,
          sessionId || null
        );
      })();
      return { success: true };
    }
  );

  /* ---------------- glossary ---------------- */

  ipcMain.handle("db:glossary:getByCourse", (_, courseUuid) => {
    return db
      .prepare(`
        SELECT g.*, mod.uuid as module_uuid
        FROM glossary_terms g
        JOIN courses c ON c.id = g.course_id
        LEFT JOIN modules mod ON mod.id = g.module_id
        WHERE c.uuid = ?
        ORDER BY lower(g.term) ASC
      `)
      .all(courseUuid);
  });

  ipcMain.handle("db:glossary:saveMany", (_, { courseUuid, moduleUuid, terms }) => {
    const courseId = courseIdFor(db, courseUuid);
    if (!courseId) throw new Error("Course not found");
    const fallbackModuleId = moduleIdFor(db, moduleUuid);
    db.transaction(() => (terms || []).forEach((term) => upsertGlossaryTerm(db, courseId, term, fallbackModuleId)))();
    return { success: true };
  });

  ipcMain.handle("db:glossary:replaceForCourse", (_, { courseUuid, terms }) => {
    const courseId = courseIdFor(db, courseUuid);
    if (!courseId) throw new Error("Course not found");
    db.transaction(() => syncGlossary(db, courseId, terms))();
    return { success: true };
  });

  ipcMain.handle("db:glossary:delete", (_, uuid) => {
    db.prepare("DELETE FROM glossary_terms WHERE uuid = ?").run(uuid);
    return { success: true };
  });

  /* ---------------- settings ---------------- */

  ipcMain.handle("db:settings:get", (_, key) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row?.value ?? null;
  });

  ipcMain.handle("db:settings:set", (_, { key, value }) => {
    if (key === "apiKey") return { success: false, error: "API keys are stored in the main process only." };
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = datetime('now')"
    ).run({ key, value: String(value ?? "") });
    return { success: true };
  });

  ipcMain.handle("db:settings:getAll", () => {
    const rows = db.prepare("SELECT key, value FROM settings").all();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  });

  /* ---------------- grades ---------------- */

  ipcMain.handle("db:grades:getComponents", (_, courseUuid) => getGradeComponentsWithScores(db, courseUuid));

  ipcMain.handle("db:grades:saveComponents", (_, { courseUuid, components }) => {
    const courseId = courseIdFor(db, courseUuid);
    if (!courseId) throw new Error("Course not found");
    db.transaction(() => syncGradeComponents(db, courseId, components))();
    return getGradeComponentsWithScores(db, courseUuid);
  });

  ipcMain.handle("db:grades:getEntries", (_, courseUuid) => {
    return db
      .prepare(`
        SELECT ge.*, gc.name as component_name, gc.weight, gc.category, gc.id as component_id
        FROM grade_entries ge
        JOIN grade_components gc ON gc.id = ge.component_id
        JOIN courses c ON c.id = gc.course_id
        WHERE c.uuid = ? AND ge.is_main = 1
        ORDER BY gc.position ASC
      `)
      .all(courseUuid);
  });

  ipcMain.handle("db:grades:upsertEntry", (_, { componentId, score }) => {
    db.transaction(() => {
      const current = db
        .prepare("SELECT id FROM grade_entries WHERE component_id = ? AND is_main = 1 ORDER BY id ASC LIMIT 1")
        .get(componentId);
      if (current?.id) {
        db.prepare("UPDATE grade_entries SET score = ?, graded_at = datetime('now') WHERE id = ?").run(
          score ?? null,
          current.id
        );
      } else {
        db.prepare(
          "INSERT INTO grade_entries (component_id, score, is_main, graded_at) VALUES (?, ?, 1, datetime('now'))"
        ).run(componentId, score ?? null);
      }
    })();
    return { success: true };
  });

  ipcMain.handle("db:grades:getSubEntries", (_, componentId) => {
    return db
      .prepare("SELECT * FROM grade_entries WHERE component_id = ? AND is_main = 0 ORDER BY created_at ASC, id ASC")
      .all(componentId);
  });

  ipcMain.handle("db:grades:saveSubEntry", (_, { componentId, score, label }) => {
    db.prepare(
      "INSERT INTO grade_entries (component_id, score, label, is_main, graded_at) VALUES (?, ?, ?, 0, datetime('now'))"
    ).run(componentId, score ?? null, label || "Entry");
    return { success: true };
  });

  ipcMain.handle("db:grades:deleteSubEntry", (_, id) => {
    db.prepare("DELETE FROM grade_entries WHERE id = ? AND is_main = 0").run(id);
    return { success: true };
  });

  ipcMain.handle("db:grades:saveGradingScale", (_, { courseUuid, scale }) => {
    if (!courseIdFor(db, courseUuid)) return { success: false };
    db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(`grading_scale_${courseUuid}`, JSON.stringify(scale || null));
    return { success: true };
  });

  ipcMain.handle("db:grades:getGradingScale", (_, courseUuid) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(`grading_scale_${courseUuid}`);
    return safeJsonParse(row?.value, null);
  });
}

module.exports = {
  registerDbHandlers,
  getFullCourse,
  saveFullCourse,
  courseIdFor,
  newUuid,
  safeJsonParse,
};
