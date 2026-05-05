import { getApiKey } from "./apiKeyUtils.js";

const ENHANCEMENT_SYSTEM_PROMPT = `You are a study content editor. You receive automatically extracted content from PowerPoint slides and improve it for studying. You clean definitions, improve clarity, and identify terms that were missed.

Rules:
- Keep all extracted terms - never delete content
- Clean definitions to start with the concept, not "is a" or "refers to"
- Trim definitions to their essential meaning (1-2 sentences max for flashcard use)
- Identify any additional clear definition pairs in the unclassified content
- Return ONLY valid JSON, no markdown, no preamble`;

export async function enhanceWithClaude(localOutput) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const payload = {
    definitions: (localOutput?.contentCards || []).map((c) => ({
      term: c.term,
      definition: c.definition,
      confidence: c.confidence,
    })),
    unclassified: localOutput?.notesReviewBlock?.html
      ? localOutput.notesReviewBlock.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000)
      : null,
  };

  if (payload.definitions.length === 0 && !payload.unclassified) return null;

  const userPrompt = `
Improve these automatically extracted study cards.
Return JSON with this exact structure:
{
  "definitions": [
    {
      "term": "cleaned term",
      "definition": "cleaned 1-2 sentence definition",
      "confidence": "high|medium|low"
    }
  ],
  "newDefinitions": [
    {
      "term": "term found in unclassified",
      "definition": "its definition",
      "confidence": "medium"
    }
  ]
}

Current definitions:
${JSON.stringify(payload.definitions, null, 2)}

${payload.unclassified ? `Unclassified content to scan for missed terms:\n${payload.unclassified}` : ""}
  `.trim();

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: ENHANCEMENT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      console.warn("[AI] Enhancement failed:", response.status);
      return null;
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text || "";
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch (err) {
    console.warn("[AI] Enhancement error:", err?.message || String(err));
    return null;
  }
}
