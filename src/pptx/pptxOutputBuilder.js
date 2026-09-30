function makeId(prefix, seed, index) {
  return `${prefix}_${seed}_${index}_${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildOutput(classified) {
  const seed = Date.now();
  const definitions = classified?.definitions || [];
  const sections = classified?.sections || [];
  const formulas = classified?.formulas || [];
  const unclassified = classified?.unclassified || [];

  return {
    contentCards: definitions.map((def, idx) => ({
      id: makeId("pptx", seed, idx),
      term: def.term,
      definition: def.definition,
      confidence: def.confidence || "high",
      source: "pptx",
    })),
    contentSections: sections.map((section) => ({
      title: section.title,
      items: section.bullets,
      source: "pptx",
    })),
    contentFormulas: formulas.map((formula) => ({
      formula: formula.formula,
      context: formula.context,
      source: "pptx",
    })),
    notesReviewBlock: unclassified.length > 0 ? buildReviewBlock(unclassified) : null,
    flashcards: definitions.map((def, idx) => ({
      id: makeId("pptx_fc", seed, idx),
      front: def.term,
      back: def.definition,
      source: "pptx",
    })),
    stats: {
      cards: definitions.length,
      sections: sections.length,
      formulas: formulas.length,
      unclassified: unclassified.length,
    },
  };
}

export function buildReviewBlock(unclassifiedSlides) {
  const lines = (unclassifiedSlides || []).flatMap((slide) => [
    `## ${slide.title || `Slide ${slide.slideNumber}`}`,
    ...(slide.nodes || []).map((node) => String(node?.text || "")).filter(Boolean),
    "",
  ]);

  const html = lines
    .map((line) => {
      if (line.startsWith("## ")) return `<h3>${escapeHtml(line.slice(3))}</h3>`;
      return line ? `<p>${escapeHtml(line)}</p>` : "";
    })
    .join("\n");

  const text = lines.join("\n").trim();
  return {
    html,
    text,
    slideCount: (unclassifiedSlides || []).length,
  };
}
