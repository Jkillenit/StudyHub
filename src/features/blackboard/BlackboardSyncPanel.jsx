import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { relativeTime } from "../dashboard/dateLabels.js";
import { courseStore } from "../../db/courseStore.js";

const LAST_SYNC_KEY = "bb.lastSync";
const STEP_LABEL = { contents: "content", announcements: "announcements", grades: "grades", syllabus: "syllabus" };
const SYLLABUS_LABEL = {
  applied: "SYLLABUS WEIGHTS ADDED",
  kept: "GRADES SORTED INTO YOUR WEIGHTS",
  none: "SYLLABUS FOUND, NO WEIGHTS READ",
  missing: "NO SYLLABUS FOUND",
};

function errorText(error) {
  if (error === "not-logged-in") {
    return "Blackboard didn't accept the session. Open Blackboard, sign in, leave that window open, and try again.";
  }
  return error || "Sync failed.";
}

/** Leading year of a course code/name such as "202640-ST-260-004" or "2026 Fall ...". */
function courseYear(course) {
  for (const field of [course.courseCode, course.name]) {
    const match = String(field || "").trim().match(/^(20\d{2})/);
    if (match) return Number(match[1]);
  }
  return null;
}

async function loadLastSync() {
  try {
    return JSON.parse((await courseStore.getSetting(LAST_SYNC_KEY)) || "{}") || {};
  } catch {
    return {};
  }
}

/** Lists the student's current Blackboard enrollments; syncing one creates its Study Hub course if needed. */
export function BlackboardSyncPanel({ userCourses, onSynced }) {
  const [bbCourses, setBbCourses] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState({});
  const [syllabusStatus, setSyllabusStatus] = useState({});
  const [lastSync, setLastSync] = useState({});
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadLastSync().then(setLastSync);
    const onSynced = (e) => {
      const { bbCourseId, syllabusStatus: status } = e.detail || {};
      if (bbCourseId && status) setSyllabusStatus((s) => ({ ...s, [bbCourseId]: status }));
    };
    window.addEventListener("studyhub-bb-synced", onSynced);
    const off = window.studyHub?.blackboard?.onSyncProgress?.((p) => setProgress(p));
    return () => {
      window.removeEventListener("studyhub-bb-synced", onSynced);
      off?.();
    };
  }, []);

  const isLinked = useCallback((bbCourseId) => userCourses.some((c) => c.bbCourseId === bbCourseId), [userCourses]);

  const thisYear = new Date().getFullYear();
  const visible = useMemo(() => {
    if (!bbCourses) return [];
    if (showAll) return bbCourses;
    return bbCourses.filter((c) => (courseYear(c) ?? 0) >= thisYear);
  }, [bbCourses, showAll, thisYear]);
  const hiddenCount = (bbCourses?.length || 0) - visible.length;

  const loadCourses = async () => {
    setLoading(true);
    setError("");
    const res = await window.studyHub?.blackboard?.listCourses?.();
    setLoading(false);
    if (!res?.ok) {
      setError(errorText(res?.error));
      return;
    }
    setBbCourses(res.courses || []);
    if (!res.courses?.length) setError("No student enrollments found on Blackboard.");
  };

  const syncOne = async (bbCourse) => {
    setProgress({ bbCourseId: bbCourse.bbCourseId, step: "contents" });
    const res = await window.studyHub?.blackboard?.syncCourse?.({
      bbCourseId: bbCourse.bbCourseId,
      name: bbCourse.name,
      courseCode: bbCourse.courseCode,
      term: bbCourse.termId,
    });
    setResults((r) => ({ ...r, [bbCourse.bbCourseId]: res }));
    if (res?.ok) {
      const next = { ...(await loadLastSync()), [bbCourse.bbCourseId]: new Date().toISOString() };
      await courseStore.setSetting(LAST_SYNC_KEY, JSON.stringify(next));
      setLastSync(next);
    }
    return res;
  };

  const run = async (list) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      for (const bbCourse of list) {
        const res = await syncOne(bbCourse);
        if (res?.error === "not-logged-in") {
          setError(errorText(res.error));
          break;
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress(null);
      onSynced?.();
    }
  };

  return (
    <div className="sh-bb-sync">
      <div className="sh-bb-sync-head">
        <span className="sh-hub-section-label">Sync courses</span>
        <div className="sh-bb-sync-actions">
          {visible.length > 1 ? (
            <button type="button" className="sh-btn-ghost sh-bb-sync-btn" disabled={busy} onClick={() => run(visible)}>
              SYNC ALL
            </button>
          ) : null}
          <button type="button" className="sh-btn-ghost sh-bb-sync-btn" disabled={loading || busy} onClick={loadCourses}>
            {loading ? "LOADING…" : bbCourses ? "REFRESH" : "LOAD MY COURSES"}
          </button>
        </div>
      </div>

      {error ? <p className="sh-bb-sync-error">{error}</p> : null}

      {visible.length ? (
        <ul className="sh-bb-sync-list">
          {visible.map((c) => {
            const linked = isLinked(c.bbCourseId);
            const res = results[c.bbCourseId];
            const active = busy && progress?.bbCourseId === c.bbCourseId;
            let status = linked ? `Synced ${relativeTime(lastSync[c.bbCourseId])}` : "New · sync to add";
            if (active) status = `Syncing ${STEP_LABEL[progress.step] || ""}…`;
            else if (res?.ok && res.counts) {
              const { contents, announcements, assignments, grades, scored = 0 } = res.counts;
              status = `✓ ${contents} items · ${announcements} ann · ${assignments} due · ${scored}/${grades} grades scored`;
              if (grades && !scored) status += res.gradeSource === "none" ? " (scores not readable)" : "";
            } else if (res && !res.ok) status = `✕ ${errorText(res.error)}`;
            const syl = !active && res?.ok ? syllabusStatus[c.bbCourseId] : null;
            return (
              <li key={c.bbCourseId} className="sh-bb-sync-row">
                <div className="sh-bb-sync-row-text">
                  <div className="sh-bb-sync-name">{c.name}</div>
                  <div className={`sh-bb-sync-status${res && !res.ok ? " sh-bb-sync-status--error" : ""}`}>
                    {c.courseCode ? `${c.courseCode} · ` : ""}
                    {status}
                  </div>
                  {syl ? (
                    <div className={`sh-bb-sync-status${syl === "applied" || syl === "kept" ? " sh-bb-sync-status--ok" : ""}`}>
                      {SYLLABUS_LABEL[syl]}
                      {syl === "missing" || syl === "none"
                        ? " · OPEN THE SYLLABUS IN THE BLACKBOARD WINDOW AND SYNC AGAIN"
                        : ""}
                    </div>
                  ) : null}
                </div>
                <button type="button" className="sh-btn-ghost sh-bb-sync-btn" disabled={busy} onClick={() => run([c])}>
                  {linked ? "SYNC" : "ADD + SYNC"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {bbCourses && (hiddenCount > 0 || showAll) ? (
        <button type="button" className="sh-bb-sync-toggle" onClick={() => setShowAll((v) => !v)}>
          {showAll ? `SHOW ${thisYear}+ COURSES ONLY` : `SHOW ${hiddenCount} OLDER / NON-TERM COURSES`}
        </button>
      ) : null}
    </div>
  );
}
