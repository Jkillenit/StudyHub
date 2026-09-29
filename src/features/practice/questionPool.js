import { getDueCards, getWeakCards } from "../../study/sm2.js";

export const normTerm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const clean = (s) =>
  String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Term/definition pairs for a course: flashcards first (they carry SM-2 state), then
 * module definitions and glossary terms not already covered. Low-confidence terms are skipped.
 */
export function buildQuestionPool(course) {
  const pool = new Map();
  const cards = Array.isArray(course?.flashcards) ? course.flashcards : [];
  const weak = new Set(getWeakCards(cards).map((c) => c.id || c.uuid));
  const due = new Set(getDueCards(cards).map((c) => c.id || c.uuid));

  const add = (term, definition, extra) => {
    const t = clean(term);
    const d = clean(definition);
    const key = normTerm(t);
    if (!key || d.length < 4 || pool.has(key)) return;
    pool.set(key, { key, term: t, definition: d, ...extra });
  };

  for (const c of cards) {
    const id = c.id || c.uuid;
    add(c.front, c.back, {
      moduleId: c.moduleId || null,
      cardId: id,
      weak: weak.has(id),
      due: due.has(id) && !!c.lastReview,
      isQuestion: /\?\s*$/.test(String(c.front || "")),
    });
  }
  for (const m of course?.modules || []) {
    for (const section of m.contentData || []) {
      if (section.type !== "definitions") continue;
      for (const item of section.items || []) {
        if (item?.confidence === "low") continue;
        add(item.term, item.definition, { moduleId: m.id });
      }
    }
  }
  for (const g of course?.glossary || []) {
    if (g?.confidence === "low") continue;
    add(g.term, g.definition, { moduleId: g.moduleId || null });
  }
  return [...pool.values()];
}

export function poolForModules(pool, moduleIds) {
  if (!moduleIds || !moduleIds.length) return pool;
  const set = new Set(moduleIds);
  return pool.filter((p) => set.has(p.moduleId));
}
