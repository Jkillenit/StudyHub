import { buildOutput } from "../../pptx/pptxOutputBuilder.js";
import { classifySlides, detectChapters } from "../../pptx/pptxClassifier.js";
import { hasApiKey } from "../../ai/apiKeyUtils.js";
import { enhanceWithClaude } from "../../ai/pptxEnhancer.js";
import { mergeEnhancedOutput } from "../../ai/mergeEnhancedOutput.js";
import { appendPlainText } from "../../lib/notesBody.js";
import { ensureUserCourse, uid } from "../../hub/userCourseModel.js";

const norm = (value) => String(value || "").toLowerCase().trim();

export function newModule(title = "General", index = 0) {
  return { id: uid("m"), label: `Notes ${index + 1}`, title, body: "", contentData: [] };
}

/** Drop untouched placeholder modules ("General", "Section 3") once real content has arrived. */
export function cleanupEmptyDefaultModules(modules, protectedModuleId = null) {
  const defaultTitlePattern = /^(section\s+\d+|general)$/i;
  const list = Array.isArray(modules) ? modules : [];
  const kept = list.filter((m) => {
    if (protectedModuleId && m.id === protectedModuleId) return true;
    const hasContent = Array.isArray(m?.contentData) && m.contentData.length > 0;
    const hasBody = String(m?.body || "").trim().length > 0;
    return !(defaultTitlePattern.test(String(m?.title || "").trim()) && !hasContent && !hasBody);
  });
  return kept.length ? kept : list.slice(0, 1);
}

export function mergeFlashcards(existingCards, newCards, moduleId) {
  const current = Array.isArray(existingCards) ? existingCards : [];
  const existingFronts = new Set(current.map((c) => norm(c.front)));
  const addedAt = new Date().toISOString();
  const dedupedNew = [];
  for (const card of newCards || []) {
    const key = norm(card.front);
    if (!key || existingFronts.has(key)) continue;
    existingFronts.add(key);
    dedupedNew.push({ ...card, source: card.source || "pptx", moduleId, addedAt });
  }
  return [...current, ...dedupedNew];
}

export function addTermsToGlossary(course, moduleId, cards) {
  const existingTerms = new Set((course?.glossary || []).map((g) => norm(g.term)));
  const addedAt = new Date().toISOString();
  const newTerms = [];
  for (const card of cards || []) {
    const key = norm(card.term);
    if (!key || existingTerms.has(key)) continue;
    existingTerms.add(key);
    newTerms.push({
      id: uid("gls"),
      term: card.term,
      definition: card.definition,
      confidence: card.confidence || "high",
      source: card.source || "pptx",
      moduleId,
      addedAt,
    });
  }
  return { ...course, glossary: [...(course?.glossary || []), ...newTerms] };
}

export function buildChapterContent(output) {
  const sections = [];
  if ((output?.contentCards || []).length > 0) {
    sections.push({
      type: "definitions",
      title: "Definitions",
      items: output.contentCards.map((card) => ({
        id: card.id,
        term: card.term,
        definition: card.definition,
        confidence: card.confidence || "high",
        source: "pptx",
        enhancedByAI: !!card.enhancedByAI,
      })),
    });
  }
  for (const section of output?.contentSections || []) {
    sections.push({
      id: uid("sec"),
      type: "section",
      title: section.title,
      items: (section.items || []).map((item) => (typeof item === "string" ? item : String(item?.text || ""))),
      source: "pptx",
    });
  }
  if ((output?.contentFormulas || []).length > 0) {
    sections.push({
      type: "formulas",
      title: "Formulas",
      items: output.contentFormulas.map((f) => ({ id: uid("fx"), formula: f.formula, context: f.context, source: "pptx" })),
    });
  }
  return sections;
}

/** Local classifier first, then optional Haiku enhancement; never throws for AI failures. */
export async function runPptxPipeline(slides, { onProgress, useAi } = {}) {
  onProgress?.("CLASSIFYING CONTENT...");
  const classified = classifySlides(slides);
  onProgress?.("BUILDING OUTPUT...");
  const output = buildOutput(classified);
  const aiAllowed = useAi ?? (output.contentCards.length > 0 && (await hasApiKey()));
  if (!aiAllowed || output.contentCards.length === 0) return output;
  onProgress?.("ENHANCING WITH AI...");
  const aiResult = await enhanceWithClaude(output);
  return mergeEnhancedOutput(output, aiResult);
}

/** Merge one pipeline output into a module and the course-level flashcards/glossary. */
export function applyOutputToCourse(course, moduleId, output, { appendReview = true } = {}) {
  let next = {
    ...course,
    modules: (course.modules || []).map((m) => {
      if (m.id !== moduleId) return m;
      const contentData = [...(Array.isArray(m.contentData) ? m.contentData : []), ...buildChapterContent(output)];
      const body = appendReview && output?.notesReviewBlock?.text ? appendPlainText(m.body, output.notesReviewBlock.text) : m.body;
      return { ...m, contentData, body };
    }),
  };
  const taggedCards = (output?.flashcards || []).map((card) => ({ ...card, source: card.source || "pptx" }));
  next = { ...next, flashcards: mergeFlashcards(next.flashcards, taggedCards, moduleId) };
  next = addTermsToGlossary(next, moduleId, output?.contentCards || []);
  return next;
}

/** Build a brand-new course from a PPTX deck, one module per detected chapter. */
export async function buildCourseFromSlides({ title, slides, materialPaths = [], onProgress }) {
  const chapterGroups = detectChapters(slides, title);
  const useAi = await hasApiKey();
  const modules = chapterGroups.map((group, idx) => newModule(group.title || `Chapter ${idx + 1}`, idx));
  let course = ensureUserCourse({
    id: uid("uc"),
    name: title,
    subtitle: "",
    modules: modules.length ? modules : [newModule("General", 0)],
    materialPaths,
    flashcards: [],
    glossary: [],
  });
  for (let idx = 0; idx < chapterGroups.length; idx += 1) {
    const group = chapterGroups[idx];
    const chapter = `CH·${String(idx + 1).padStart(2, "0")} — ${(group.title || `Chapter ${idx + 1}`).toUpperCase()}`;
    const output = await runPptxPipeline(group.slides, {
      useAi,
      onProgress: (label) => onProgress?.({ label, chapter }),
    });
    course = applyOutputToCourse(course, modules[idx].id, output);
  }
  return { course, chapterCount: modules.length || 1 };
}
