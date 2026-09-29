export const HUB_KEYS = {
  lastCourse: "studyHub.v2.lastCourseId",
};

export function uid(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 11);
}

function hashString(value) {
  let h = 5381;
  const s = String(value || "");
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Id-less cards/terms get a content-derived id so repeated normalization never mints duplicates. */
function withStableIds(list, prefix, keyOf) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.map((item) => {
    let id = item?.id || item?.uuid;
    if (!id) {
      id = `${prefix}_${hashString(keyOf(item))}`;
      while (seen.has(id)) id = `${id}x`;
    }
    seen.add(id);
    return item?.id === id ? item : { ...item, id };
  });
}

export function ensureUserCourse(course) {
  const c = { ...course };
  if (!c.id && c.uuid) c.id = c.uuid;
  if (!Array.isArray(c.modules) || !c.modules.length) {
    const mid = uid("m");
    c.modules = [{ id: mid, label: "Notes", title: "General", body: "" }];
    c.activeModuleId = mid;
  }
  if (!c.activeModuleId || !c.modules.some((m) => m.id === c.activeModuleId)) {
    c.activeModuleId = c.modules[0].id;
  }
  c.disabledModuleIds = Array.isArray(c.disabledModuleIds) ? c.disabledModuleIds : [];
  c.completedModuleIds = Array.isArray(c.completedModuleIds) ? c.completedModuleIds : [];
  c.materialPaths = Array.isArray(c.materialPaths) ? c.materialPaths : [];
  c.flashcards = withStableIds(c.flashcards, "fc", (card) => `${card?.front}|${card?.back}`);
  c.glossary = withStableIds(c.glossary, "gls", (term) => String(term?.term || "").toLowerCase().trim());
  return c;
}

export function appendMaterialPaths(course, paths) {
  const c = ensureUserCourse(course);
  const set = new Set(c.materialPaths);
  for (const p of paths) {
    const t = String(p || "").trim();
    if (t) set.add(t);
  }
  return { ...c, materialPaths: [...set] };
}
