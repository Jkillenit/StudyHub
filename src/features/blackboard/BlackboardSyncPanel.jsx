import { useCallback, useEffect, useRef, useState } from "react";
import { relativeTime } from "../dashboard/dateLabels.js";

const LAST_SYNC_KEY = "bb.lastSync";
const STEP_LABEL = { contents: "CONTENT", announcements: "ANNOUNCEMENTS", grades: "GRADES" };

function errorText(error) {
  if (error === "not-logged-in") {
    return "Blackboard didn't accept the session. Open Blackboard, sign in, leave that window open, and try again.";
  }
  return error || "Sync failed.";
}

async function loadLastSync() {
  try {
    return JSON.parse((await window.studyHub?.db?.settings?.get?.(LAST_SYNC_KEY)) || "{}") || {};
  } catch {
    return {};
  }
}

/**
 * Lists the student's Blackboard enrollments and mirrors each one into a linked Study Hub course.
 * `onEnsureCourse` returns the linked course (creating it if needed); `onSynced` fires after each sync.
 */
export function BlackboardSyncPanel({ userCourses, onEnsureCourse, onSynced }) {
  const [bbCourses, setBbCourses] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState({});
  const [lastSync, setLastSync] = useState({});
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadLastSync().then(setLastSync);
    const bb = window.studyHub?.blackboard;
    return bb?.onSyncProgress?.((p) => setProgress(p));
  }, []);

  const linkedCourse = useCallback(
    (bbCourseId) => userCourses.find((c) => c.bbCourseId === bbCourseId) || null,
    [userCourses]
  );

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
    const course = await onEnsureCourse(bbCourse);
    if (!course) return { ok: false, error: "Could not create the Study Hub course." };
    const courseUuid = course.uuid || course.id;
    setProgress({ courseUuid, step: "contents" });
    const res = await window.studyHub?.blackboard?.syncCourse?.({ courseUuid, bbCourseId: bbCourse.bbCourseId });
    setResults((r) => ({ ...r, [bbCourse.bbCourseId]: res }));
    if (res?.ok) {
      const next = { ...(await loadLastSync()), [bbCourse.bbCourseId]: new Date().toISOString() };
      await window.studyHub?.db?.settings?.set?.({ key: LAST_SYNC_KEY, value: JSON.stringify(next) });
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

  const linkedList = (bbCourses || []).filter((c) => linkedCourse(c.bbCourseId));

  return (
    <div className="sh-bb-sync">
      <div className="sh-bb-sync-head">
        <span className="sh-hub-section-label">SYNC COURSES</span>
        <div className="sh-bb-sync-actions">
          {bbCourses && linkedList.length > 1 ? (
            <button type="button" className="sh-btn-ghost sh-bb-sync-btn" disabled={busy} onClick={() => run(linkedList)}>
              SYNC ALL LINKED
            </button>
          ) : null}
          <button type="button" className="sh-btn-ghost sh-bb-sync-btn" disabled={loading || busy} onClick={loadCourses}>
            {loading ? "LOADING…" : bbCourses ? "REFRESH" : "LOAD MY COURSES"}
          </button>
        </div>
      </div>

      {error ? <p className="sh-bb-sync-error">{error}</p> : null}

      {bbCourses?.length ? (
        <ul className="sh-bb-sync-list">
          {bbCourses.map((c) => {
            const linked = linkedCourse(c.bbCourseId);
            const res = results[c.bbCourseId];
            const active = busy && progress && linked && progress.courseUuid === (linked.uuid || linked.id);
            let status = linked ? `LINKED · SYNCED ${relativeTime(lastSync[c.bbCourseId]).toUpperCase()}` : "NOT IN STUDY HUB";
            if (active) status = `SYNCING ${STEP_LABEL[progress.step] || ""}…`;
            else if (res?.ok && res.counts) {
              const { contents, announcements, assignments, grades } = res.counts;
              status = `✓ ${contents} ITEMS · ${announcements} ANN · ${assignments} DUE · ${grades} GRADES`;
            } else if (res && !res.ok) status = `✕ ${errorText(res.error)}`;
            return (
              <li key={c.bbCourseId} className="sh-bb-sync-row">
                <div className="sh-bb-sync-row-text">
                  <div className="sh-bb-sync-name">{c.name}</div>
                  <div className={`sh-bb-sync-status${res && !res.ok ? " sh-bb-sync-status--error" : ""}`}>
                    {c.courseCode ? `${c.courseCode} · ` : ""}
                    {status}
                  </div>
                </div>
                <button type="button" className="sh-btn-ghost sh-bb-sync-btn" disabled={busy} onClick={() => run([c])}>
                  {linked ? "SYNC" : "ADD + SYNC"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
