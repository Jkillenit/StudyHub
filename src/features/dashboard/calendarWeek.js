/** Calendar date helpers. Weeks run Monday–Sunday, all in local time. */

export function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Local midnight of the Monday on or before `d`. */
export function weekStart(d) {
  return addDays(d, -((d.getDay() + 6) % 7));
}

export function shiftWeek(start, delta) {
  return addDays(start, delta * 7);
}

export function weekDays(start) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Six Monday-first weeks starting on/before the 1st of `month`. */
export function monthGrid(month) {
  const start = weekStart(new Date(month.getFullYear(), month.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Query range for a list of visible days; `to` is exclusive. */
export function rangeFor(days) {
  return { from: days[0], to: addDays(days[days.length - 1], 1) };
}

export function groupByDay(items) {
  const map = new Map();
  for (const a of items) {
    if (!a.due_date) continue;
    const key = dayKey(new Date(a.due_date));
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  }
  for (const list of map.values()) list.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  return map;
}

/** Left-edge tone: magenta for exams, aqua for anything else due, dimmed when done. */
export function itemEdge(a) {
  if (a.completed) return "done";
  return a.kind === "exam" ? "exam" : "due";
}
