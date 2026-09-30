/**
 * Blocked days: dates the student marked unavailable (drill weekend, a double shift). Stored in
 * Nova's memory as `blocked:YYYY-MM-DD`; the priority engine treats them as no working time.
 */
import { ITEM_TYPES } from "./priority.js";

export const BLOCK_REASONS = Object.freeze([
  { id: "drill", label: "Drill" },
  { id: "work", label: "Work" },
  { id: "travel", label: "Travel" },
  { id: "busy", label: "Busy" },
]);

export function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

/** Blocked day keys from memory rows / a memory map, today onward, sorted. */
export function blockedFromMemory(memory, now = new Date()) {
  const today = dayKey(now);
  return Object.entries(memory || {})
    .filter(([key, m]) => key.startsWith("blocked:") && !m.muted && m.value)
    .map(([key]) => key.slice(8))
    .filter((day) => day >= today)
    .sort();
}

/** Game day keys (`gameday:YYYY-MM-DD`), today onward. A tag only: ranking ignores them. */
export function gameDaysFromMemory(memory, now = new Date()) {
  const today = dayKey(now);
  return Object.entries(memory || {})
    .filter(([key, m]) => key.startsWith("gameday:") && !m.muted && m.value)
    .map(([key]) => key.slice(8))
    .filter((day) => day >= today)
    .sort();
}

/** "Saturday", "Saturday and Sunday", "Friday, Saturday and Sunday". */
export function blockedWhen(keys) {
  const names = keys.map((k) => fromKey(k).toLocaleDateString([], { weekday: "long" }));
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What moved because of blocked days: { when, title } for the top Tonight-eligible item that
 * blocked days pushed up, or null. `ranked` is rankToday() output with blockedDays applied.
 */
export function replanNote(ranked, blockedKeys, now = new Date(), span = 7) {
  if (!blockedKeys?.length) return null;
  const limit = dayKey(new Date(new Date(now).getTime() + span * 86400000));
  const soon = blockedKeys.filter((k) => k < limit);
  if (!soon.length) return null;
  const moved = (ranked || []).find((it) => it.type !== ITEM_TYPES.GRADE_RISK && it.blockedBefore > 0 && it.daysUntil >= 0);
  if (!moved) return null;
  return { when: blockedWhen(soon.slice(0, 3)), title: moved.title };
}
