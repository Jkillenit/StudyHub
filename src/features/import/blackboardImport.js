import { parseSyllabus } from "../../syllabus/syllabusParser.js";
import { appendPlainText, htmlToPlainText } from "../../lib/notesBody.js";
import { ensureUserCourse } from "../../hub/userCourseModel.js";
import { applyOutputToCourse, newModule, runPptxPipeline } from "./courseBuilders.js";

const MAX_TEXT_CHARS = 20000;
const MAX_BODY_CHARS = 200000;

function findOrCreateModule(course, folderName) {
  const title = String(folderName || "General").trim() || "General";
  const modules = Array.isArray(course.modules) ? course.modules : [];
  const existing = modules.find((m) => String(m.title || "").trim().toLowerCase() === title.toLowerCase());
  if (existing) return { course, moduleId: existing.id };
  const created = newModule(title, modules.length);
  return { course: { ...course, modules: [...modules, created] }, moduleId: created.id };
}

/**
 * Apply one Blackboard file import to a course. Pure with respect to storage:
 * returns the next course plus any syllabus data the caller should persist.
 */
export async function applyBlackboardImport(baseCourse, { fileName, folderName, action, extracted }) {
  let course = ensureUserCourse(baseCourse);

  if (action === "parse-syllabus") {
    const parsed = extracted?.success ? parseSyllabus(extracted.text || "") : null;
    return { course, syllabus: parsed, message: parsed?.grading?.length
      ? `✓ Syllabus — found ${parsed.grading.length} grade components`
      : "✓ Syllabus imported — no grade components detected" };
  }

  const placed = findOrCreateModule(course, folderName);
  course = { ...placed.course, activeModuleId: placed.moduleId };

  if (action === "import-pptx") {
    if (!extracted?.success || !extracted?.slides?.length) {
      return { course: null, message: `✕ ${fileName}: no readable slide text` };
    }
    const output = await runPptxPipeline(extracted.slides);
    course = applyOutputToCourse(course, placed.moduleId, output);
    return { course, message: `✓ ${fileName} → ${output.contentCards.length} terms` };
  }

  if (action === "extract-text" && extracted?.success) {
    const raw = String(extracted.text || "").trim();
    if (!raw) return { course: null, message: `✕ ${fileName}: no text found` };
    const text = raw.length > MAX_TEXT_CHARS ? `${raw.slice(0, MAX_TEXT_CHARS)}\n\n[${raw.length} total chars — truncated]` : raw;
    course = {
      ...course,
      modules: course.modules.map((m) => {
        if (m.id !== placed.moduleId) return m;
        if (htmlToPlainText(m.body).includes(`— ${fileName} —`)) return m;
        const body = appendPlainText(m.body, `— ${fileName} —\n\n${text}`);
        return { ...m, body: body.length > MAX_BODY_CHARS ? m.body : body };
      }),
    };
    return { course, message: `✓ ${fileName} → notes` };
  }

  return { course: null, message: null };
}
