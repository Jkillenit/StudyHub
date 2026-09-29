/**
 * Optional Claude Haiku enhancement. The API key lives in the main process;
 * this module only forwards extracted content over IPC and returns null on
 * any failure so the local pipeline result is always usable on its own.
 */
export async function enhanceWithClaude(localOutput) {
  const ai = typeof window !== "undefined" ? window.studyHub?.ai : null;
  if (!ai?.enhance) return null;

  const definitions = (localOutput?.contentCards || []).map((c) => ({
    term: c.term,
    definition: c.definition,
    confidence: c.confidence,
  }));
  const unclassified = localOutput?.notesReviewBlock?.html
    ? localOutput.notesReviewBlock.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000)
    : null;

  if (definitions.length === 0 && !unclassified) return null;

  try {
    const res = await ai.enhance({ definitions, unclassified });
    if (!res?.ok || !res.result) return null;
    return res.result;
  } catch {
    return null;
  }
}
