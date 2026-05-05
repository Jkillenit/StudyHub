import { courseStore } from "./courseStore";

export async function migrateIfNeeded() {
  const db = window.studyHub?.db;
  if (!db) return;

  const migrated = localStorage.getItem("studyHub.migratedToSQLite");
  if (migrated) return;

  const legacyCourses = localStorage.getItem("studyHub.v2.userCourses");
  if (!legacyCourses) {
    localStorage.setItem("studyHub.migratedToSQLite", "1");
    return;
  }

  try {
    const courses = JSON.parse(legacyCourses);
    for (const legacyCourse of Array.isArray(courses) ? courses : []) {
      await courseStore.syncCourse(legacyCourse);
    }

    const legacyApiKey = localStorage.getItem("studyHub.apiKey");
    if (legacyApiKey) {
      await db.settings.set({ key: "apiKey", value: legacyApiKey });
    }

    localStorage.setItem("studyHub.migratedToSQLite", "1");
  } catch (error) {
    console.error("[MIGRATE] Migration failed:", error);
  }
}
