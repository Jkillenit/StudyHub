import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { courseStore } from "../../db/courseStore.js";
import { openInBlackboard } from "../mirror/openInBlackboard.js";
import { PANELS, inSlot, lastRects, useWorkspace } from "../../nova/workspace.js";
import { publishToday } from "../../nova/director.js";
import { openCourseView } from "./courseView.js";
import { runTodayAction } from "./runAction.js";
import { briefingContext, buildBriefing } from "./briefing.js";
import { dueText } from "./todayView.js";
import { useTodayModel } from "./useTodayModel.js";
import { useArrival } from "./useArrival.js";
import { BriefingPanel } from "./components/BriefingPanel.jsx";
import { TonightList } from "./components/TonightList.jsx";
import { OverdueStrip } from "./components/OverdueStrip.jsx";
import { StandingGauges } from "./components/StandingGauges.jsx";
import { WeekStrip } from "./components/WeekStrip.jsx";
import { NovaDesk } from "./components/NovaDesk.jsx";

const MOVE_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Panels that changed slot glide from where they were (FLIP); panels coming off the desk fade in. */
function animateMoves() {
  if (!lastRects.size) return;
  const reduced = document.documentElement.dataset.motion === "reduced";
  for (const id of PANELS) {
    const el = document.querySelector(`[data-nova-anchor="panel.${id}"]`);
    const was = lastRects.get(id);
    if (!el || reduced) continue;
    const now = el.getBoundingClientRect();
    if (!was) {
      el.animate([{ opacity: 0, transform: "scale(0.94)" }, { opacity: 1, transform: "none" }], { duration: 360, easing: MOVE_EASE });
      continue;
    }
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(was.width - now.width) < 1) continue;
    const from = `translate(${dx}px, ${dy}px) scale(${was.width / now.width}, ${was.height / now.height})`;
    el.animate([{ transformOrigin: "top left", transform: from }, { transformOrigin: "top left", transform: "none" }], { duration: 420, easing: MOVE_EASE });
  }
  lastRects.clear();
}

export function TodayScreen({ refreshKey = 0, onOpenCourse, onNavigate }) {
  const { loaded, view } = useTodayModel(refreshKey);
  const { arriving } = useArrival(loaded);
  const { layout, before } = useWorkspace();

  const briefing = useMemo(() => (view ? buildBriefing(view, { now: new Date(), dueText }) : { segments: [], text: "" }), [view]);
  const briefingFacts = useMemo(() => (view ? briefingContext(view, { now: new Date(), dueText }) : null), [view]);
  useEffect(() => {
    if (briefingFacts) publishToday(briefingFacts);
  }, [briefingFacts]);

  const run = useCallback((action) => runTodayAction(action, onOpenCourse), [onOpenCourse]);

  const openOverdue = useCallback(
    (item) => {
      if (item.url) openInBlackboard(item.url);
      else onOpenCourse(item.courseUuid);
    },
    [onOpenCourse]
  );

  useLayoutEffect(animateMoves, [layout]);

  if (!loaded || !view) return <section className="sh-today2" aria-label="Full plan" aria-busy="true" />;

  const panels = {
    briefing: <BriefingPanel briefing={briefing} context={briefingFacts} arriving={arriving} canStart={view.tonight.length > 0} onStart={() => run(view.tonight[0]?.action)} index={1} />,
    tonight: <TonightList items={view.tonight} hasCourses={view.hasCourses} synced={view.synced} onRun={run} index={2} />,
    standing: (
      <StandingGauges
        standing={view.standing}
        arriving={arriving}
        onOpen={(courseUuid) => openCourseView(onOpenCourse, courseUuid, { tab: "grades" })}
        onMore={() => onNavigate?.("courses")}
        index={4}
      />
    ),
    week: <WeekStrip week={view.week} onCalendar={() => onNavigate?.("calendar")} index={5} />,
  };
  const slot = (name) => inSlot(layout, name).map((id) => <Fragment key={id}>{panels[id]}</Fragment>);
  const center = slot("center");
  const dock = slot("dock");

  return (
    <section className={`sh-today2${arriving ? " sh-today2--arriving" : ""}`} aria-label="Full plan">
      <div className="sh-today2-left">
        {slot("left")}
        <NovaDesk filed={inSlot(layout, "desk")} canPutBack={!!before} />
      </div>
      <div className="sh-today2-right">
        {center}
        <OverdueStrip items={view.overdue} onMarkSubmitted={(uuid) => void courseStore.setAssignmentCompleted(uuid, true)} onOpen={openOverdue} index={3} />
        {dock.length ? <div className="sh-today2-row">{dock}</div> : null}
        {!center.length && !dock.length ? <p className="sh-today2-empty">Everything's filed on Nova's desk.</p> : null}
      </div>
    </section>
  );
}
