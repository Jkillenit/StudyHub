import { normTerm } from "./questionPool.js";

export const QUESTION_TYPES = [
  { id: "mc-term", label: "Pick the term" },
  { id: "mc-def", label: "Pick the definition" },
  { id: "typed", label: "Type the term" },
];

const MIN_MC_POOL = 4;

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Hide the term (and its acronym) inside its own definition so the prompt doesn't give it away. */
export function maskTerm(definition, term) {
  let out = definition;
  for (const v of answerVariants(term)) {
    if (v.length < 3) continue;
    out = out.replace(new RegExp(`\\b${escapeRe(v)}\\b`, "gi"), "_____");
  }
  return out;
}

/** "Economic Order Quantity (EOQ)" accepts the full form, the long form, or the acronym. */
export function answerVariants(term) {
  const raw = String(term || "").trim();
  const out = new Set([raw]);
  const paren = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    out.add(paren[1].trim());
    out.add(paren[2].trim());
  }
  for (const part of raw.split(/\s*[/;]\s*/)) if (part) out.add(part);
  return [...out].filter(Boolean);
}

function editDistance(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const stripArticles = (s) => normTerm(s).replace(/^(the|a|an) /, "");

/** Returns "exact", "close" (small typo, still counted correct), or null. */
export function gradeTyped(input, term) {
  const given = stripArticles(input);
  if (!given) return null;
  let best = null;
  for (const v of answerVariants(term)) {
    const want = stripArticles(v);
    if (!want) continue;
    if (given === want) return "exact";
    const allowed = want.length <= 4 ? 0 : Math.max(1, Math.floor(want.length * 0.15));
    if (editDistance(given, want) <= allowed) best = "close";
  }
  return best;
}

function pickDistractors(item, pool, field) {
  const target = item[field].length;
  const scored = pool
    .filter((p) => p.key !== item.key && normTerm(p[field]) !== normTerm(item[field]))
    .map((p) => {
      const len = p[field].length;
      const lenScore = 1 - Math.abs(len - target) / Math.max(len, target, 1);
      const sameModule = item.moduleId && p.moduleId === item.moduleId ? 0.6 : 0;
      return { p, score: lenScore + sameModule + Math.random() * 0.5 };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.p);
}

function canType(item) {
  if (item.isQuestion) return false;
  const words = item.term.split(/\s+/).length;
  return item.term.length <= 48 && words <= 6;
}

function makeQuestion(item, type, pool) {
  if (type === "typed") {
    return {
      id: `${item.key}|typed`,
      type,
      item,
      prompt: maskTerm(item.definition, item.term),
      answer: item.term,
    };
  }
  const field = type === "mc-term" ? "term" : "definition";
  const options = shuffle([item, ...pickDistractors(item, pool, field)]);
  return {
    id: `${item.key}|${type}`,
    type,
    item,
    prompt: type === "mc-term" ? maskTerm(item.definition, item.term) : item.term,
    options: options.map((o) => o[field]),
    answerIndex: options.indexOf(item),
    answer: item[field],
  };
}

/** Order the pool so weak and due items come first, with some randomness inside each tier. */
function prioritize(pool, focusWeak) {
  if (!focusWeak) return shuffle(pool);
  const weight = (p) => (p.weak ? 3 : p.due ? 2 : 1) + Math.random() * 1.5;
  return pool
    .map((p) => ({ p, w: weight(p) }))
    .sort((a, b) => b.w - a.w)
    .map((x) => x.p);
}

/**
 * Build a test from a scoped pool. Distractors come from the whole course pool so small
 * module scopes still get four options.
 */
export function buildTest({ scoped, coursePool, count = 10, types = ["mc-term", "mc-def", "typed"], focusWeak = true }) {
  const mcAllowed = coursePool.length >= MIN_MC_POOL;
  const usable = types.filter((t) => (t === "typed" ? true : mcAllowed));
  if (!usable.length || !scoped.length) return [];
  const chosen = prioritize(scoped, focusWeak).slice(0, count);
  return shuffle(
    chosen.map((item, i) => {
      let type = usable[i % usable.length];
      if (type === "typed" && !canType(item)) type = usable.find((t) => t !== "typed") || null;
      return type ? makeQuestion(item, type, coursePool) : null;
    })
  ).filter(Boolean);
}

/** Rebuild the same items (fresh options) for a missed-only retake. AI questions are reused as-is. */
export function retakeQuestions(questions, coursePool) {
  return shuffle(questions.map((q) => (q.type === "ai" ? q : makeQuestion(q.item, q.type, coursePool))));
}

/** Normalize one AI practice question (already validated in the main process) into the test shape. */
export function fromAiQuestion(raw, i) {
  const answer = raw.choices[raw.answerIndex];
  return {
    id: `ai|${i}|${raw.question.slice(0, 40)}`,
    type: "ai",
    item: { key: `ai-${i}`, term: raw.question, definition: raw.explanation || answer, moduleId: null },
    prompt: raw.question,
    options: raw.choices,
    answerIndex: raw.answerIndex,
    answer,
    explanation: raw.explanation || "",
  };
}

/** Local test plus a few Haiku application questions; any AI failure leaves the local test intact. */
export async function buildTestWithAi(config, courseName) {
  const local = buildTest(config);
  const aiCount = Math.min(5, Math.max(2, Math.ceil(config.count / 4)));
  try {
    const res = await window.studyHub?.ai?.practice?.({
      courseName,
      definitions: config.scoped.slice(0, 60).map((p) => ({ term: p.term, definition: p.definition })),
      count: aiCount,
    });
    const extra = res?.ok && Array.isArray(res.questions) ? res.questions.map(fromAiQuestion) : [];
    if (!extra.length) return { questions: local, aiAdded: 0 };
    const kept = local.slice(0, Math.max(local.length - extra.length, Math.ceil(local.length / 2)));
    return { questions: shuffle([...kept, ...extra]), aiAdded: extra.length };
  } catch {
    return { questions: local, aiAdded: 0 };
  }
}
