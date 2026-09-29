import { courseStore } from "./courseStore";
import { ensureUserCourse } from "../hub/userCourseModel.js";

const FLAG = "studyHub.migratedToSQLite";
const LEGACY_COURSES = "studyHub.v2.userCourses";
const LEGACY_KEYS = ["studyHub.apiKey", "anthropic_api_key"];

async function migrateLegacyApiKey() {
  const ai = window.studyHub?.ai;
  for (const key of LEGACY_KEYS) {
    const value = localStorage.getItem(key);
    if (!value) continue;
    try {
      const status = await ai?.getStatus?.();
      if (!status?.configured && value.trim()) await ai?.setApiKey?.(value.trim());
    } finally {
      localStorage.removeItem(key);
    }
  }
}

export async function migrateIfNeeded() {
  const db = window.studyHub?.db;
  if (!db) return;

  await migrateLegacyApiKey().catch(() => {});

  if (localStorage.getItem(FLAG)) return;

  const legacyCourses = localStorage.getItem(LEGACY_COURSES);
  if (!legacyCourses) {
    localStorage.setItem(FLAG, "1");
    return;
  }

  try {
    const courses = JSON.parse(legacyCourses);
    for (const legacyCourse of Array.isArray(courses) ? courses : []) {
      await courseStore.syncCourse(ensureUserCourse(legacyCourse));
    }
    localStorage.setItem(FLAG, "1");
    localStorage.removeItem(LEGACY_COURSES);
  } catch {
    /* leave the flag unset so the next launch retries; legacy data is untouched */
  }
}
