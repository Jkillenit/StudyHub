/** "202640-MIS-430-001" → "MIS 430". Anything that doesn't look like a Blackboard code is returned as-is. */
export function shortCourse(name) {
  const s = String(name || "").trim();
  const m = s.match(/^(?:\d{4,6}[A-Z]{0,2}[-_ ]+)?([A-Z]{2,5})[-_ ]?(\d{3,4}[A-Z]?)(?:[-_ ]+\d{1,4})?\b/);
  return m ? `${m[1]} ${m[2]}` : s;
}

export function pctTone(p) {
  if (p == null) return "";
  return p >= 80 ? "good" : p >= 60 ? "mid" : "low";
}
