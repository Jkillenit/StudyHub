const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MAX_SOURCE_CHARS = 120_000;
const REQUEST_MS = 180_000;

const FLASHCARD_SYSTEM = `You help students study from course materials. You MUST respond with ONLY valid JSON — no markdown fences, no commentary — exactly one JSON array.
Each element must be an object with string fields "front" (term or question) and "back" (definition or answer). Use concise academic language suitable for flashcards (short fronts, clear backs).
Aim for 15–35 cards depending on input length; avoid duplicates.`;

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

function buildUserPayload(sourceText, mode) {
  const truncated =
    sourceText.length > MAX_SOURCE_CHARS
      ? sourceText.slice(0, MAX_SOURCE_CHARS) +
        "\n\n[…truncated for API limits; paste shorter sections for full coverage]"
      : sourceText;

  return `${modeHint(mode)}

SOURCE MATERIAL:
---
${truncated}
---

Output format (JSON array only):
[{"front":"...","back":"..."},...]`;
}

function extractJsonArray(text) {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fence ? fence[1].trim() : trimmed;
  const parsed = JSON.parse(payload);
  if (!Array.isArray(parsed)) throw new Error("Model did not return a JSON array.");
  return parsed.map((item, i) => {
    const front = String(item?.front ?? "").trim();
    const back = String(item?.back ?? "").trim();
    if (!front || !back) {
      throw new Error(`Invalid card at index ${i}: need front and back strings.`);
    }
    return { front, back };
  });
}

async function callMessages(apiKey, model, system, userContent) {
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
        model: model || DEFAULT_MODEL,
        max_tokens: 8192,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      let msg = raw;
      try {
        const j = JSON.parse(raw);
        msg = j?.error?.message || raw;
      } catch {
        /* ignore */
      }
      throw new Error(msg || `HTTP ${res.status}`);
    }

    const data = JSON.parse(raw);
    const blocks = data?.content;
    if (!Array.isArray(blocks)) throw new Error("Unexpected API response shape.");
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
  const userContent = buildUserPayload(sourceText, mode);
  const reply = await callMessages(apiKey, model, FLASHCARD_SYSTEM, userContent);
  return extractJsonArray(reply);
}

module.exports = {
  generateFlashcards,
  DEFAULT_MODEL,
  MAX_SOURCE_CHARS,
};
