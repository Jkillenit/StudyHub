function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanTerm(raw) {
  return String(raw || "")
    .replace(/^[\-\u2022\*\d\.\)]+\s*/, "")
    .replace(/[:\-–—]+$/, "")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      // Preserve all-caps words as acronyms
      if (word === word.toUpperCase() && word.length >= 2 && /^[A-Z]+$/.test(word)) {
        return word; // keep PKI, SIEM, TCP, IP etc
      }
      // Normal title case for everything else
      return word.length > 3
        ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        : word.toLowerCase();
    })
    .join(" ")
    .trim()
    // Handle parenthetical acronyms like "(ike)" → "(IKE)"
    .replace(/\(([a-z]+)\)/g, (_, p) => `(${String(p).toUpperCase()})`);
}

function cleanDefinition(raw) {
  return String(raw || "")
    .replace(/^(is |are |was |were |refers to |defined as |the |a |an )/i, "")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function scoreConfidence(term, definition, method, rawDefinition = "") {
  const cleanedTerm = String(term || "");
  const cleanedDefinition = String(definition || "");
  const linkedVerbStart = /^(is |are |was |were |refers to |defined as )/i.test(
    String(rawDefinition || "").trim()
  );
  if (cleanedTerm.length >= 50) return "low";
  if (/[^a-zA-Z\s-]/.test(cleanedTerm)) return /\d/.test(cleanedTerm) ? "medium" : "low";
  if (linkedVerbStart) return "low";
  if (
    (method === "bold" || method === "pattern") &&
    cleanedTerm.length < 50 &&
    cleanedDefinition.length > 10
  ) {
    return "high";
  }
  if (/\d/.test(cleanedTerm)) return "medium";
  return "medium";
}

function deduplicateDefs(defs) {
  const seen = new Map();
  for (const def of defs || []) {
    const key = String(def.term || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, def);
    } else {
      const existing = seen.get(key);
      if (String(def.definition || "").length > String(existing.definition || "").length) {
        seen.set(key, def);
      }
    }
  }
  return Array.from(seen.values());
}

export function classifySlides(slides) {
  console.log("[PPTX] Classifying", (slides || []).length, "slides");
  console.log("[PPTX] First slide sample:", JSON.stringify((slides || [])[0], null, 2));
  const result = {
    definitions: [],
    sections: [],
    formulas: [],
    unclassified: [],
  };

  for (const slide of slides || []) {
    const type = detectSlideType(slide);
    switch (type) {
      case "definition":
        result.definitions.push(...extractDefinitions(slide));
        break;
      case "formula":
        result.formulas.push(...extractFormulas(slide));
        break;
      case "section":
        result.sections.push(buildSection(slide));
        break;
      default:
        result.unclassified.push(slide);
        break;
    }
  }
  result.definitions = deduplicateDefs(result.definitions);

  console.log("[PPTX] Classification result:", {
    definitions: result.definitions.length,
    sections: result.sections.length,
    formulas: result.formulas.length,
    unclassified: result.unclassified.length,
  });
  return result;
}

export function detectSlideType(slide) {
  const allText = (slide?.nodes || [])
    .map((node) => node?.text || "")
    .join(" ");

  const formulaPattern = /[A-Za-z\s]{2,}\s*=\s*[A-Za-z0-9\s+\-*/()÷×%]+/;
  if (formulaPattern.test(allText)) return "formula";

  const defPattern = /^[A-Z][^:—\n]{2,50}[:—]\s+\S/m;
  if (defPattern.test(allText)) return "definition";

  const hasBoldTerms = (slide?.nodes || []).some((node) =>
    (node?.runs || []).some((run) => run?.bold && String(run?.text || "").trim().length > 2)
  );
  const hasFollowingText = (slide?.nodes || []).some((node) =>
    (node?.runs || []).some((run) => !run?.bold && String(run?.text || "").trim().length > 10)
  );
  if (hasBoldTerms && hasFollowingText) return "definition";

  const hasBullets = (slide?.nodes || []).some((node) => node?.type === "list");
  const titleIsShort = String(slide?.title || "").trim().length > 0 && String(slide?.title || "").trim().length < 60;
  if (titleIsShort && hasBullets) return "section";
  const hasBodyText = (slide?.nodes || []).some((node) => String(node?.text || "").trim().length > 30);
  if (titleIsShort && hasBodyText) return "section";

  return "unclassified";
}

