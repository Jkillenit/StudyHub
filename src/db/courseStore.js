const db = window.studyHub?.db;

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function sectionItemToText(item) {
  if (item && typeof item === "object") return String(item.text ?? item.label ?? "");
  return String(item ?? "");
}

/** Content item uuids are derived from their position when the item has no id, so re-saves are idempotent. */
function flattenContent(moduleId, contentData) {
  const items = [];
  (contentData || []).forEach((section, sectionIdx) => {
    const base = sectionIdx * 1000;
    if (section.type === "definitions") {
      (section.items || []).forEach((item, index) => {
        items.push({
          uuid: item.id || `${moduleId}_d${sectionIdx}_${index}`,
          section_type: "definitions",
          section_title: section.title,
          term: item.term,
          definition: item.definition,
          confidence: item.confidence,
          source: item.source || "pptx",
          enhanced_by_ai: item.enhancedByAI ? 1 : 0,
          position: base + index,
        });
      });
    } else if (section.type === "section") {
      items.push({
        uuid: section.id || `${moduleId}_s${sectionIdx}`,
        section_type: "section",
        section_title: section.title,
        items_json: JSON.stringify((section.items || []).map(sectionItemToText)),
        is_numbered: section.isNumbered ? 1 : 0,
        source: section.source || "pptx",
        position: base,
      });
    } else if (section.type === "formulas") {
      (section.items || []).forEach((item, index) => {
        items.push({
          uuid: item.id || `${moduleId}_f${sectionIdx}_${index}`,
          section_type: "formulas",
          section_title: section.title,
          term: item.formula,
          definition: item.context,
          source: item.source || "pptx",
          position: base + index,
        });
      });
    }
  });
  return items;
}

function inflateContent(rows) {
  const sections = [];
  let current = null;
  (rows || []).forEach((row) => {
    if (row.section_type === "section") {
      current = null;
      sections.push({
        id: row.uuid,
        type: "section",
        title: row.section_title,
        items: safeJsonParse(row.items_json, []).map(sectionItemToText),
        isNumbered: !!row.is_numbered,
        source: row.source,
      });
      return;
    }
    const key = `${row.section_type}:${row.section_title || ""}`;
    if (!current || current.key !== key) {
      current = { key, type: row.section_type, title: row.section_title, items: [] };
      sections.push(current);
    }
    if (row.section_type === "definitions") {
      current.items.push({
        id: row.uuid,
        term: row.term,
        definition: row.definition,
        confidence: row.confidence,
        source: row.source,
        enhancedByAI: !!row.enhanced_by_ai,
      });
    } else if (row.section_type === "formulas") {
      current.items.push({ id: row.uuid, formula: row.term, context: row.definition });
    }
  });
  return sections.map(({ key: _key, ...section }) => section);
}

function inflateCourse(full) {
  if (!full?.course) return null;
  const { course, modules: moduleRows, flashcards: cardRows, glossary: glossaryRows } = full;
  const meta = course.meta || safeJsonParse(course.meta_json, {}) || {};
  const modules = moduleRows.map((row, index) => ({
    id: row.uuid,
    label: `Notes ${index + 1}`,
    title: row.title || "General",
    body: row.note_html || "",
    contentData: inflateContent(row.content),
    position: row.position ?? index,
    reviewed: !!row.reviewed,
  }));
  const flashcards = cardRows.map((card) => ({
    id: card.uuid,
    uuid: card.uuid,
    front: card.front,
    back: card.back,
    source: card.source || "manual",
    moduleId: card.module_uuid || null,
    addedAt: card.created_at,
    ...(card.ease_factor != null
      ? {
          easeFactor: card.ease_factor,
          intervalDays: card.interval_days,
          repetitions: card.repetitions,
          next_review: card.next_review,
          lastReview: card.last_review,
          lastGrade: card.last_grade ?? null,
        }
      : {}),
  }));
  const glossary = glossaryRows.map((term) => ({
    id: term.uuid,
    uuid: term.uuid,
    term: term.term,
    definition: term.definition,
    confidence: term.confidence || "high",
    source: term.source || "manual",
    moduleId: term.module_uuid || null,
    addedAt: term.added_at,
  }));
  const moduleIds = new Set(modules.map((m) => m.id));
  return {
    id: course.uuid,
    uuid: course.uuid,
    name: course.name,
    color: course.color || null,
    subtitle: course.subtitle || "",
    bbCourseId: course.bb_course_id || "",
    term: course.term || "",
    courseCode: course.course_code || "",
    instructor: course.instructor || "",
    modules,
    activeModuleId: moduleIds.has(meta.activeModuleId) ? meta.activeModuleId : modules[0]?.id || null,
    flashcards,
    glossary,
    materialPaths: Array.isArray(meta.materialPaths) ? meta.materialPaths : [],
    pptxReviewBlocks: meta.pptxReviewBlocks && typeof meta.pptxReviewBlocks === "object" ? meta.pptxReviewBlocks : {},
    disabledModuleIds: moduleRows.filter((m) => m.disabled).map((m) => m.uuid),
    completedModuleIds: modules.filter((m) => m.reviewed).map((m) => m.id),
  };
}

