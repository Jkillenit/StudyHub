const { ipcMain } = require("electron");
const { getDb } = require("./database.cjs");

let handlersRegistered = false;

function registerDbHandlers() {
  if (handlersRegistered) {
    console.warn("[DB] Handlers already registered — skipping");
    return;
  }
  handlersRegistered = true;

  const db = getDb();

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

  ipcMain.handle("db:courses:create", (_, course) => {
    const stmt = db.prepare("INSERT INTO courses (uuid, name, type, color) VALUES (@uuid, @name, @type, @color)");
    const result = stmt.run(course);
    return db.prepare("SELECT * FROM courses WHERE id = ?").get(result.lastInsertRowid);
  });

  ipcMain.handle("db:courses:update", (_, { uuid, ...fields }) => {
    const allowed = ["name", "color"];
    const sets = Object.keys(fields)
      .filter((key) => allowed.includes(key))
      .map((key) => `${key} = @${key}`)
      .join(", ");
    if (!sets) return null;
    db.prepare(`UPDATE courses SET ${sets}, updated_at = datetime('now') WHERE uuid = @uuid`).run({ uuid, ...fields });
    return db.prepare("SELECT * FROM courses WHERE uuid = ?").get(uuid);
  });

  ipcMain.handle("db:courses:delete", (_, uuid) => {
    db.prepare("DELETE FROM courses WHERE uuid = ?").run(uuid);
    return { success: true };
  });

  ipcMain.handle("db:modules:getByCourse", (_, courseUuid) => {
    return db
      .prepare(`
        SELECT m.*
        FROM modules m
        JOIN courses c ON c.id = m.course_id
        WHERE c.uuid = ?
        ORDER BY m.position ASC
      `)
      .all(courseUuid);
  });

  ipcMain.handle("db:modules:create", (_, moduleData) => {
    const course = db.prepare("SELECT id FROM courses WHERE uuid = ?").get(moduleData.courseUuid);
    if (!course) throw new Error("Course not found");

    const result = db
      .prepare("INSERT INTO modules (uuid, course_id, title, position, reviewed) VALUES (@uuid, @courseId, @title, @position, @reviewed)")
      .run({
        uuid: moduleData.uuid,
        courseId: course.id,
        title: moduleData.title,
        position: moduleData.position || 0,
        reviewed: moduleData.reviewed ? 1 : 0,
      });
    return db.prepare("SELECT * FROM modules WHERE id = ?").get(result.lastInsertRowid);
  });

  ipcMain.handle("db:modules:update", (_, { uuid, ...fields }) => {
    const allowed = ["title", "position", "reviewed"];
    const sets = Object.keys(fields)
      .filter((key) => allowed.includes(key))
      .map((key) => `${key} = @${key}`)
      .join(", ");
    if (!sets) return null;
    db.prepare(`UPDATE modules SET ${sets}, updated_at = datetime('now') WHERE uuid = @uuid`).run({ uuid, ...fields });
    return db.prepare("SELECT * FROM modules WHERE uuid = ?").get(uuid);
  });

  ipcMain.handle("db:modules:delete", (_, uuid) => {
    db.prepare("DELETE FROM modules WHERE uuid = ?").run(uuid);
    return { success: true };
  });

  ipcMain.handle("db:notes:get", (_, moduleUuid) => {
    return db
      .prepare(`
        SELECT n.*
        FROM notes n
        JOIN modules m ON m.id = n.module_id
        WHERE m.uuid = ?
      `)
      .get(moduleUuid);
  });

  ipcMain.handle("db:notes:save", (_, { moduleUuid, html }) => {
    const moduleRow = db.prepare("SELECT id FROM modules WHERE uuid = ?").get(moduleUuid);
    if (!moduleRow) throw new Error("Module not found");
    db.prepare(
      "INSERT INTO notes (module_id, html) VALUES (@moduleId, @html) ON CONFLICT(module_id) DO UPDATE SET html = @html, updated_at = datetime('now')"
    ).run({ moduleId: moduleRow.id, html });
    return { success: true };
  });

  ipcMain.handle("db:content:getByModule", (_, moduleUuid) => {
    return db
      .prepare(`
        SELECT ci.*
        FROM content_items ci
        JOIN modules m ON m.id = ci.module_id
        WHERE m.uuid = ?
        ORDER BY ci.position ASC
      `)
      .all(moduleUuid);
  });

  ipcMain.handle("db:content:saveMany", (_, { moduleUuid, items }) => {
    const moduleRow = db.prepare("SELECT id FROM modules WHERE uuid = ?").get(moduleUuid);
    if (!moduleRow) throw new Error("Module not found");

    const transaction = db.transaction((moduleId, rows) => {
      db.prepare("DELETE FROM content_items WHERE module_id = ?").run(moduleId);
      const stmt = db.prepare(`
        INSERT INTO content_items (
          uuid, module_id, section_type, section_title, term, definition,
          body, items_json, is_numbered, confidence, source, enhanced_by_ai, position
        ) VALUES (
          @uuid, @moduleId, @sectionType, @sectionTitle, @term, @definition,
          @body, @itemsJson, @isNumbered, @confidence, @source, @enhancedByAI, @position
        )
      `);
      rows.forEach((item, index) => {
        stmt.run({
          uuid: item.uuid || `ci_${Date.now()}_${index}`,
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
    });

    transaction(moduleRow.id, items || []);
    return { success: true, count: (items || []).length };
  });

  ipcMain.handle("db:flashcards:getByCourse", (_, courseUuid) => {
    return db
      .prepare(`
        SELECT f.*, mod.uuid as module_uuid, m.ease_factor, m.interval_days, m.repetitions, m.next_review, m.last_review, m.last_grade
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
    const today = new Date().toISOString().split("T")[0];
    return db
      .prepare(`
        SELECT f.*, m.ease_factor, m.interval_days, m.repetitions, m.next_review
        FROM flashcards f
        JOIN courses c ON c.id = f.course_id
        LEFT JOIN mastery m ON m.flashcard_id = f.id
        WHERE c.uuid = ?
          AND (m.next_review IS NULL OR m.next_review <= ?)
        ORDER BY COALESCE(m.next_review, '1970-01-01') ASC
      `)
      .all(courseUuid, today);
  });

  ipcMain.handle("db:flashcards:saveMany", (_, { courseUuid, moduleUuid, cards }) => {
    const course = db.prepare("SELECT id FROM courses WHERE uuid = ?").get(courseUuid);
    if (!course) throw new Error("Course not found");
    const moduleRow = moduleUuid ? db.prepare("SELECT id FROM modules WHERE uuid = ?").get(moduleUuid) : null;

    const tx = db.transaction((courseId, moduleId, rows) => {
      const stmt = db.prepare("INSERT OR IGNORE INTO flashcards (uuid, course_id, module_id, front, back, source) VALUES (@uuid, @courseId, @moduleId, @front, @back, @source)");
      rows.forEach((card, idx) => {
        stmt.run({
          uuid: card.uuid || card.id || `fc_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
          courseId,
          moduleId: moduleId || null,
          front: card.front,
          back: card.back,
          source: card.source || "pptx",
        });
      });
    });

    tx(course.id, moduleRow?.id, cards || []);
    return { success: true };
  });

  ipcMain.handle("db:flashcards:replaceForCourse", (_, { courseUuid, cards }) => {
    const course = db.prepare("SELECT id FROM courses WHERE uuid = ?").get(courseUuid);
    if (!course) throw new Error("Course not found");
    const tx = db.transaction((courseId, rows) => {
      db.prepare("DELETE FROM flashcards WHERE course_id = ?").run(courseId);
      const stmt = db.prepare("INSERT INTO flashcards (uuid, course_id, module_id, front, back, source) VALUES (@uuid, @courseId, @moduleId, @front, @back, @source)");
      rows.forEach((card, idx) => {
        const moduleRow = card.moduleUuid ? db.prepare("SELECT id FROM modules WHERE uuid = ?").get(card.moduleUuid) : null;
        stmt.run({
          uuid: card.uuid || card.id || `fc_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
          courseId,
          moduleId: moduleRow?.id || null,
          front: card.front,
          back: card.back,
          source: card.source || "manual",
        });
      });
    });
    tx(course.id, cards || []);
    return { success: true };
  });

  ipcMain.handle("db:mastery:update", (_, { flashcardUuid, grade, easeFactor, intervalDays, repetitions, nextReview, sessionId }) => {
    const card = db.prepare("SELECT id FROM flashcards WHERE uuid = ?").get(flashcardUuid);
    if (!card) throw new Error("Flashcard not found");
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO mastery (flashcard_id, ease_factor, interval_days, repetitions, next_review, last_review, last_grade)
        VALUES (@cardId, @easeFactor, @intervalDays, @repetitions, @nextReview, date('now'), @grade)
        ON CONFLICT(flashcard_id) DO UPDATE
        SET ease_factor = @easeFactor, interval_days = @intervalDays, repetitions = @repetitions,
            next_review = @nextReview, last_review = date('now'), last_grade = @grade, updated_at = datetime('now')
      `).run({
        cardId: card.id,
        easeFactor,
        intervalDays,
        repetitions,
        nextReview,
        grade,
      });
      db.prepare("INSERT INTO card_reviews (flashcard_id, grade, session_id) VALUES (?, ?, ?)").run(card.id, grade, sessionId || null);
    });
    tx();
    return { success: true };
  });

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
    const course = db.prepare("SELECT id FROM courses WHERE uuid = ?").get(courseUuid);
    if (!course) throw new Error("Course not found");
    const moduleRow = moduleUuid ? db.prepare("SELECT id FROM modules WHERE uuid = ?").get(moduleUuid) : null;
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO glossary_terms (uuid, course_id, module_id, term, definition, confidence, source)
      VALUES (@uuid, @courseId, @moduleId, @term, @definition, @confidence, @source)
    `);
    const tx = db.transaction((rows) => {
      rows.forEach((term, idx) => {
        stmt.run({
          uuid: term.uuid || term.id || `gls_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
          courseId: course.id,
          moduleId: moduleRow?.id || null,
          term: term.term,
          definition: term.definition,
          confidence: term.confidence || "high",
          source: term.source || "pptx",
        });
      });
    });
    tx(terms || []);
    return { success: true };
  });

  ipcMain.handle("db:glossary:replaceForCourse", (_, { courseUuid, terms }) => {
    const course = db.prepare("SELECT id FROM courses WHERE uuid = ?").get(courseUuid);
    if (!course) throw new Error("Course not found");
    const tx = db.transaction((rows) => {
      db.prepare("DELETE FROM glossary_terms WHERE course_id = ?").run(course.id);
      const stmt = db.prepare("INSERT INTO glossary_terms (uuid, course_id, module_id, term, definition, confidence, source) VALUES (@uuid, @courseId, @moduleId, @term, @definition, @confidence, @source)");
      rows.forEach((term, idx) => {
        const moduleRow = term.moduleUuid ? db.prepare("SELECT id FROM modules WHERE uuid = ?").get(term.moduleUuid) : null;
        stmt.run({
          uuid: term.uuid || term.id || `gls_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
          courseId: course.id,
          moduleId: moduleRow?.id || null,
          term: term.term,
          definition: term.definition,
          confidence: term.confidence || "high",
          source: term.source || "manual",
        });
      });
    });
    tx(terms || []);
    return { success: true };
  });

  ipcMain.handle("db:glossary:delete", (_, uuid) => {
    db.prepare("DELETE FROM glossary_terms WHERE uuid = ?").run(uuid);
    return { success: true };
  });

  ipcMain.handle("db:settings:get", (_, key) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row?.value ?? null;
  });

  ipcMain.handle("db:settings:set", (_, { key, value }) => {
    db.prepare("INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = datetime('now')").run({ key, value });
    return { success: true };
  });

  ipcMain.handle("db:settings:getAll", () => {
    const rows = db.prepare("SELECT key, value FROM settings").all();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  });

  ipcMain.handle("db:grades:getComponents", (_, courseUuid) => {
    return db
      .prepare(`
        SELECT gc.*
        FROM grade_components gc
        JOIN courses c ON c.id = gc.course_id
        WHERE c.uuid = ?
        ORDER BY gc.position ASC
      `)
      .all(courseUuid);
  });

  ipcMain.handle("db:grades:saveComponents", (_, { courseUuid, components }) => {
    const course = db.prepare("SELECT id FROM courses WHERE uuid = ?").get(courseUuid);
    if (!course) throw new Error("Course not found");
    const transaction = db.transaction((courseId, rows) => {
      db.prepare("DELETE FROM grade_components WHERE course_id = ?").run(courseId);
      const stmt = db.prepare(`
        INSERT INTO grade_components (
          course_id, name, weight, category, position
        ) VALUES (
          @courseId, @name, @weight, @category, @position
        )
      `);
      rows.forEach((component, i) => {
        stmt.run({
          courseId,
          name: component.name,
          weight: component.weight,
          category: component.category || "other",
          position: i,
        });
      });
    });
    transaction(course.id, Array.isArray(components) ? components : []);
    return { success: true };
  });

  ipcMain.handle("db:grades:getEntries", (_, courseUuid) => {
    return db
      .prepare(`
        SELECT ge.*, gc.name as component_name,
          gc.weight, gc.category,
          gc.id as component_id
        FROM grade_entries ge
        JOIN grade_components gc
          ON gc.id = ge.component_id
        JOIN courses c
          ON c.id = gc.course_id
        WHERE c.uuid = ?
        ORDER BY gc.position ASC
      `)
      .all(courseUuid);
  });

  ipcMain.handle("db:grades:upsertEntry", (_, { componentId, score, label }) => {
    db.prepare(`
      INSERT INTO grade_entries
        (component_id, score, label, graded_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(component_id)
      DO UPDATE SET
        score = excluded.score,
        label = excluded.label,
        graded_at = excluded.graded_at
    `).run(componentId, score ?? null, label || null);
    return { success: true };
  });
}

module.exports = { registerDbHandlers };
