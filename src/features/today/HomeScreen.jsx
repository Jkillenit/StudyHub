import { useEffect, useMemo, useState } from "react";
import { publishToday } from "../../nova/director.js";
import { NovaBar } from "../../shell/NovaBar.jsx";
import { usePack } from "../../shell/pack.js";
import { RoundTally } from "../../shell/RoundTally.jsx";
import { ITEM_TYPES } from "./priority.js";
import { runTodayAction } from "./runAction.js";
import { briefingContext, homeLine } from "./briefing.js";
import { dueEmphasis, hoursUntil } from "./dueEmphasis.js";
import { syncedAgo } from "./syncedAgo.js";
import { dueText } from "./todayView.js";
import { useArrival } from "./useArrival.js";
import { useTodayModel } from "./useTodayModel.js";

const COUNT_WORDS = ["Nothing", "One thing", "Two things", "Three things"];

/** True while Nova is on screen (html[data-nova], broadcast by the companion layer). */
function useNovaOn() {
  const [on, setOn] = useState(() => document.documentElement.dataset.nova === "on");
  useEffect(() => {
    const onState = (e) => setOn(!!e.detail?.visible);
    window.addEventListener("studyhub-companion-state", onState);
    return () => window.removeEventListener("studyhub-companion-state", onState);
  }, []);
  return on;
}

function greeting(view) {
  if (!view.hasCourses) return "Connect Blackboard to get started.";
  const n = Math.min(view.tonight.length, 3);
  return n ? `${COUNT_WORDS[n]} tonight.` : "Nothing due tonight.";
}

/** Arrow keys move between the rows. */
function onRowKey(e) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const rows = [...e.currentTarget.querySelectorAll(".sh-home-row")];
  const i = rows.indexOf(document.activeElement);
  const next = rows[e.key === "ArrowDown" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1)];
  if (next) {
    e.preventDefault();
    next.focus();
  }
}

/** The Pure home: a meta line, tonight's top three, and the message box with Nova seated on it. */
export function HomeScreen({ refreshKey = 0, courses, onOpenCourse, onNavigate }) {
  const { loaded, view } = useTodayModel(refreshKey);
  const pack = usePack();

  const line = useMemo(() => (view ? homeLine(view, { now: new Date(), dueText }) : []), [view, pack]);
  const briefingFacts = useMemo(() => (view ? briefingContext(view, { now: new Date(), dueText }) : null), [view]);
  useEffect(() => {
    if (briefingFacts) publishToday(briefingFacts);
  }, [briefingFacts]);

  const novaOn = useNovaOn();
  const spoken = useMemo(() => line.map((s) => (typeof s === "string" ? s : s.num)).join(""), [line]);
  useArrival(!!view && novaOn, spoken);

  const now = new Date();
  const meta = [now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }), view ? syncedAgo(view.syncedAt) || "Blackboard not connected" : null]
    .filter(Boolean)
    .join(" · ");
  const rows = view?.hasCourses ? view.tonight.slice(0, 3) : [];

  return (
    <section className="sh-home" aria-label="Today" aria-busy={!loaded || undefined} data-tour-id="today-dashboard">
      <div className="sh-home-strip">
        <RoundTally variant="strip" />
      </div>
      {pack === "zombies" ? <RoundTally variant="corner" /> : null}
      <div className="sh-home-col">
        <p className="sh-home-meta">{meta}</p>
        {view ? <h1 className="sh-home-greeting">{greeting(view)}</h1> : null}
        {view && !novaOn ? (
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
        ) : null}
        {rows.length ? (
          <ol className="sh-home-list" onKeyDown={onRowKey}>
            {rows.map((item, i) => {
              const reason = (item.reasonParts || []).slice(1).join(" · ");
              const due = dueText(item.dueDate, item.daysUntil, item.type === ITEM_TYPES.EXAM_PREP).replace(/^Due /, "");
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`sh-home-row${i === 0 ? " sh-home-row--top" : ""}`}
                    data-perch
                    data-nova-anchor={`home.row.${i + 1}`}
                    onClick={() => runTodayAction(item.action, onOpenCourse)}
                  >
                    <span className="sh-home-row-main">
                      <span className="sh-home-row-title" title={item.title}>
                        {item.title}
                      </span>
                      {item.courseLabel ? <span className="sh-home-row-tag">{item.courseLabel}</span> : null}
                      <span className={`sh-home-row-due mono sh-due--${dueEmphasis(hoursUntil(item.dueDate, now))}`}>{due}</span>
                    </span>
                    {reason || (i === 0 && item.action?.label) ? (
                      <span className="sh-home-row-more">
                        <span className="sh-home-row-reason">{reason}</span>
                        {i === 0 && item.action?.label ? (
                          <span className="sh-home-row-action">
                            {item.action.label} <kbd>Enter</kbd>
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}
        {view && !view.hasCourses ? (
          <div className="sh-home-empty">
            <button type="button" className="sh-btn-outline" onClick={() => onNavigate?.("courses")}>
              Connect Blackboard
            </button>
          </div>
        ) : null}
        {view ? (
          <button type="button" className="sh-home-link" onClick={() => onNavigate?.("plan")}>
            Full plan
          </button>
        ) : null}
      </div>
      <div className="sh-home-dock">
        <div className="sh-home-seat" data-nova-home aria-hidden="true">
          <div className="sh-home-seat-floor" data-nova-floor />
        </div>
        <div data-perch data-nova-anchor="home.composer">
          <NovaBar courses={courses} placeholder="Ask Nova anything, or type /" />
        </div>
      </div>
    </section>
  );
}
