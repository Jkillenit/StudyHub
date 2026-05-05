/** localStorage keys — shared with any legacy standalone HTML using the same profile. */
export const STORAGE = {
  disabled: "studyHub.v2.builtin.disabledModules",
  completed: "studyHub.v2.builtin.completedChapters",
  fontStep: "studyHub.v2.prefs.fontStep",
  comfortable: "studyHub.v2.prefs.comfortableReading",
  builtinChapterNotes: "studyHub.v2.builtin.chapterNotes",
  /** @type {string} Built-in course materials library JSON (Electron paths from pickers) */
  builtinMaterials: "studyHub.v2.builtin.materialsLibrary",
};

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}
