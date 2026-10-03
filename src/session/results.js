import { masteryPercent } from "../study/sm2.js";

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/** Mastery (sm2 masteryPercent) per topic before and after the session, biggest gain first. */
export function masteryDeltas(before, after, topicOf) {
  const group = (cards) => {
    const m = new Map();
    for (const c of cards || []) {
      const t = topicOf(c);
      if (!t) continue;
      if (!m.has(t)) m.set(t, []);
      m.get(t).push(c);
    }
    return m;
  };
  const b = group(before);
  const a = group(after);
  return [...a.keys()]
    .map((topic) => {
      const was = masteryPercent(b.get(topic) || []);
      const now = masteryPercent(a.get(topic));
      return { topic, before: was, after: now, delta: now - was };
    })
    .sort((x, y) => y.delta - x.delta);
}

export function resultSummary({ wentDown, downCount, comeBack }) {
  const shields = !wentDown ? "Shields held the whole way." : downCount === 1 ? "Shields went down once." : `Shields went down ${downCount} times.`;
  if (!comeBack) return shields;
  const n = comeBack < WORDS.length ? WORDS[comeBack] : String(comeBack);
  return `${shields} ${n} ${comeBack === 1 ? "card comes" : "cards come"} back tomorrow.`;
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
