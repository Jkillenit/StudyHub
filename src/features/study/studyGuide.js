import { getWeakCards } from "../../study/sm2.js";
import { htmlToPlainText } from "../../lib/notesBody.js";
import { normTerm } from "../practice/questionPool.js";

const FOCUS_LIMIT = 25;

const sectionText = (item) => (item && typeof item === "object" ? String(item.text ?? item.label ?? "") : String(item ?? ""));

/** One block per module in scope: key terms, outline sections, formulas, and the student's notes. */
export function buildStudyGuide(course, moduleIds = []) {
  const scope = moduleIds.length ? new Set(moduleIds) : null;
  const cards = Array.isArray(course?.flashcards) ? course.flashcards : [];
  const weakTerms = new Set(getWeakCards(cards).map((c) => normTerm(c.front)));

  const modules = (course?.modules || [])
    .filter((m) => !scope || scope.has(m.id))
    .filter((m) => !(course?.disabledModuleIds || []).includes(m.id))
    .map((m) => {
      const seen = new Set();
      const terms = [];
      const sections = [];
      const formulas = [];
      const addTerm = (term, definition) => {
        const key = normTerm(term);
        if (!key || !String(definition || "").trim() || seen.has(key)) return;
        seen.add(key);
        terms.push({ term: String(term).trim(), definition: String(definition).trim(), weak: weakTerms.has(key) });
      };
      for (const s of m.contentData || []) {
        if (s.type === "definitions") {
          for (const d of s.items || []) if (d?.confidence !== "low") addTerm(d.term, d.definition);
        } else if (s.type === "section") {
          const items = (s.items || []).map(sectionText).filter((t) => t.trim().length > 5);
          if (items.length) sections.push({ title: s.title || "Section", items });
        } else if (s.type === "formulas") {
          for (const f of s.items || []) if (f?.formula) formulas.push({ formula: f.formula, context: f.context || "" });
        }
      }
      for (const g of course?.glossary || []) {
        if (g.moduleId === m.id && g.confidence !== "low") addTerm(g.term, g.definition);
      }
      terms.sort((a, b) => Number(b.weak) - Number(a.weak) || a.term.localeCompare(b.term));
      return {
        id: m.id,
        title: m.title || m.label || "Module",
        terms,
        sections,
        formulas,
        notes: htmlToPlainText(m.body || "").trim(),
      };
    });

  const inScope = scope ? cards.filter((c) => scope.has(c.moduleId)) : cards;
  const focus = getWeakCards(inScope)
    .slice(0, FOCUS_LIMIT)
    .map((c) => ({ term: String(c.front || "").trim(), definition: String(c.back || "").trim() }));

  return { modules, focus };
}

/** Markdown export so the guide can be pasted into notes, a doc, or shared. */
export function guideToMarkdown(guide, { title, examLabel, includeNotes = true } = {}) {
  const out = [`# ${title || "Study Guide"}`];
  if (examLabel) out.push(`_${examLabel}_`);
  if (guide.focus.length) {
    out.push("", "## Focus list (weak cards)");
    for (const f of guide.focus) out.push(`- **${f.term}** — ${f.definition}`);
  }
  for (const m of guide.modules) {
    out.push("", `## ${m.title}`);
    if (m.terms.length) {
      out.push("", "### Key terms");
      for (const t of m.terms) out.push(`- **${t.term}** — ${t.definition}`);
    }
    for (const s of m.sections) {
      out.push("", `### ${s.title}`);
      for (const i of s.items) out.push(`- ${i}`);
    }
    if (m.formulas.length) {
      out.push("", "### Formulas");
      for (const f of m.formulas) out.push(`- \`${f.formula}\`${f.context ? ` — ${f.context}` : ""}`);
    }
    if (includeNotes && m.notes) out.push("", "### My notes", "", m.notes);
  }
  return out.join("\n") + "\n";
}