function toPayload(course) {
  const completed = new Set(course.completedModuleIds || []);
  const disabled = new Set(course.disabledModuleIds || []);
  return {
    uuid: course.uuid || course.id,
    name: course.name,
    color: course.color || null,
    subtitle: course.subtitle || null,
    bbCourseId: course.bbCourseId || null,
    term: course.term || null,
    courseCode: course.courseCode || null,
    instructor: course.instructor || null,
    meta: {
      activeModuleId: course.activeModuleId || null,
      materialPaths: course.materialPaths || [],
      pptxReviewBlocks: course.pptxReviewBlocks || {},
    },
    modules: (course.modules || []).map((mod) => ({
      uuid: mod.id,
      title: mod.title || "General",
      reviewed: completed.has(mod.id),
      disabled: disabled.has(mod.id),
      html: mod.body || "",
      content: flattenContent(mod.id, mod.contentData || []),
    })),
    flashcards: (course.flashcards || []).map((card) => ({
      uuid: card.uuid || card.id,
      front: card.front,
      back: card.back,
      source: card.source || "manual",
      moduleUuid: card.moduleId || null,
    })),
    glossary: (course.glossary || []).map((term) => ({
      uuid: term.uuid || term.id,
      term: term.term,
      definition: term.definition,
      confidence: term.confidence || "high",
      source: term.source || "manual",
      moduleUuid: term.moduleId || null,
    })),
  };
}

/** Snapshot of a payload: everything except note html (serialized), plus html per module uuid. */
function snapshotOf(payload) {
  const html = new Map();
  const modules = payload.modules.map(({ html: body, ...mod }) => {
    html.set(mod.uuid, body);
    return mod;
  });
  return { shape: JSON.stringify({ ...payload, modules }), html };
}

/** Module uuids whose html differs from `prev`, or null when anything besides note html changed. */
function changedNotes(prev, next) {
  if (!prev || prev.shape !== next.shape) return null;
  return [...next.html].filter(([uuid, body]) => prev.html.get(uuid) !== body).map(([uuid]) => uuid);
}

/**
 * Per-course save queue: at most one write in flight, only the latest pending state is written next,
 * and identical payloads are skipped. Writes are ordered, so a stale save can never overwrite a newer one.
 * When only note html changed, just those notes are written instead of the whole course.
 */
const saveQueues = new Map();
const deletedCourses = new Set();

function queueFor(key) {
  let queue = saveQueues.get(key);
  if (!queue) {
    queue = { lastWritten: null, pending: null, running: null };
    saveQueues.set(key, queue);
  }
  return queue;
}

async function writeSnapshot(payload, snapshot, prev) {
  const notes = changedNotes(prev, snapshot);
  if (!notes) return db.courses.saveFull(payload);
  for (const moduleUuid of notes) await db.notes.save({ moduleUuid, html: snapshot.html.get(moduleUuid) });
  return { success: true };
}

/** Records a course just read from the DB as written, so the next note edit can take the fast path. */
function seedWritten(course) {
  if (!course) return course;
  const queue = queueFor(course.uuid);
  if (!queue.running) queue.lastWritten = snapshotOf(toPayload(course));
  return course;
}

function enqueueSave(payload) {
  const key = payload.uuid;
  if (deletedCourses.has(key)) return Promise.resolve({ success: false, deleted: true });
  const snapshot = snapshotOf(payload);
  const queue = queueFor(key);
  if (queue.running === null && changedNotes(queue.lastWritten, snapshot)?.length === 0) return Promise.resolve({ success: true });
  queue.pending = { payload, snapshot };
  if (!queue.running) {
    queue.running = (async () => {
      let result = { success: true };
      while (queue.pending) {
        const next = queue.pending;
        queue.pending = null;
        if (deletedCourses.has(key)) break;
        if (changedNotes(queue.lastWritten, next.snapshot)?.length === 0) continue;
        try {
          result = await writeSnapshot(next.payload, next.snapshot, queue.lastWritten);
          queue.lastWritten = next.snapshot;
        } catch (err) {
          result = { success: false, error: err?.message || String(err) };
        }
      }
      queue.running = null;
      return result;
    })();
  }
  return queue.running;
}

