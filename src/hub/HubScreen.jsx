import { useEffect, useState } from "react";
import { loadJson } from "../lib/storage.js";
import { HUB_KEYS, ensureUserCourse } from "./userCourseModel.js";
import { ManualCourseEntry } from "../welcome/ManualCourseEntry.jsx";
import { ExpressImportModal } from "../welcome/ExpressImportModal.jsx";

export function HubScreen({ userCourses, onOpenCourse, onManualCreate, onExpressComplete }) {
  const [manualOpen, setManualOpen] = useState(false);
  const [expressOpen, setExpressOpen] = useState(false);
  const [bbStatus, setBbStatus] = useState({ loggedIn: false, windowOpen: false });
  const highlightId = loadJson(HUB_KEYS.lastCourse, null);

  useEffect(() => {
    const fn = () => setManualOpen(true);
    window.addEventListener("studyhub-open-manual-add", fn);
    return () => window.removeEventListener("studyhub-open-manual-add", fn);
  }, []);

  useEffect(() => {
    async function checkStatus() {
      const status = await window.studyHub?.blackboard?.getStatus?.();
      if (status) setBbStatus(status);
    }
    checkStatus();

    const handleCourseDetected = (course) => {
      console.log("[BB] Course detected:", course.bbCourseId);
    };

    window.studyHub?.blackboard?.onCourseDetected?.(handleCourseDetected);
    return () => {
      window.studyHub?.blackboard?.offCourseDetected?.(handleCourseDetected);
    };
  }, []);

  async function handleOpenBlackboard() {
    if (highlightId && highlightId !== "builtin") {
      await window.studyHub?.blackboard?.setActiveCourse?.(highlightId);
    }
    await window.studyHub?.blackboard?.open?.();
    setTimeout(async () => {
      const status = await window.studyHub?.blackboard?.getStatus?.();
      if (status) setBbStatus(status);
    }, 1000);
  }

  return (
    <div className="sh-hub-root">
      <div className="sh-hub-inner">
        <div className="sh-hub-block">
          <div className="sh-hub-section-label">YOUR COURSES</div>
          <div className="sh-hub-list">
            <button
              type="button"
              className={`sh-hub-course-row sh-hub-course-row--cyan ${highlightId === "builtin" ? "sh-hub-course-row--recent" : ""}`}
              onClick={() => onOpenCourse("builtin")}
            >
              <div className="sh-hub-course-row-text">
                <div className="sh-hub-course-name">OM 300</div>
                <div className="sh-hub-course-sub mono">
                  BUILT-IN · OM 300
                  {highlightId === "builtin" ? " · LAST OPENED" : ""}
                </div>
              </div>
              <span className="sh-hub-course-open mono">OPEN →</span>
            </button>

            {userCourses.map((c) => {
              const ec = ensureUserCourse(c);
              const nMod = ec.modules?.length ?? 0;
              const isRecent = highlightId === ec.id;
              return (
                <button
                  key={ec.id}
                  type="button"
                  className={`sh-hub-course-row ${isRecent ? "sh-hub-course-row--recent" : ""}`}
                  onClick={() => onOpenCourse(ec.id)}
                >
                  <div className="sh-hub-course-row-text">
                    <div className="sh-hub-course-name">{ec.name}</div>
                    <div className="sh-hub-course-sub mono">
                      {nMod} MODULES{isRecent ? " · LAST OPENED" : ""}
                    </div>
                  </div>
                  <span className="sh-hub-course-open mono">OPEN →</span>
                </button>
              );
            })}
          </div>
          {userCourses.length === 0 ? (
            <p className="sh-hub-empty-hint mono">NO CUSTOM COURSES YET</p>
          ) : null}
        </div>

        <div className="sh-hub-divider" />

        <div className="sh-hub-block">
          <div className="sh-hub-section-label">ADD COURSE</div>
          <div className="sh-hub-add-actions">
            <button type="button" className="sh-btn-ghost sh-btn-ghost-amber sh-hub-add-btn" onClick={() => setExpressOpen(true)}>
              + EXPRESS IMPORT
            </button>
            <button type="button" className="sh-btn-ghost sh-hub-add-btn" onClick={() => setManualOpen(true)}>
              + MANUAL SETUP
            </button>
          </div>
          {manualOpen ? (
            <div className="sh-hub-manual-wrap">
              <ManualCourseEntry
                onCreate={(name) => {
                  onManualCreate(name);
                  setManualOpen(false);
                }}
                onBack={() => setManualOpen(false)}
              />
            </div>
          ) : null}

          <div className="sh-hub-bb-section">
            <div className="sh-section-label" style={{ marginBottom: 10 }}>
              BLACKBOARD
            </div>
            <button className="sh-hub-bb-btn" onClick={handleOpenBlackboard}>
              <span className="sh-hub-bb-icon">⬡</span>
              <span className="sh-hub-bb-text">{bbStatus.loggedIn ? "OPEN BLACKBOARD" : "CONNECT BLACKBOARD"}</span>
              <span className="sh-hub-bb-status" style={{ color: bbStatus.loggedIn ? "var(--sh-green)" : "var(--sh-text-dim)" }}>
                {bbStatus.loggedIn ? "● CONNECTED" : "○ NOT CONNECTED"}
              </span>
            </button>
            {bbStatus.loggedIn ? (
              <button
                className="sh-hub-bb-disconnect"
                onClick={async () => {
                  await window.studyHub?.blackboard?.disconnect?.();
                  setBbStatus({ loggedIn: false, windowOpen: false });
                }}
              >
                DISCONNECT
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <ExpressImportModal open={expressOpen} onClose={() => setExpressOpen(false)} onExpressComplete={onExpressComplete} />
    </div>
  );
}
