/** Sidebar grouping and display prefixes for OM 300 tiling UI. */

export const STUDY_SIDEBAR_GROUPS = [
  {
    key: "mod",
    label: "Modules",
    ids: ["ch1", "ch3", "ch4", "ch6", "ch6s", "ch7", "ch11", "ch12", "ch16"],
  },
  { key: "ref", label: "Reference", ids: ["final", "formulas"] },
  { key: "drill", label: "Drill", ids: ["flashcards"] },
];

const PREFIX = {
  ch1: "CH·01",
  ch3: "CH·03",
  ch4: "CH·04",
  ch6: "CH·06",
  ch6s: "CH·06S",
  ch7: "CH·07",
  ch11: "CH·11",
  ch12: "CH·12",
  ch16: "CH·16",
  final: "FRM",
  formulas: "EQ",
  flashcards: "QZ",
};

export function studySidebarPrefix(id) {
  return PREFIX[id] || String(id).toUpperCase();
}

export function studyBreadcrumbChapter(id, label) {
  if (id === "ch1") return "CH·01–02";
  return studySidebarPrefix(id);
}
