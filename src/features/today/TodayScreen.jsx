import { useCallback, useMemo } from "react";
import { courseStore } from "../../db/courseStore.js";
import { openInBlackboard } from "../mirror/openInBlackboard.js";
import { openCourseView } from "./courseView.js";
import { buildBriefing } from "./briefing.js";
import { dueText } from "./todayView.js";
import { useTodayModel } from "./useTodayModel.js";
import { useArrival } from "./useArrival.js";
import { CompanionStage } from "./components/CompanionStage.jsx";
import { BriefingPanel } from "./components/BriefingPanel.jsx";
import { TonightList } from "./components/TonightList.jsx";
import { OverdueStrip } from "./components/OverdueStrip.jsx";
import { StandingGauges } from "./components/StandingGauges.jsx";
import { WeekStrip } from "./components/WeekStrip.jsx";

export function TodayScreen({ refreshKey = 0, onOpenCourse, onNavigate }) {
  const { loaded, view } = useTodayModel(refreshKey);
  const { arriving } = useArrival(loaded);

  const briefing = useMemo(() => (view ? buildBriefing(view, { now: new Date(), dueText }) : { segments: [], text: "" }), [view]);

  const run = useCallback(
    (action) => {
      if (!action) return;
      if (action.type === "blackboard") openInBlackboard(action.url);
      else if (action.type === "review") openCourseView(onOpenCourse, action.courseUuid, { item: "qz-deck" });
      else if (action.type === "grades") openCourseView(onOpenCourse, action.courseUuid, { tab: "grades" });
      else onOpenCourse(action.courseUuid);
    },
    [onOpenCourse]
  );

  const openOverdue = useCallback(
    (item) => {
      if (item.url) openInBlackboard(item.url);
      else onOpenCourse(item.courseUuid);
    },
    [onOpenCourse]
  );

  if (!loaded || !view) return <section className="sh-today2" aria-label="Today" aria-busy="true" />;

  return (
    <section className={`sh-today2${arriving ? " sh-today2--arriving" : ""}`} aria-label="Today" data-tour-id="today-dashboard">
      <div className="sh-today2-left">
        <CompanionStage index={0} />
        <BriefingPanel briefing={briefing} arriving={arriving} canStart={view.tonight.length > 0} onStart={() => run(view.tonight[0]?.action)} index={1} />
      </div>
      <div className="sh-today2-right">
        <TonightList items={view.tonight} hasCourses={view.hasCourses} synced={view.synced} onRun={run} index={2} />
        <OverdueStrip items={view.overdue} onMarkSubmitted={(uuid) => void courseStore.setAssignmentCompleted(uuid, true)} onOpen={openOverdue} index={3} />
        <div className="sh-today2-row">
          <StandingGauges
            standing={view.standing}
            arriving={arriving}
            onOpen={(courseUuid) => openCourseView(onOpenCourse, courseUuid, { tab: "grades" })}
            onMore={() => onNavigate?.("courses")}
            index={4}
          />
          <WeekStrip week={view.week} onCalendar={() => onNavigate?.("calendar")} index={5} />
        </div>
      </div>
    </section>
  );
}
