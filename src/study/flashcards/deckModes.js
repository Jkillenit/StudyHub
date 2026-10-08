import { getDueCards, getWeakCards } from "../sm2.js";

export const DECK_MODES = [
  { id: "all", label: "All" },
  { id: "due", label: "Due" },
  { id: "weak", label: "Weak" },
  { id: "module", label: "This module" },
  { id: "manual", label: "Manual" },
  { id: "pptx", label: "Imported" },
];

/** `examFor(card)` returns the exam date governing a card, so DUE includes final-window exam cards. */
export function filterDeck(cards, mode, moduleId = null, { examFor = null } = {}) {
  const base = Array.isArray(cards) ? cards : [];
  switch (mode) {
    case "manual":
      return base.filter((c) => (c.source || "manual") === "manual");
    case "pptx":
      return base.filter((c) => c.source && c.source !== "manual");
    case "due":
      return getDueCards(base, { examFor });
    case "weak":
      return getWeakCards(base);
    case "module":
      return moduleId ? base.filter((c) => c.moduleId === moduleId) : base;
    default:
      return base;
  }
}
