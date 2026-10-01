import { useEffect, useState } from "react";
import { loadJson } from "../lib/storage.js";
import { HUB_KEYS, ensureUserCourse } from "./userCourseModel.js";
import { ManualCourseEntry } from "../welcome/ManualCourseEntry.jsx";
import { ExpressImportModal } from "../welcome/ExpressImportModal.jsx";
import { TodayScreen } from "../features/today/TodayScreen.jsx";
import { CalendarView } from "../features/dashboard/CalendarView.jsx";
import { CourseFeeds } from "../features/dashboard/CourseFeeds.jsx";
import { BlackboardSyncPanel } from "../features/blackboard/BlackboardSyncPanel.jsx";
import { shortCourse } from "../features/dashboard/courseLabel.js";

function CoursesView({ userCourses, onOpenCourse, onManualCreate, refreshKey, onSynced, onExpress }) {
  const [manualOpen, setManualOpen] = useState(false);
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
    window.addEventListener("focus", checkStatus);
    return () => window.removeEventListener("focus", checkStatus);
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
    <div className="sh-courses-page">
      <div className="sh-courses-main">
        <div className="sh-panel sh-hub-block" data-tour-id="hub-courses">
          <h2 className="sh-hud-title">YOUR COURSES</h2>
          <div className="sh-hub-list" data-perch>
            <button
              type="button"
              className={`sh-hub-course-row ${highlightId === "builtin" ? "sh-hub-course-row--recent" : ""}`}
              onClick={() => onOpenCourse("builtin")}
            >
              <div className="sh-hub-course-row-text">
                <div className="sh-hub-course-name">OM 300</div>
                <div className="sh-hub-course-sub mono">
                  Built-in · OM 300
                  {highlightId === "builtin" ? " · last opened" : ""}
                </div>
              </div>
              <span className="sh-hub-course-open">Open →</span>
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
                    <div className="sh-hub-course-name" title={ec.name}>
                      {ec.name}
                    </div>
                    <div className="sh-hub-course-sub mono">
                      {ec.courseCode && shortCourse(ec.courseCode) !== ec.name ? `${shortCourse(ec.courseCode)} · ` : ""}
                      {nMod} modules{isRecent ? " · last opened" : ""}
                    </div>
                  </div>
                  <span className="sh-hub-course-open">Open →</span>
                </button>
              );
            })}
          </div>
          {userCourses.length === 0 ? <p className="sh-hub-empty-hint">No custom courses yet.</p> : null}
        </div>

        <div className="sh-panel sh-hub-block">
          <h2 className="sh-hud-title">ADD COURSE</h2>
          <div className="sh-hub-add-actions" data-tour-id="hub-add-course">
            <button type="button" className="sh-btn-outline" onClick={onExpress}>
              + Express import
            </button>
            <button type="button" className="sh-btn-outline" onClick={() => setManualOpen(true)}>
              + Manual setup
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
        </div>

        <div className="sh-panel sh-hub-block sh-hub-bb-section" data-tour-id="hub-blackboard">
          <h2 className="sh-hud-title">BLACKBOARD</h2>
          <button className="sh-hub-bb-btn" onClick={handleOpenBlackboard}>
            <span className="sh-hub-bb-icon">⬡</span>
            <span className="sh-hub-bb-text">{bbStatus.loggedIn ? "Open Blackboard" : "Connect Blackboard"}</span>
            <span className={`sh-hub-bb-status${bbStatus.loggedIn ? " sh-hub-bb-status--on" : ""}`}>
              {bbStatus.loggedIn ? "● Connected" : "○ Not connected"}
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
              Disconnect
            </button>
          ) : null}
          {bbStatus.loggedIn ? <BlackboardSyncPanel userCourses={userCourses} onSynced={onSynced} /> : null}
        </div>
      </div>
      <aside className="sh-courses-side">
        <CourseFeeds refreshKey={refreshKey} onOpenCourse={onOpenCourse} userCourses={userCourses} />
      </aside>
    </div>
  );
}

export function HubScreen({ view = "today", onNavigate, userCourses, onOpenCourse, onManualCreate, onExpressComplete }) {
  const [expressOpen, setExpressOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="sh-hub-root">
      {view === "today" || view === "plan" ? <TodayScreen refreshKey={refreshKey} onOpenCourse={onOpenCourse} onNavigate={onNavigate} /> : null}
      {view === "calendar" ? (
        <div className="sh-page">
          <CalendarView userCourses={userCourses} />
        </div>
      ) : null}
      {view === "courses" ? (
        <CoursesView
          userCourses={userCourses}
          onOpenCourse={onOpenCourse}
          onManualCreate={onManualCreate}
          refreshKey={refreshKey}
          onSynced={() => setRefreshKey((k) => k + 1)}
          onExpress={() => setExpressOpen(true)}
        />
      ) : null}
      <ExpressImportModal open={expressOpen} onClose={() => setExpressOpen(false)} onExpressComplete={onExpressComplete} />
    </div>
  );
}
