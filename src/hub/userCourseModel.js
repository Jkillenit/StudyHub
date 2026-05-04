export const HUB_KEYS = {
  userCourses: "studyHub.v2.userCourses",
  lastCourse: "studyHub.v2.lastCourseId",
};

export function uid(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 11);
}

export function ensureUserCourse(course) {
  const c = { ...course };
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
