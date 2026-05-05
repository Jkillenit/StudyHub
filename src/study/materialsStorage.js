import { STORAGE, loadJson, saveJson } from "../lib/storage.js";

function fileLabel(fullPath) {
  const i = Math.max(fullPath.lastIndexOf("/"), fullPath.lastIndexOf("\\"));
  return i >= 0 ? fullPath.slice(i + 1) : fullPath;
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** @returns {{ id: string, path: string, name: string, addedAt: string }[]} */
export function loadStudyMaterials() {
  const raw = loadJson(STORAGE.builtinMaterials, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x.path === "string")
    .map((x) => ({
      id: typeof x.id === "string" ? x.id : newId(),
      path: x.path,
      name: typeof x.name === "string" ? x.name : fileLabel(x.path),
      addedAt: typeof x.addedAt === "string" ? x.addedAt : new Date().toISOString(),
    }));
}

export function saveStudyMaterials(list) {
  saveJson(STORAGE.builtinMaterials, list);
}

/** @param {string[]} paths */
export function mergePathsIntoMaterials(existing, paths) {
  const map = new Map(existing.map((m) => [m.path, m]));
  for (const p of paths) {
    const path = String(p || "").trim();
    if (!path || map.has(path)) continue;
    map.set(path, {
      id: newId(),
      path,
      name: fileLabel(path),
      addedAt: new Date().toISOString(),
    });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
