function makeAiId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function mergeEnhancedOutput(localOutput, aiResult) {
  if (!aiResult) return localOutput;

  const enhanced = { ...localOutput };
  enhanced.contentCards = Array.isArray(localOutput?.contentCards) ? [...localOutput.contentCards] : [];
  enhanced.flashcards = Array.isArray(localOutput?.flashcards) ? [...localOutput.flashcards] : [];

  if (aiResult.definitions?.length > 0) {
    const aiMap = new Map(aiResult.definitions.map((d) => [String(d.term || "").toLowerCase().trim(), d]));
    enhanced.contentCards = enhanced.contentCards.map((card) => {
      const aiVersion = aiMap.get(String(card.term || "").toLowerCase().trim());
      if (!aiVersion) return card;
      return {
        ...card,
        definition: aiVersion.definition || card.definition,
        confidence: aiVersion.confidence || card.confidence,
        enhancedByAI: true,
      };
    });
  }

  if (aiResult.newDefinitions?.length > 0) {
    const existingTerms = new Set(enhanced.contentCards.map((c) => String(c.term || "").toLowerCase().trim()));
    const genuinelyNew = aiResult.newDefinitions
      .filter(
        (d) =>
          String(d?.term || "").trim().length > 1 &&
          String(d?.definition || "").trim().length > 5 &&
          !existingTerms.has(String(d.term || "").toLowerCase().trim())
      )
      .map((d) => ({
        id: makeAiId("ai"),
        term: d.term,
        definition: d.definition,
        confidence: d.confidence || "medium",
        source: "pptx",
        enhancedByAI: true,
      }));

    enhanced.contentCards = [...enhanced.contentCards, ...genuinelyNew];
    enhanced.flashcards = [
      ...enhanced.flashcards,
      ...genuinelyNew.map((d) => ({
        id: makeAiId(`ai_fc_${d.id}`),
        front: d.term,
        back: d.definition,
        source: "pptx",
      })),
    ];
  }

  return enhanced;
}
