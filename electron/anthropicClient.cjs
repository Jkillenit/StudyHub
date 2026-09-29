const { ENHANCE_MODEL } = require("./aiConfig.cjs");

const MAX_SOURCE_CHARS = 120_000;
const REQUEST_MS = 180_000;

const FLASHCARD_SYSTEM = `You help students study from course materials. You MUST respond with ONLY valid JSON — no markdown fences, no commentary — exactly one JSON array.
Each element must be an object with string fields "front" (term or question) and "back" (definition or answer). Use concise academic language suitable for flashcards (short fronts, clear backs).
Aim for 15–35 cards depending on input length; avoid duplicates.`;

const ENHANCEMENT_SYSTEM = `You are a study content editor. You receive automatically extracted content from PowerPoint slides and improve it for studying. You clean definitions, improve clarity, and identify terms that were missed.

Rules:
- Keep all extracted terms - never delete content
- Clean definitions to start with the concept, not "is a" or "refers to"
- Trim definitions to their essential meaning (1-2 sentences max for flashcard use)
- Identify any additional clear definition pairs in the unclassified content
- Return ONLY valid JSON, no markdown, no preamble`;

const PRACTICE_SYSTEM = `You write exam practice questions for a university student from their own course definitions.
Return ONLY a JSON array. Each element: {"question": string, "choices": [4 strings], "answerIndex": 0-3, "explanation": string}.
Questions should be scenario or application style, not just "what is the definition of X". Exactly one correct choice.`;

const WEB_SEARCH_SYSTEM = `You find free, reputable study resources on the public web for a university course topic.
Prefer: university course pages, open textbooks (OpenStax, LibreTexts), Khan Academy, reputable publisher study guides, and well-known educational YouTube channels.
Never return pirated textbooks, paywalled answer banks, leaked exams, or homework-answer sites (e.g. Chegg answers, Course Hero documents).
After searching, respond with ONLY a JSON array of up to 8 objects: {"title": string, "url": string, "summary": one sentence, "kind": "guide"|"video"|"textbook"|"practice"|"notes"}.`;

function modeHint(mode) {
  switch (mode) {
    case "exam_cram":
      return "Prioritize definitions, formulas, lists, and likely exam facts. Skip filler.";
    case "chapter_mastery":
      return "Balanced coverage: key terms, relationships, and one card per major concept.";
    default:
      return "Balanced flashcards for retention.";
  }
}

function truncate(text, max = MAX_SOURCE_CHARS) {
  return text.length > max ? `${text.slice(0, max)}\n\n[…truncated]` : text;
}

function parseJson(text) {
  const trimmed = String(text || "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(payload);
  } catch {
    const start = payload.search(/[[{]/);
    const end = Math.max(payload.lastIndexOf("]"), payload.lastIndexOf("}"));
    if (start >= 0 && end > start) return JSON.parse(payload.slice(start, end + 1));
    throw new Error("Model response was not valid JSON.");
  }
}

async function callMessages(apiKey, { model, system, userContent, maxTokens = 4096, tools }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_MS);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || ENHANCE_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userContent }],
        ...(tools ? { tools } : {}),
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      let msg = raw;
      try {
        msg = JSON.parse(raw)?.error?.message || raw;
      } catch {
        /* keep raw */
      }
      throw new Error(msg || `HTTP ${res.status}`);
    }

    const data = JSON.parse(raw);
    const blocks = Array.isArray(data?.content) ? data.content : [];
    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new Error("Empty response from model.");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function generateFlashcards(apiKey, model, sourceText, mode) {
  const userContent = `${modeHint(mode)}

SOURCE MATERIAL:
---
${truncate(sourceText)}
---

Output format (JSON array only):
[{"front":"...","back":"..."},...]`;
  const parsed = parseJson(await callMessages(apiKey, { model, system: FLASHCARD_SYSTEM, userContent, maxTokens: 8192 }));
  if (!Array.isArray(parsed)) throw new Error("Model did not return a JSON array.");
  return parsed
    .map((item) => ({ front: String(item?.front ?? "").trim(), back: String(item?.back ?? "").trim() }))
    .filter((card) => card.front && card.back);
}

async function enhanceContent(apiKey, { definitions, unclassified }) {
  const userContent = `Improve these automatically extracted study cards.
Return JSON with this exact structure:
{
  "definitions": [{"term": "cleaned term", "definition": "cleaned 1-2 sentence definition", "confidence": "high|medium|low"}],
  "newDefinitions": [{"term": "term found in unclassified", "definition": "its definition", "confidence": "medium"}]
}

Current definitions:
${JSON.stringify(definitions || [], null, 2)}

${unclassified ? `Unclassified content to scan for missed terms:\n${truncate(unclassified, 4000)}` : ""}`.trim();
  const parsed = parseJson(
    await callMessages(apiKey, { model: ENHANCE_MODEL, system: ENHANCEMENT_SYSTEM, userContent, maxTokens: 2000 })
  );
  return {
    definitions: Array.isArray(parsed?.definitions) ? parsed.definitions : [],
    newDefinitions: Array.isArray(parsed?.newDefinitions) ? parsed.newDefinitions : [],
  };
}

async function generatePracticeQuestions(apiKey, { courseName, definitions, count = 8 }) {
  const userContent = `Course: ${courseName || "University course"}
Write ${count} multiple-choice questions using these definitions:
${JSON.stringify((definitions || []).slice(0, 60), null, 2)}`;
  const parsed = parseJson(
    await callMessages(apiKey, { model: ENHANCE_MODEL, system: PRACTICE_SYSTEM, userContent, maxTokens: 4000 })
  );
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (q) =>
        q &&
        typeof q.question === "string" &&
        Array.isArray(q.choices) &&
        q.choices.length === 4 &&
        Number.isInteger(q.answerIndex) &&
        q.answerIndex >= 0 &&
        q.answerIndex < 4
    )
    .map((q) => ({
      question: q.question.trim(),
      choices: q.choices.map((c) => String(c)),
      answerIndex: q.answerIndex,
      explanation: String(q.explanation || ""),
    }));
}

async function searchStudyMaterials(apiKey, { query }) {
  const userContent = `Find study resources for: ${String(query || "").slice(0, 300)}`;
  const parsed = parseJson(
    await callMessages(apiKey, {
      model: ENHANCE_MODEL,
      system: WEB_SEARCH_SYSTEM,
      userContent,
      maxTokens: 3000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
    })
  );
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((r) => r && typeof r.url === "string" && /^https?:\/\//i.test(r.url))
    .slice(0, 8)
    .map((r) => ({
      title: String(r.title || r.url).slice(0, 200),
      url: r.url,
      summary: String(r.summary || "").slice(0, 400),
      kind: ["guide", "video", "textbook", "practice", "notes"].includes(r.kind) ? r.kind : "guide",
    }));
}

module.exports = {
  generateFlashcards,
  enhanceContent,
  generatePracticeQuestions,
  searchStudyMaterials,
};
