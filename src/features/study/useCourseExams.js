import { useCallback, useEffect, useState } from "react";
import { examForCard } from "../../study/sm2.js";
import { loadUpcomingExams } from "./examEstimate.js";

const RELOAD_EVENTS = ["studyhub-mirror-changed", "studyhub-bb-synced", "studyhub-exam-scope-changed"];

/**
 * A course's upcoming exams with their module scopes, and `examFor(card)`: the date of the nearest
 * exam covering that card, or null. Pass a null courseUuid for decks with no exams (OM 300).
 */
export function useCourseExams(courseUuid) {
  const [exams, setExams] = useState([]);

  useEffect(() => {
    if (!courseUuid) {
      setExams([]);
      return undefined;
    }
    let alive = true;
    const load = () =>
      void loadUpcomingExams(courseUuid).then((list) => {
        if (alive) setExams(list);
      });
    load();
    RELOAD_EVENTS.forEach((name) => window.addEventListener(name, load));
    return () => {
      alive = false;
      RELOAD_EVENTS.forEach((name) => window.removeEventListener(name, load));
    };
  }, [courseUuid]);

  const examFor = useCallback((card) => examForCard(card, exams)?.dueDate ?? null, [exams]);
  return { exams, examFor };
}
