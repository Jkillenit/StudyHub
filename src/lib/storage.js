/** localStorage keys — shared with any legacy standalone HTML using the same profile. */
export const STORAGE = {
  disabled: "studyHub.v2.om300.disabledModules",
  completed: "studyHub.v2.om300.completedChapters",
  fontStep: "studyHub.v2.prefs.fontStep",
  comfortable: "studyHub.v2.prefs.comfortableReading",
  om300ChapterNotes: "studyHub.v2.om300.chapterNotes",
  /** @type {string} OM300 materials library JSON (Electron paths from pickers) */
  om300Materials: "studyHub.v2.om300.materialsLibrary",
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
