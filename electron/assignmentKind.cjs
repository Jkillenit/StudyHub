const NOT_AN_EXAM = /\b(project|paper|essay|presentation|report|portfolio|reflection|survey)\b/;

/** Kind of a Blackboard gradebook column from its name: 'exam' | 'quiz' | 'assignment'. */
function assignmentKind(name) {
  const n = String(name || "").toLowerCase();
  if (/\bquiz(zes)?\b/.test(n)) return "quiz";
  if (/\b(exam|midterm|mid-term)s?\b/.test(n)) return "exam";
  if (/\btests?\b/.test(n) && !/\bpractice\b/.test(n)) return "exam";
  if (/\bfinal\b/.test(n) && !NOT_AN_EXAM.test(n)) return "exam";
  return "assignment";
}

module.exports = { assignmentKind };
