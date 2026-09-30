import { useCallback, useEffect, useState } from "react";
import { courseStore } from "../../db/courseStore.js";
import { dueLabel } from "../dashboard/dateLabels.js";
import { shortCourse } from "../dashboard/courseLabel.js";
import { KindTag } from "../dashboard/KindTag.jsx";
import { openInBlackboard } from "../mirror/openInBlackboard.js";
import { ITEM_TYPES, PRIORITY_CONFIG, rankToday } from "./priority.js";
import { openCourseView } from "./courseView.js";
import { NeedBadge } from "./NeedBadge.jsx";

const RELOAD_EVENTS = ["studyhub-mirror-changed", "studyhub-bb-synced", "studyhub-target-changed"];

function TypeTag({ item }) {
  if (item.type === ITEM_TYPES.EXAM_PREP) return <span className="sh-today-tag sh-today-tag--exam">EXAM PREP</span>;
  if (item.type === ITEM_TYPES.GRADE_RISK) return <span className="sh-today-tag sh-today-tag--risk">GRADE RISK</span>;
  return <KindTag kind={item.kind} />;
}

function EmptyState({ synced }) {
  if (!synced) {
    return (
      <div className="sh-rank-empty">
        <p className="sh-today-empty">Connect Blackboard and sync your courses. Study Hub will rank what matters here every day.</p>
        <button type="button" className="sh-btn-ghost sh-btn-xs" onClick={() => void window.studyHub?.blackboard?.open?.()}>
          CONNECT BLACKBOARD
        </button>
      </div>
    );
  }
  return (
    <p className="sh-today-empty">
      Nothing due in the next {PRIORITY_CONFIG.horizonDays} days and every course is on target. Good time to get ahead on flashcards.
    </p>
  );
}

export function RankedToday({ onOpenCourse, refreshKey = 0 }) {
  const [state, setState] = useState({ loaded: false, synced: false, items: [] });

  const load = useCallback(async () => {
    const data = await courseStore.loadTodayData();
    const items = rankToday(data).slice(0, PRIORITY_CONFIG.topN);
    setState({ loaded: true, synced: data.synced, items });
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const onChange = () => void load();
    RELOAD_EVENTS.forEach((name) => window.addEventListener(name, onChange));
    return () => RELOAD_EVENTS.forEach((name) => window.removeEventListener(name, onChange));
  }, [load]);

  const run = (action) => {
    if (action.type === "blackboard") openInBlackboard(action.url);
    else if (action.type === "review") openCourseView(onOpenCourse, action.courseUuid, { item: "qz-deck" });
    else if (action.type === "grades") openCourseView(onOpenCourse, action.courseUuid, { tab: "grades" });
    else onOpenCourse(action.courseUuid);
  };

  if (!state.loaded) return null;

  return (
    <div className="sh-today-card sh-rank" data-perch data-tour-id="today-ranked">
      <div className="sh-hub-section-label">TOP {PRIORITY_CONFIG.topN} TODAY</div>
      {state.items.length === 0 ? (
        <EmptyState synced={state.synced} />
      ) : (
        <ol className="sh-rank-list">
          {state.items.map((item, i) => (
            <li key={item.id} className="sh-rank-row">
              <span className="sh-rank-num">{String(i + 1).padStart(2, "0")}</span>
              <div className="sh-rank-main">
                <span className="sh-today-row-title sh-today-row-title--wrap" title={item.title}>
                  <TypeTag item={item} />
                  {item.title}
                </span>
                <span className="sh-today-row-sub">
                  {shortCourse(item.courseName)}
                  {item.dueDate ? (
                    <>
                      {" · "}
                      <span className={`sh-today-when${item.daysUntil < 0 ? " sh-today-when--overdue" : ""}`}>
                        {dueLabel(item.dueDate)}
                      </span>
                    </>
                  ) : null}
                </span>
                <span className="sh-rank-reason">{item.reason}</span>
              </div>
              <div className="sh-rank-side">
                <NeedBadge needed={item.needed} title="Score needed to hold your target grade" />
                <button type="button" className="sh-btn-ghost sh-btn-xs sh-rank-action" onClick={() => run(item.action)}>
                  {item.action.label} →
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
