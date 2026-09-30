/** Same rule as src/features/dashboard/courseLabel.js (kept in sync by courseName.test.js). */
function shortCourse(name) {
  const s = String(name || "").trim();
  const m = s.match(/^(?:\d{4,6}[A-Z]{0,2}[-_ ]+)?([A-Z]{2,5})[-_ ]?(\d{3,4}[A-Z]?)(?:[-_ ]+\d{1,4})?\b/);
  return m ? `${m[1]} ${m[2]}` : s;
}

module.exports = { shortCourse };