export const courseStore = {
  async loadAllCourses() {
    const rows = await db.courses.getAll();
    const full = await Promise.all(rows.map((row) => db.courses.getFull(row.uuid)));
    return full.map(inflateCourse).filter(Boolean).map(seedWritten);
  },

  async getCourseWithModules(courseUuid) {
    return seedWritten(inflateCourse(await db.courses.getFull(courseUuid)));
  },

  syncCourse(course) {
    if (!course || !(course.uuid || course.id)) return Promise.resolve({ success: false });
    return enqueueSave(toPayload(course));
  },

  async deleteCourse(courseUuid) {
    deletedCourses.add(courseUuid);
    const queue = saveQueues.get(courseUuid);
    if (queue?.running) await queue.running;
    saveQueues.delete(courseUuid);
    try {
      return await db.courses.delete(courseUuid);
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /** Input for the Today priority engine: { now, synced, courses: [...] }, optionally one course only. */
  async loadTodayData(courseUuid = null) {
    return (
      (await db?.today?.get?.(courseUuid ? { courseUuid } : undefined)) || {
        now: new Date().toISOString(),
        synced: false,
        syncedAt: null,
        courses: [],
      }
    );
  },

  async getGradingScale(courseUuid) {
    try {
      return (await db?.grades?.getGradingScale?.(courseUuid)) || null;
    } catch {
      return null;
    }
  },

  async setAssignmentCompleted(uuid, completed = true) {
    const res = await db?.assignments?.setCompleted?.({ uuid, completed });
    window.dispatchEvent(new CustomEvent("studyhub-mirror-changed", { detail: { assignmentUuid: uuid } }));
    return res;
  },

  async getTargetGrade(courseUuid) {
    const row = await db?.courses?.get?.(courseUuid);
    const value = Number(row?.target_grade);
    return Number.isFinite(value) ? value : 80;
  },

  async setTargetGrade(courseUuid, targetGrade) {
    const res = await db?.today?.setTargetGrade?.({ courseUuid, targetGrade });
    if (res?.success) window.dispatchEvent(new CustomEvent("studyhub-target-changed", { detail: { courseUuid, targetGrade } }));
    return res || { success: false };
  },

  /**
   * Effective module scope per exam uuid: { moduleIds, source: 'manual'|'syllabus'|'course', suggestion }.
   * Empty moduleIds means the exam covers the whole course.
   */
  async getExamScopes(courseUuid) {
    const rows = courseUuid ? await db?.exams?.getScopes?.(courseUuid) : null;
    return Object.fromEntries((Array.isArray(rows) ? rows : []).map(({ examUuid, ...scope }) => [examUuid, scope]));
  },

  /** The student's pick for an exam; null goes back to syllabus coverage (or the whole course). */
  async setExamScope(examUuid, moduleIds) {
    const res = await db?.exams?.setScope?.({ examUuid, moduleIds: Array.isArray(moduleIds) ? moduleIds : null });
    if (res?.success) window.dispatchEvent(new CustomEvent("studyhub-exam-scope-changed", { detail: { examUuid } }));
    return res || { success: false };
  },

  async setSyllabusCoverage(courseUuid, text) {
    const res = await db?.exams?.setSyllabusCoverage?.({ courseUuid, text });
    if (res?.count) window.dispatchEvent(new CustomEvent("studyhub-exam-scope-changed", { detail: { courseUuid } }));
    return res || { success: false, count: 0 };
  },

  /** Logs a finished study session and tells listeners (Nova's memory) once it's written. */
  async logStudySession(session) {
    try {
      const res = await db?.sessions?.log?.(session);
      if (res?.success && !res.skipped) window.dispatchEvent(new CustomEvent("studyhub-session-logged"));
      return res || { success: false };
    } catch {
      return { success: false };
    }
  },

  /* ---------- Nova's memory (local only, never sent to Commons) ---------- */

  async companionMemory() {
    try {
      return (await db?.companion?.memory?.()) || [];
    } catch {
      return [];
    }
  },

  /** entries: [{ key, value, source }]. Muted facts are left alone unless source is 'told'. */
  async companionRemember(entries, { notify = false } = {}) {
    const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
    if (!list.length) return { success: true };
    const res = await db?.companion?.rememberMany?.(list);
    if (notify) window.dispatchEvent(new CustomEvent("studyhub-companion-memory-changed"));
    return res || { success: false };
  },

  async companionMute(key, muted = true) {
    const res = await db?.companion?.mute?.({ key, muted });
    window.dispatchEvent(new CustomEvent("studyhub-companion-memory-changed"));
    return res || { success: false };
  },

  async companionForget() {
    const res = await db?.companion?.forget?.();
    window.dispatchEvent(new CustomEvent("studyhub-companion-memory-changed"));
    return res || { success: false };
  },

  async companionSaidSince(since) {
    try {
      return (await db?.companion?.saidSince?.(since)) || [];
    } catch {
      return [];
    }
  },

  async companionMarkSaid(lineId) {
    return db?.companion?.markSaid?.(lineId);
  },

  async companionStudyFacts(since = null) {
    try {
      return (await db?.companion?.studyFacts?.({ since })) || null;
    } catch {
      return null;
    }
  },

  async saveGradeComponents(courseUuid, components) {
    return db.grades.saveComponents({
      courseUuid,
      components: (components || []).map((c) => ({
        id: c.id,
        uuid: c.uuid,
        name: c.name,
        weight: c.weight,
        category: c.category || "other",
      })),
    });
  },
};
