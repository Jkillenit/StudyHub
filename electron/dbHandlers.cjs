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
/* Granular upserts. Only rows missing from the incoming list are      */
/* deleted, so untouched rows (and their mastery/grade children) are   */
/* never cascaded away. Upserts skip rows whose values are unchanged.  */
/* ------------------------------------------------------------------ */

/** table/scopeCol are code constants, never renderer input. */
function pruneMissing(db, table, scopeCol, scopeId, keepUuids) {
  db.prepare(`DELETE FROM ${table} WHERE ${scopeCol} = ? AND uuid NOT IN (SELECT value FROM json_each(?))`).run(
    scopeId,
    JSON.stringify([...keepUuids])
  );
}

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
      AND (modules.title, modules.position, modules.reviewed, modules.disabled)
          IS NOT (excluded.title, excluded.position, excluded.reviewed, excluded.disabled)
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
  return db.prepare(`
    INSERT INTO notes (module_id, html, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(module_id) DO UPDATE SET html = excluded.html, updated_at = excluded.updated_at
    WHERE notes.html IS NOT excluded.html
  `).run(moduleId, String(html || ""));
}

function syncContentItems(db, moduleId, items) {
  const rows = Array.isArray(items) ? items : [];
  pruneMissing(db, "content_items", "module_id", moduleId, rows.map((item) => item.uuid).filter(Boolean));
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
    WHERE (content_items.module_id, content_items.section_type, content_items.section_title, content_items.term,
           content_items.definition, content_items.body, content_items.items_json, content_items.is_numbered,
           content_items.confidence, content_items.source, content_items.enhanced_by_ai, content_items.position)
      IS NOT (excluded.module_id, excluded.section_type, excluded.section_title, excluded.term,
              excluded.definition, excluded.body, excluded.items_json, excluded.is_numbered,
              excluded.confidence, excluded.source, excluded.enhanced_by_ai, excluded.position)
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

function syncFlashcards(db, courseId, cards, moduleIds) {
  const rows = Array.isArray(cards) ? cards : [];
  pruneMissing(db, "flashcards", "course_id", courseId, rows.map((card) => card.uuid || card.id).filter(Boolean));
  const stmt = db.prepare(`
    INSERT INTO flashcards (uuid, course_id, module_id, front, back, source)
    VALUES (@uuid, @courseId, @moduleId, @front, @back, @source)
    ON CONFLICT(uuid) DO UPDATE SET
      module_id = excluded.module_id,
      front = excluded.front,
      back = excluded.back,
      source = excluded.source
    WHERE flashcards.course_id = excluded.course_id
      AND (flashcards.module_id, flashcards.front, flashcards.back, flashcards.source)
          IS NOT (excluded.module_id, excluded.front, excluded.back, excluded.source)
  `);
  for (const card of rows) {
    const front = String(card.front || "").trim();
    const back = String(card.back || "").trim();
    if (!front || !back) continue;
    stmt.run({
      uuid: card.uuid || card.id || newUuid("fc"),
      courseId,
      moduleId: moduleIds.get(card.moduleUuid) ?? null,
      front,
      back,
      source: card.source || "manual",
    });
  }
}

function syncGlossary(db, courseId, terms, moduleIds) {
  const rows = Array.isArray(terms) ? terms : [];
  pruneMissing(db, "glossary_terms", "course_id", courseId, rows.map((t) => t.uuid || t.id).filter(Boolean));
  const stmt = db.prepare(`
    INSERT INTO glossary_terms (uuid, course_id, module_id, term, definition, confidence, source)
    VALUES (@uuid, @courseId, @moduleId, @term, @definition, @confidence, @source)
    ON CONFLICT(uuid) DO UPDATE SET
      module_id = excluded.module_id,
      term = excluded.term,
      definition = excluded.definition,
      confidence = excluded.confidence,
      source = excluded.source
    WHERE glossary_terms.course_id = excluded.course_id
      AND (glossary_terms.module_id, glossary_terms.term, glossary_terms.definition,
           glossary_terms.confidence, glossary_terms.source)
          IS NOT (excluded.module_id, excluded.term, excluded.definition, excluded.confidence, excluded.source)
  `);
  for (const term of rows) {
    const text = String(term.term || "").trim();
    const definition = String(term.definition || "").trim();
    if (!text || !definition) continue;
    try {
      stmt.run({
        uuid: term.uuid || term.id || newUuid("gls"),
        courseId,
        moduleId: moduleIds.get(term.moduleUuid) ?? null,
        term: text,
        definition,
        confidence: term.confidence || "high",
        source: term.source || "manual",
      });
    } catch (err) {
      // Same term under another uuid (idx_glossary_unique_term): keep the existing row.
      if (!String(err?.message || "").includes("UNIQUE")) throw err;
    }
  }
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
  pruneMissing(db, "grade_components", "course_id", courseId, resolved.map((r) => r.uuid));
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
  const contentByModule = new Map(modules.map((m) => [m.id, []]));
  db.prepare(`
    SELECT ci.* FROM content_items ci
    JOIN modules m ON m.id = ci.module_id
    WHERE m.course_id = ?
    ORDER BY ci.position ASC, ci.id ASC
  `)
    .all(course.id)
    .forEach((row) => contentByModule.get(row.module_id)?.push(row));
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
    modules: modules.map((m) => ({ ...m, content: contentByModule.get(m.id) })),
    flashcards,
    glossary,
  };
}

function saveFullCourse(db, payload) {
  const tx = db.transaction((data) => {
    const courseId = upsertCourse(db, data);
    const modules = Array.isArray(data.modules) ? data.modules : [];
    pruneMissing(db, "modules", "course_id", courseId, modules.map((m) => m.uuid).filter(Boolean));
    const moduleIds = new Map();
    modules.forEach((mod, position) => {
      const moduleId = upsertModule(db, courseId, mod, position);
      if (!moduleId) return;
      moduleIds.set(mod.uuid, moduleId);
      saveNote(db, moduleId, mod.html);
      syncContentItems(db, moduleId, mod.content);
    });
    syncFlashcards(db, courseId, data.flashcards, moduleIds);
    syncGlossary(db, courseId, data.glossary, moduleIds);
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

  ipcMain.handle("db:courses:delete", (_, courseUuid) => {
    if (!courseUuid) return { success: false };
    try {
      return deleteCourse(db, courseUuid);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /* ---------------- notes / mastery ---------------- */

  ipcMain.handle("db:notes:save", (_, { moduleUuid, html }) => {
    const moduleId = moduleIdFor(db, moduleUuid);
    if (!moduleId) return { success: true, skipped: true };
    if (saveNote(db, moduleId, html).changes) {
      db.prepare("UPDATE courses SET updated_at = datetime('now') WHERE id = (SELECT course_id FROM modules WHERE id = ?)").run(
        moduleId
      );
    }
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

  /* ---------------- grades ---------------- */

  ipcMain.handle("db:grades:getComponents", (_, courseUuid) => getGradeComponentsWithScores(db, courseUuid));

  ipcMain.handle("db:grades:saveComponents", (_, { courseUuid, components }) => {
    const courseId = courseIdFor(db, courseUuid);
    if (!courseId) throw new Error("Course not found");
    db.transaction(() => syncGradeComponents(db, courseId, components))();
    return getGradeComponentsWithScores(db, courseUuid);
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
