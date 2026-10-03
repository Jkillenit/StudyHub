import { useEffect, useMemo } from "react";
import { publishToday } from "../../nova/director.js";
import { NovaBar } from "../../shell/NovaBar.jsx";
import { usePack } from "../../shell/pack.js";
import { RoundTally } from "../../shell/RoundTally.jsx";
import { ITEM_TYPES } from "./priority.js";
import { runTodayAction } from "./runAction.js";
import { briefingContext, homeLine } from "./briefing.js";
import { syncedAgo } from "./syncedAgo.js";
import { dueText } from "./todayView.js";
import { useTodayModel } from "./useTodayModel.js";

const Hex = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M12 2l8 5v10l-8 5-8-5V7z" />
  </svg>
);

function cardEdge(item, i) {
  if (i === 0) return " sh-home-card--first";
  if (item.daysUntil === 0) return " sh-home-card--today";
  return "";
}

/** The Pure home: one line, the message box, and tonight's top three. */
export function HomeScreen({ refreshKey = 0, courses, onOpenCourse, onNavigate }) {
  const { loaded, view } = useTodayModel(refreshKey);
  const pack = usePack();

  const line = useMemo(() => (view ? homeLine(view, { now: new Date(), dueText }) : []), [view, pack]);
  const briefingFacts = useMemo(() => (view ? briefingContext(view, { now: new Date(), dueText }) : null), [view]);
  useEffect(() => {
    if (briefingFacts) publishToday(briefingFacts);
  }, [briefingFacts]);

  const synced = view ? syncedAgo(view.syncedAt) : null;

  return (
    <section className="sh-home" aria-label="Today" aria-busy={!loaded || undefined} data-tour-id="today-dashboard">
      <div className="sh-home-strip">
        <RoundTally variant="strip" />
      </div>
      {pack === "zombies" ? <RoundTally variant="corner" /> : null}
      <div className="sh-home-col">
        <h1 className="sh-home-mark">
          <Hex />
          NOVA
        </h1>
        {view ? (
          <>
            <p className="sh-home-line">
              {line.map((s, i) =>
                typeof s === "string" ? (
                  <span key={i}>{s}</span>
                ) : (
                  <span key={i} className="sh-home-num">
                    {s.num}
                  </span>
                )
              )}
            </p>
            <p className="sh-home-sync">
              <span className="sh-home-sync-dot" aria-hidden />
              {synced || "Blackboard not connected"}
            </p>
          </>
        ) : null}
        <NovaBar courses={courses} />
        {view && !view.hasCourses ? (
          <div className="sh-home-empty">
            <button type="button" className="sh-btn-outline" onClick={() => onNavigate?.("courses")}>
              Connect Blackboard
            </button>
          </div>
        ) : null}
        {view?.hasCourses && view.tonight.length ? (
          <div className="sh-home-cards">
            {view.tonight.slice(0, 3).map((item, i) => (
              <button key={item.id} type="button" className={`sh-home-card${cardEdge(item, i)}`} onClick={() => runTodayAction(item.action, onOpenCourse)}>
                <span className="sh-home-card-title" title={item.title}>
                  {item.title}
                </span>
                <span className="sh-home-card-meta">
                  {[item.courseLabel, dueText(item.dueDate, item.daysUntil, item.type === ITEM_TYPES.EXAM_PREP)].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {view ? (
          <div className="sh-home-more">
            <button type="button" className="sh-home-link" onClick={() => onNavigate?.("plan")}>
              Full plan →
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