export function extractDefinitions(slide) {
  const defs = [];

  for (const node of slide?.nodes || []) {
    const text = String(node?.text || "").trim();
    const patterns = [/^(.+?):\s+(.+)$/, /^(.+?)\s+—\s+(.+)$/, /^(.+?)\s+-\s+(.+)$/];
    let matchedPattern = false;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && String(match[1] || "").trim().length < 60) {
        const term = cleanTerm(match[1]);
        const rawDefinition = String(match[2]).trim();
        const definition = cleanDefinition(rawDefinition);
        if (term && definition) {
          defs.push({
            term,
            definition,
            confidence: scoreConfidence(term, definition, "pattern", rawDefinition),
            source: "pptx",
          });
        }
        matchedPattern = true;
        break;
      }
    }
    if (matchedPattern) continue;

    const runs = node?.runs || [];
    if (runs.length < 2) continue;
    const boldRuns = runs.filter((run) => run?.bold);
    const plainRuns = runs.filter((run) => !run?.bold);
    if (!boldRuns.length || !plainRuns.length) continue;

    const term = cleanTerm(boldRuns.map((run) => run.text).join(" ").trim());
    const rawDefinition = plainRuns.map((run) => run.text).join(" ").trim();
    const definition = cleanDefinition(rawDefinition);
    if (term.length > 2 && definition.length > 5) {
      defs.push({
        term,
        definition,
        confidence: scoreConfidence(term, definition, "bold", rawDefinition),
        source: "pptx",
      });
    }
  }
  return defs;
}

export function buildSection(slide) {
  const noiseFilter = (text) =>
    text.length > 5 && // no "7" or "•"
    !/^\d+$/.test(text) && // no lone numbers
    !/^[•\-\*]+$/.test(text) && // no lone bullets
    !/^\s*$/.test(text); // no whitespace only

  const bullets = (slide?.nodes || [])
    .filter((node) => node?.type === "list" || node?.type === "paragraph")
    .map((node) => String(node?.text || "").trim())
    .filter(noiseFilter);
  const fallbackBullets =
    bullets.length > 0
      ? bullets
      : (slide?.nodes || [])
          .map((node) => String(node?.text || "").trim())
          .filter(Boolean)
          .flatMap((line) => line.split(/(?<=[.!?])\s+/).map((part) => part.trim()))
          .filter(noiseFilter);
  const lines = bullets.length ? bullets : fallbackBullets;

  return {
    title: String(slide?.title || "").trim() || lines[0] || "Untitled",
    bullets: String(slide?.title || "").trim() ? lines : lines.slice(1),
  };
}

export function extractFormulas(slide) {
  const formulaPattern = /[A-Za-z\s]{2,}\s*=\s*[A-Za-z0-9\s+\-*/()÷×%]+/g;
  const allText = [slide?.title || "", ...(slide?.nodes || []).map((node) => node?.text || "")]
    .join("\n")
    .trim();
  const matches = allText.match(formulaPattern) || [];
  return matches.map((formula) => ({
    formula: formula.trim(),
    context: String(slide?.title || "").trim(),
  }));
}

export function detectChapters(slides, fallbackTitle = "Imported Course") {
  const chapters = [];
  let current = null;
  const markerRegex = /^(chapter|unit|module|section|part)\s+\d+/i;

  for (const slide of slides || []) {
    const title = String(slide?.title || "").trim();
    const bodyLines = (slide?.nodes || []).map((node) => String(node?.text || "").trim()).filter(Boolean);
    const isTitleSlide = bodyLines.length <= 1 && title.length > 0 && title.length < 60;
    const isChapterMarker = markerRegex.test(title);

    if (isTitleSlide || isChapterMarker) {
      if (current && current.slides.length > 0) chapters.push(current);
      current = { title: title || `Chapter ${chapters.length + 1}`, slides: [] };
      continue;
    }

    if (!current) current = { title: "Introduction", slides: [] };
    current.slides.push(slide);
  }

  if (current) chapters.push(current);
  if (!chapters.length && (slides || []).length > 0) {
    return [{ title: fallbackTitle, slides: slides || [] }];
  }
  return chapters.filter((chapter) => chapter.slides.length > 0);
}

export function textToSlides(text, title = "Notes Review") {
  const rows = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const nodes = rows.map((line) => {
    const isList = /^[-*•]\s+/.test(line);
    const normalized = line.replace(/^[-*•]\s+/, "");
    const boldPrefix = normalized.match(/^\*\*(.+?)\*\*/);
    const runs = boldPrefix
      ? [
          { text: boldPrefix[1], bold: true, italic: false, type: isList ? "list" : "paragraph" },
          { text: normalized.replace(/^\*\*.+?\*\*/, "").trim(), bold: false, italic: false, type: isList ? "list" : "paragraph" },
        ]
      : [{ text: normalized, bold: false, italic: false, type: isList ? "list" : "paragraph" }];
    return { type: isList ? "list" : "paragraph", text: normalized, runs };
  });
  return [{ slideNumber: 1, title, titleFormatting: {}, nodes }];
}

export function glossaryInjectBold(text, terms) {
  let out = String(text || "");
  for (const term of terms || []) {
    const t = String(term || "").trim();
    if (!t) continue;
    const regex = new RegExp(`(^|[^a-zA-Z0-9])(${escapeRegExp(t)})([^a-zA-Z0-9]|$)`, "gi");
    out = out.replace(regex, "$1**$2**$3");
  }
  return out;
}
