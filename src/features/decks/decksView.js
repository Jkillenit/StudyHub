import { isMastered } from "../progress/deckBreakdown.js";
import { daysUntilExam } from "../../study/sm2.js";

const DEFAULT_SECONDS_PER_CARD = 30;

function nearestExamDays(list, today) {
  let best = null;
  for (const exam of list || []) {
    const days = daysUntilExam(exam.dueDate, today);
    if (days != null && days >= 0 && (best == null || days < best)) best = days;
  }
  return best;
}

const examRank = (days) => (days == null ? Infinity : days);

/**
 * Decks screen model. `courses` are { id, name, cards }, `dueByCourse` { [id]: count },
 * `exams` { [id]: [{ dueDate }] }. Groups: soonest exam first, then most due. The urgent course
 * (Review all due) has the most due cards; ties go to the soonest exam.
 */
export function buildDecksView({ courses, dueByCourse = {}, exams = {}, avgSecondsPerCard = null, today = new Date() }) {
  const groups = (courses || [])
    .filter((c) => c.cards?.length)
    .map((c) => {
      const total = c.cards.length;
      const due = dueByCourse[c.id] || 0;
      const examDays = nearestExamDays(exams[c.id], today);
      return {
        courseId: c.id,
        name: c.name,
        examLabel: examDays == null ? null : examDays === 0 ? "EXAM TODAY" : `EXAM IN ${examDays} D`,
        rows: [{ name: "Flashcards", due, total, mastery: c.cards.filter(isMastered).length / total, examDays }],
      };
    });

  const due = (g) => g.rows[0].due;
  const days = (g) => examRank(g.rows[0].examDays);
  groups.sort((a, b) => days(a) - days(b) || due(b) - due(a));

  const totalDue = groups.reduce((sum, g) => sum + due(g), 0);
  const urgent = [...groups].sort((a, b) => due(b) - due(a) || days(a) - days(b))[0];
  return {
    totalDue,
    minutes: Math.ceil((totalDue * (avgSecondsPerCard || DEFAULT_SECONDS_PER_CARD)) / 60),
    urgentCourseId: totalDue > 0 ? urgent.courseId : null,
    groups,
  };
}
