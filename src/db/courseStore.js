const db = window.studyHub?.db;

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function flattenContent(contentData) {
  const items = [];
  (contentData || []).forEach((section, sectionIdx) => {
    if (section.type === "definitions") {
      (section.items || []).forEach((item, index) => {
        items.push({
          uuid: item.id || `ci_${Date.now()}_${sectionIdx}_${index}`,
          section_type: "definitions",
          section_title: section.title,
          term: item.term,
          definition: item.definition,
          confidence: item.confidence,
          source: item.source || "pptx",
          enhanced_by_ai: item.enhancedByAI ? 1 : 0,
          position: sectionIdx * 100 + index,
        });
      });
    } else if (section.type === "section") {
      items.push({
        uuid: section.id || `ci_${Date.now()}_${sectionIdx}`,
        section_type: "section",
        section_title: section.title,
        items_json: JSON.stringify(section.items || []),
        is_numbered: section.isNumbered ? 1 : 0,
        position: sectionIdx * 100,
      });
    } else if (section.type === "formulas") {
      (section.items || []).forEach((item, index) => {
        items.push({
          uuid: item.id || `ci_${Date.now()}_${sectionIdx}_${index}`,
          section_type: "formulas",
          section_title: section.title,
          term: item.formula,
          definition: item.context,
          position: sectionIdx * 100 + index,
        });
      });
    }
  });
  return items;
}

function inflateContent(rows) {
  const sectionsMap = new Map();
  (rows || []).forEach((row) => {
    const key = `${row.section_type}:${row.section_title || ""}`;
    if (!sectionsMap.has(key)) {
      sectionsMap.set(key, {
        type: row.section_type,
        title: row.section_title,
        items: [],
        isNumbered: !!row.is_numbered,
      });
    }
    const section = sectionsMap.get(key);
    if (row.section_type === "definitions") {
      section.items.push({
        id: row.uuid,
        term: row.term,
        definition: row.definition,
        confidence: row.confidence,
        source: row.source,
        enhancedByAI: !!row.enhanced_by_ai,
      });
    } else if (row.section_type === "section") {
      section.items = row.items_json ? safeJsonParse(row.items_json, []) : [];
    } else if (row.section_type === "formulas") {
      section.items.push({ formula: row.term, context: row.definition });
    }
  });
  return Array.from(sectionsMap.values());
}

export const courseStore = {
  async getAllCourses() {
    const rows = await db.courses.getAll();
    return rows.map((course) => ({
      id: course.uuid,
      uuid: course.uuid,
      name: course.name,
      color: course.color || null,
      modules: [],
      flashcards: [],
      glossary: [],
      materialPaths: [],
      disabledModuleIds: [],
      completedModuleIds: [],
    }));
  },

  async getCourseWithModules(courseUuid) {
    const course = await db.courses.get(courseUuid);
    if (!course) return null;
    const moduleRows = await db.modules.getByCourse(courseUuid);
    const modules = await Promise.all(
      moduleRows.map(async (moduleRow, index) => {
        const note = await db.notes.get(moduleRow.uuid);
        const contentRows = await db.content.getByModule(moduleRow.uuid);
        return {
          id: moduleRow.uuid,
          label: `Notes ${index + 1}`,
          title: moduleRow.title || "General",
          body: note?.html || "",
          contentData: inflateContent(contentRows),
          position: moduleRow.position || index,
          reviewed: !!moduleRow.reviewed,
        };
      })
    );
    const flashcards = (await db.flashcards.getByCourse(courseUuid)).map((card) => ({
      id: card.uuid,
      uuid: card.uuid,
      front: card.front,
      back: card.back,
      source: card.source || "manual",
      moduleId: card.module_uuid || null,
      addedAt: card.created_at,
    }));
    const glossary = (await db.glossary.getByCourse(courseUuid)).map((term) => ({
      id: term.uuid,
      uuid: term.uuid,
      term: term.term,
      definition: term.definition,
      confidence: term.confidence || "high",
      source: term.source || "manual",
      moduleId: term.module_uuid || null,
      addedAt: term.added_at,
    }));
    return {
      id: course.uuid,
      uuid: course.uuid,
      name: course.name,
      color: course.color || null,
      modules,
      activeModuleId: modules[0]?.id || null,
      flashcards,
      glossary,
      materialPaths: [],
      disabledModuleIds: [],
      completedModuleIds: modules.filter((m) => m.reviewed).map((m) => m.id),
    };
  },

  async createCourse(data) {
    return db.courses.create({
      uuid: data.uuid || `course_${Date.now()}`,
      name: data.name,
      type: "user",
      color: data.color || null,
    });
  },

  async syncCourse(course) {
    const existing = await db.courses.get(course.id);
    if (!existing) {
      await this.createCourse({ uuid: course.id, name: course.name, color: course.color || null });
    } else {
      await db.courses.update({ uuid: course.id, name: course.name, color: course.color || null });
    }

    const existingModules = await db.modules.getByCourse(course.id);
    const existingIds = new Set(existingModules.map((m) => m.uuid));
    const nextIds = new Set((course.modules || []).map((m) => m.id));

    await Promise.all(existingModules.filter((m) => !nextIds.has(m.uuid)).map((m) => db.modules.delete(m.uuid)));

    for (let i = 0; i < (course.modules || []).length; i += 1) {
      const mod = course.modules[i];
      if (!existingIds.has(mod.id)) {
        await db.modules.create({
          uuid: mod.id,
          courseUuid: course.id,
          title: mod.title || "General",
          position: i,
          reviewed: (course.completedModuleIds || []).includes(mod.id) ? 1 : 0,
        });
      } else {
        await db.modules.update({
          uuid: mod.id,
          title: mod.title || "General",
          position: i,
          reviewed: (course.completedModuleIds || []).includes(mod.id) ? 1 : 0,
        });
      }
      await db.notes.save({ moduleUuid: mod.id, html: mod.body || "" });
      await db.content.saveMany({ moduleUuid: mod.id, items: flattenContent(mod.contentData || []) });
    }

    await db.flashcards.replaceForCourse({
      courseUuid: course.id,
      cards: (course.flashcards || []).map((card) => ({
        uuid: card.id || card.uuid,
        front: card.front,
        back: card.back,
        source: card.source || "manual",
        moduleUuid: card.moduleId || null,
      })),
    });

    await db.glossary.replaceForCourse({
      courseUuid: course.id,
      terms: (course.glossary || []).map((term) => ({
        uuid: term.id || term.uuid,
        term: term.term,
        definition: term.definition,
        confidence: term.confidence || "high",
        source: term.source || "manual",
        moduleUuid: term.moduleId || null,
      })),
    });
  },

  async deleteCourse(courseUuid) {
    try {
      await window.studyHub?.db?.courses?.delete(courseUuid);
      return { success: true };
    } catch (err) {
      console.error("[courseStore] deleteCourse error:", err);
      return { success: false, error: err.message };
    }
  },
};
