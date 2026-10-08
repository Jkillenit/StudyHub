import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { publishToday } from "../../nova/director.js";
import { fieldEmit, novaAttractor } from "../../shell/fieldEvents.js";
import { useReducedMotion } from "../../shell/motion.js";
import { localDateString } from "../../study/sm2.js";
import { NovaBar } from "../../shell/NovaBar.jsx";
import { usePack } from "../../shell/pack.js";
import { RoundTally } from "../../shell/RoundTally.jsx";
import { ITEM_TYPES } from "./priority.js";
import { runTodayAction } from "./runAction.js";
import { briefingContext, homeLine } from "./briefing.js";
import { dueEmphasis, dueShort, hoursUntil } from "./dueEmphasis.js";
import { goneRows, withLeaving } from "./leavingRows.js";
import { syncedAgo } from "./syncedAgo.js";
import { dueText } from "./todayView.js";
import { ARRIVAL_MS, arrivalDue, useArrival } from "./useArrival.js";
import { useTodayModel } from "./useTodayModel.js";

const COUNT_WORDS = ["Nothing", "One thing", "Two things", "Three things"];
/** How long a finished row's slot takes to close (matches the sh-home-leave animation). */
const LEAVE_MS = 250;
/** The day the rows last typed in; the arrival day is only recorded when Nova greets, so with her off this keeps it to once. */
let typedInDay = null;

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
  const rows = [...e.currentTarget.querySelectorAll("li:not([data-leaving]) > .sh-home-row")];
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
  const reduced = useReducedMotion();

  /* The day's arrival types the rows in as they first appear, rather than once Nova is ready, so they never show and then re-enter. */
  const [typeIn, setTypeIn] = useState(() => !reduced && arrivalDue() && typedInDay !== localDateString());
  const hasRows = !!view?.hasCourses && view.tonight.length > 0;
  useEffect(() => {
    if (!typeIn || !hasRows) return undefined;
    typedInDay = localDateString();
    const t = window.setTimeout(() => setTypeIn(false), ARRIVAL_MS);
    return () => window.clearTimeout(t);
  }, [typeIn, hasRows]);

  /* A shown row that leaves closes its slot; one whose item is done (submitted, scored) flows into Nova on the way. */
  const shownRef = useRef([]);
  const flowedRef = useRef(new Set());
  const listRef = useRef(null);
  const [leaving, setLeaving] = useState([]);
  useLayoutEffect(() => {
    if (!view) return;
    const next = view.hasCourses ? view.tonight : [];
    const gone = goneRows(shownRef.current, next.map((t) => t.id), view.finished);
    shownRef.current = next.slice(0, 3);
    if (!gone.length) return;
    const done = gone.find((g) => g.done);
    if (done) window.dispatchEvent(new CustomEvent("studyhub-companion-task-done", { detail: { title: done.item.title } }));
    if (!reduced) setLeaving((l) => [...l, ...gone]);
  }, [view, reduced]);
  useLayoutEffect(() => {
    for (const g of leaving) {
      if (!g.done || flowedRef.current.has(g.item.id)) continue;
      flowedRef.current.add(g.item.id);
      const el = listRef.current?.querySelector(`li[data-leaving="${CSS.escape(g.item.id)}"]`);
      const to = novaAttractor();
      if (el && to) fieldEmit(el.getBoundingClientRect(), to, 60);
    }
  }, [leaving]);
  useEffect(() => {
    if (!leaving.length) return undefined;
    const t = window.setTimeout(() => {
      flowedRef.current.clear();
      setLeaving([]);
    }, LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [leaving]);

  const now = new Date();
  const meta = [now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }), view ? syncedAgo(view.syncedAt) || "Blackboard not connected" : null]
    .filter(Boolean)
    .join(" · ");
  const rows = view?.hasCourses ? view.tonight.slice(0, 3) : [];

  return (
    <section className="sh-home" aria-label="Today" aria-busy={!loaded || undefined} data-tour-id="today-dashboard">
      <div className="sh-home-strip" data-dissolve>
        <RoundTally variant="strip" />
      </div>
      {pack === "zombies" ? <RoundTally variant="corner" /> : null}
      <div className="sh-home-col">
        <p className="sh-home-meta" data-dissolve>{meta}</p>
        {view ? <h1 className="sh-home-greeting" data-dissolve>{greeting(view)}</h1> : null}
        {view && !novaOn ? (
          <p className="sh-home-line" data-dissolve>
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
        {rows.length || leaving.length ? (
          <ol ref={listRef} className={`sh-home-list${typeIn ? " sh-home-list--arrive" : ""}`} onKeyDown={onRowKey}>
            {withLeaving(rows, leaving).map(({ item, leaving: gone, index }) => {
              const i = gone ? -1 : index;
              const reason = (item.reasonParts || []).slice(1).join(" · ");
              const due = dueShort(item.dueDate, item.daysUntil, item.type === ITEM_TYPES.EXAM_PREP);
              return (
                <li
                  key={item.id}
                  data-leaving={gone ? item.id : undefined}
                  data-dissolve={i !== 0 || undefined}
                  inert={gone ? "" : undefined}
                  style={{ "--i": index }}
                >
                  <button
                    type="button"
                    className="sh-home-row"
                    data-perch={!gone || undefined}
                    data-nova-anchor={gone ? undefined : `home.row.${i + 1}`}
                    onClick={() => runTodayAction(item.action, onOpenCourse)}
                  >
                    <span className="sh-home-row-main">
                      <span className="sh-home-row-title" title={item.title}>
                        {item.title}
                      </span>
                      {item.courseLabel && !item.title.includes(item.courseLabel) ? <span className="sh-home-row-tag">{item.courseLabel}</span> : null}
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
          <div className="sh-home-empty" data-dissolve>
            <button type="button" className="sh-btn-outline" onClick={() => onNavigate?.("courses")}>
              Connect Blackboard
            </button>
          </div>
        ) : null}
        {view ? (
          <button type="button" className="sh-home-link" data-dissolve onClick={() => onNavigate?.("plan")}>
            Full plan
          </button>
        ) : null}
      </div>
      <div className="sh-home-dock">
        <div className="sh-home-seat" data-nova-home aria-hidden="true">
          <div className="sh-home-seat-floor" data-nova-floor />
        </div>
        <div data-perch data-nova-anchor="home.composer" data-dissolve>
          <NovaBar courses={courses} placeholder="Ask Nova anything, or type /" />
        </div>
      </div>
    </section>
  );
}
