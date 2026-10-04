import { daysFromToday } from "../dashboard/dateLabels.js";
import { daysUntilExam } from "../../study/sm2.js";

/** Sidebar badge counts for a course: unread announcements and incomplete work due within 7 days. */
export function mirrorBadges(announcements, assignments, now = new Date()) {
  const unread = (announcements || []).filter((a) => !a.read).length;
  const dueSoon = (assignments || []).filter((a) => {
    if (a.completed || !a.due_date) return false;
    const d = daysFromToday(a.due_date, now);
    return d !== null && d >= 0 && d < 7;
  }).length;
  return { unread, dueSoon };
}

/** A course's open exams from today on, soonest first: { uuid, title, dueDate, moduleIds, scopeSource }. */
export function upcomingExams(rows, scopes) {
  return (Array.isArray(rows) ? rows : [])
    .filter((a) => a.kind === "exam" && !a.completed && (daysUntilExam(a.due_date) ?? -1) >= 0)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .map((a) => ({
      uuid: a.uuid,
      title: a.title,
      dueDate: a.due_date,
      moduleIds: scopes?.[a.uuid]?.moduleIds || [],
      scopeSource: scopes?.[a.uuid]?.source || "course",
    }));
}
