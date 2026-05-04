import { STORAGE, loadJson, saveJson } from "../lib/storage.js";

function normalizeMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

export function loadOm300NotesMap() {
  return normalizeMap(loadJson(STORAGE.om300ChapterNotes, {}));
}

/** @returns {{ markdown: string, html: string, updatedAt: string | null }} */
export function getOm300ChapterNote(sectionId) {
  const map = loadOm300NotesMap();
  const row = map[sectionId];
  if (!row || typeof row !== "object") return { markdown: "", html: "", updatedAt: null };
  return {
    markdown: typeof row.markdown === "string" ? row.markdown : "",
    html: typeof row.html === "string" ? row.html : "",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
  };
}

/** Persists TipTap HTML under the existing chapter-scoped storage key. */
export function saveOm300ChapterNote(sectionId, html) {
  const map = loadOm300NotesMap();
  map[sectionId] = {
    html,
    updatedAt: new Date().toISOString(),
  };
  saveJson(STORAGE.om300ChapterNotes, map);
}

/** Whether notes have user-visible body text (legacy markdown or TipTap HTML). */
export function om300NoteHasVisibleBody(note) {
  const md = (note.markdown || "").trim();
  if (md.length > 0) return true;
  const html = note.html || "";
  if (!html.trim()) return false;
  const stripped = html.replace(/<[^>]*>/g, "").trim();
  return stripped.length > 0;
}
