import { STORAGE, loadJson, saveJson } from "../lib/storage.js";

function normalizeMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

export function loadStudyNotesMap() {
  return normalizeMap(loadJson(STORAGE.builtinChapterNotes, {}));
}

/** @returns {{ markdown: string, html: string, updatedAt: string | null }} */
export function getStudyChapterNote(sectionId) {
  const map = loadStudyNotesMap();
  const row = map[sectionId];
  if (!row || typeof row !== "object") return { markdown: "", html: "", updatedAt: null };
  return {
    markdown: typeof row.markdown === "string" ? row.markdown : "",
    html: typeof row.html === "string" ? row.html : "",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
  };
}

/** Persists TipTap HTML under the existing chapter-scoped storage key. */
export function saveStudyChapterNote(sectionId, html) {
  const map = loadStudyNotesMap();
  map[sectionId] = {
    html,
    updatedAt: new Date().toISOString(),
  };
  saveJson(STORAGE.builtinChapterNotes, map);
}

/** Whether notes have user-visible body text (legacy markdown or TipTap HTML). */
export function studyNoteHasVisibleBody(note) {
  const md = (note.markdown || "").trim();
  if (md.length > 0) return true;
  const html = note.html || "";
  if (!html.trim()) return false;
  const stripped = html.replace(/<[^>]*>/g, "").trim();
  return stripped.length > 0;
}
