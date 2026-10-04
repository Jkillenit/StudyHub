import { useCallback, useEffect, useState } from "react";
import { courseStore } from "../../db/courseStore.js";
import { examForCard } from "../../study/sm2.js";
import { mirrorBadges, upcomingExams } from "./courseMirror.js";

const EMPTY = { badges: { unread: 0, dueSoon: 0 }, exams: [] };

/**
 * One load of a course's announcements, assignments and exam scopes: sidebar badges, upcoming exams
 * and `examFor(card)` (the date of the nearest exam covering that card, or null).
 */
export function useCourseMirror(courseUuid) {
  const [state, setState] = useState(EMPTY);

  useEffect(() => {
    if (!courseUuid) {
      setState(EMPTY);
      return undefined;
    }
    let alive = true;
    const load = async () => {
      const [ann, asg, scopes] = await Promise.all([
        courseStore.getAnnouncements(courseUuid),
        courseStore.getAssignments(courseUuid),
        courseStore.getExamScopes(courseUuid),
      ]);
      if (alive) setState({ badges: mirrorBadges(ann, asg), exams: upcomingExams(asg, scopes) });
    };
    const onCourseEvent = (e) => {
      if (!e.detail?.courseUuid || e.detail.courseUuid === courseUuid) void load();
    };
    const onScope = () => void load();
    void load();
    window.addEventListener("studyhub-bb-synced", onCourseEvent);
    window.addEventListener("studyhub-mirror-changed", onCourseEvent);
    window.addEventListener("studyhub-exam-scope-changed", onScope);
    return () => {
      alive = false;
      window.removeEventListener("studyhub-bb-synced", onCourseEvent);
      window.removeEventListener("studyhub-mirror-changed", onCourseEvent);
      window.removeEventListener("studyhub-exam-scope-changed", onScope);
    };
  }, [courseUuid]);

  const { exams } = state;
  const examFor = useCallback((card) => examForCard(card, exams)?.dueDate ?? null, [exams]);
  return { badges: state.badges, exams, examFor };
}
