import { useCallback, useEffect, useRef, useState } from "react";
import { courseStore } from "../../db/courseStore.js";
import { migrateIfNeeded } from "../../db/migrateFromLocalStorage.js";
import { ensureUserCourse } from "../../hub/userCourseModel.js";

/**
 * Owns the list of user courses. State lives in a ref as well as React state so
 * that successive updates (e.g. several Blackboard files arriving at once) always
 * build on the latest course instead of a stale render snapshot.
 */
export function useUserCourses() {
  const [courses, setCourses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const coursesRef = useRef([]);
  const chainsRef = useRef(new Map());

  const commit = useCallback((next) => {
    coursesRef.current = next;
    setCourses(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await migrateIfNeeded();
      const loadedCourses = (await courseStore.loadAllCourses()).map(ensureUserCourse);
      if (cancelled) return;
      commit(loadedCourses);
      setLoaded(true);
    })().catch(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [commit]);

  const getCourse = useCallback((id) => coursesRef.current.find((c) => c.id === id || c.uuid === id) || null, []);

  const saveCourse = useCallback(
    (course) => {
      const normalized = ensureUserCourse(course);
      if (!coursesRef.current.some((c) => c.id === normalized.id)) return Promise.resolve({ success: false });
      commit(coursesRef.current.map((c) => (c.id === normalized.id ? normalized : c)));
      return courseStore.syncCourse(normalized);
    },
    [commit]
  );

  const addCourse = useCallback(
    async (course) => {
      const normalized = ensureUserCourse(course);
      commit([...coursesRef.current, normalized]);
      await courseStore.syncCourse(normalized);
      return normalized;
    },
    [commit]
  );

  /** Serialized per course: `fn(latestCourse)` may be async and return the next course or null to skip. */
  const updateCourse = useCallback(
    (id, fn) => {
      const prev = chainsRef.current.get(id) || Promise.resolve();
      const run = prev.then(async () => {
        const current = getCourse(id);
        if (!current) return null;
        const next = await fn(current);
        if (!next) return current;
        await saveCourse(next);
        return getCourse(id);
      });
      const settled = run.catch(() => null);
      chainsRef.current.set(id, settled);
      return settled;
    },
    [getCourse, saveCourse]
  );

  const deleteCourse = useCallback(
    async (id) => {
      commit(coursesRef.current.filter((c) => c.id !== id && c.uuid !== id));
      chainsRef.current.delete(id);
      await courseStore.deleteCourse(id);
    },
    [commit]
  );

  const reloadCourse = useCallback(
    async (id) => {
      const fresh = await courseStore.getCourseWithModules(id);
      if (!fresh) return null;
      const normalized = ensureUserCourse(fresh);
      commit(coursesRef.current.map((c) => (c.id === normalized.id ? normalized : c)));
      return normalized;
    },
    [commit]
  );

  /** Replace every course with an imported set (JSON restore). */
  const replaceAll = useCallback(
    async (incoming) => {
      const normalized = incoming.map(ensureUserCourse);
      const keep = new Set(normalized.map((c) => c.id));
      for (const old of coursesRef.current) {
        if (!keep.has(old.id)) await courseStore.deleteCourse(old.id);
      }
      commit(normalized);
      for (const course of normalized) await courseStore.syncCourse(course);
    },
    [commit]
  );

  return { courses, loaded, getCourse, saveCourse, addCourse, updateCourse, deleteCourse, reloadCourse, replaceAll };
}
