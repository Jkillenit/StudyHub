import { getDueCards, getWeakCards } from "../sm2.js";

export const DECK_MODES = [
  { id: "all", label: "ALL" },
  { id: "due", label: "DUE" },
  { id: "weak", label: "WEAK" },
  { id: "module", label: "THIS MODULE" },
  { id: "manual", label: "MANUAL" },
  { id: "pptx", label: "IMPORTED" },
];

export function filterDeck(cards, mode, moduleId = null) {
  const base = Array.isArray(cards) ? cards : [];
  switch (mode) {
    case "manual":
      return base.filter((c) => (c.source || "manual") === "manual");
    case "pptx":
      return base.filter((c) => c.source && c.source !== "manual");
    case "due":
      return getDueCards(base);
    case "weak":
      return getWeakCards(base);
    case "module":
      return moduleId ? base.filter((c) => c.moduleId === moduleId) : base;
    default:
      return base;
  }
}
