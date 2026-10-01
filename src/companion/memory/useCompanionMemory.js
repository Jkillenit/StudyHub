import { useCallback, useEffect, useMemo, useRef } from "react";
import { courseStore } from "../../db/courseStore.js";
import { daysUntil, rankToday } from "../../features/today/priority.js";
import { blockedFromMemory, dayKey, replanNote } from "../../features/today/blocked.js";
import { dueText } from "../../features/today/todayView.js";
import { deriveMemory, known, memoryMap } from "./derive.js";
import { LINE_REPEAT_MS, pickLine, pickOpener } from "./lines.js";

const REFRESH_EVENTS = ["studyhub-session-logged", "studyhub-bb-synced", "studyhub-mirror-changed", "studyhub-target-changed"];
const REFRESH_DEBOUNCE_MS = 1500;
const SEEN_EVERY_MS = 10 * 60 * 1000;
const DAY_MS = 86400000;
/** Away this long is an episode she'll bring up later. */
const LONG_ABSENCE_DAYS = 7;

/** { due, next, when } for the week ahead, from the same snapshot Today uses. */
function catchUpFrom(today, now) {
  const open = [];
  for (const c of today?.courses || []) {
    for (const a of c.assignments || []) {
      if (a.completed || a.score != null) continue;
      const days = daysUntil(a.dueDate, now.toISOString());
      if (days != null && days >= 0 && days < 7) open.push({ a, days });
    }
  }
  if (!open.length) return null;
  open.sort((x, y) => String(x.a.dueDate).localeCompare(String(y.a.dueDate)));
  const first = open[0];
  const when = dueText(first.a.dueDate, first.days, first.a.kind === "exam").replace(/^(Due|Exam) /, "");
  return { due: open.length, next: first.a.title, when };
}

/**
 * Nova's memory: derives facts from local study data, keeps them current, and picks what she
 * says about the student. Everything stays in local SQLite.
 */
export function useCompanionMemory({ enabled, onNews }) {
  const memoryRef = useRef({});
  const todayRef = useRef(null);
  const absentRef = useRef(0);
  const readyRef = useRef(null);
  const onNewsRef = useRef(onNews);
  onNewsRef.current = onNews;

  const refresh = useCallback(async () => {
    const rows = await courseStore.companionMemory();
    const memory = memoryMap(rows);
    const since = known(memory, "_since");
    const [facts, today] = await Promise.all([courseStore.companionStudyFacts(since), courseStore.loadTodayData()]);
    todayRef.current = today;
    const now = new Date();
    const { entries, news } = deriveMemory({ facts, today, memory, now });
    const stale = Object.keys(memory)
      .filter((k) => (k.startsWith("blocked:") || k.startsWith("gameday:")) && k.slice(8) < dayKey(now) && memory[k].value)
      .map((key) => ({ key, value: null, source: "told" }));
    await courseStore.companionRemember([...entries, ...stale]);
    const next = { ...memory };
    for (const e of [...entries, ...stale]) next[e.key] = { ...(next[e.key] || {}), value: e.value, muted: false };
    memoryRef.current = next;
    if (news.length) onNewsRef.current?.(news);
    return next;
  }, []);

  /* First load: how long they were away, then mark this visit. */
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    readyRef.current = (async () => {
      const rows = await courseStore.companionMemory();
      const mem = memoryMap(rows);
      const lastSeen = known(mem, "last_seen");
      const away = lastSeen ? (Date.now() - Date.parse(lastSeen)) / DAY_MS : 0;
      absentRef.current = Number.isFinite(away) ? Math.floor(away) : 0;
      const writes = [{ key: "last_seen", value: new Date().toISOString(), source: "observed" }];
      const longest = mem["episode:long_absence"];
      if (absentRef.current >= LONG_ABSENCE_DAYS && !longest?.muted && absentRef.current > (longest?.value?.days || 0)) {
        writes.push({ key: "episode:long_absence", value: { days: absentRef.current, at: new Date().toISOString(), refs: 0, lastRef: null }, source: "observed" });
      }
      await courseStore.companionRemember(writes);
      if (alive) await refresh();
    })().catch(() => {});
    const seen = window.setInterval(() => {
      void courseStore.companionRemember([{ key: "last_seen", value: new Date().toISOString(), source: "observed" }]);
    }, SEEN_EVERY_MS);
    return () => {
      alive = false;
      window.clearInterval(seen);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    let t = 0;
    const onChange = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => void refresh().catch(() => {}), REFRESH_DEBOUNCE_MS);
    };
    const onMemory = () => {
      void courseStore.companionMemory().then((rows) => {
        memoryRef.current = memoryMap(rows);
      });
    };
    REFRESH_EVENTS.forEach((n) => window.addEventListener(n, onChange));
    window.addEventListener("studyhub-companion-memory-changed", onMemory);
    return () => {
      window.clearTimeout(t);
      REFRESH_EVENTS.forEach((n) => window.removeEventListener(n, onChange));
      window.removeEventListener("studyhub-companion-memory-changed", onMemory);
    };
  }, [enabled, refresh]);

  const recentLines = useCallback(async () => {
    const rows = await courseStore.companionSaidSince(new Date(Date.now() - LINE_REPEAT_MS).toISOString());
    return new Set(rows.map((r) => r.line_id));
  }, []);

  /** The opener for this launch, or null. Waits for the first derive. */
  const opener = useCallback(
    async ({ timeLabel }) => {
      await readyRef.current;
      const memory = memoryRef.current;
      const now = new Date();
      const today = todayRef.current;
      const blocked = blockedFromMemory(memory, now);
      const replan = blocked.length ? replanNote(rankToday(today, { blockedDays: blocked }), blocked, now) : null;
      return pickOpener(
        { memory, now, absentDays: absentRef.current, catchUp: catchUpFrom(today, now), replan, timeLabel },
        { recent: await recentLines() }
      );
    },
    [recentLines]
  );

  /** A single line for a trigger, respecting the weekly no-repeat rule. */
  const lineFor = useCallback(
    async (trigger, vars) => pickLine(trigger, vars, { recent: await recentLines() }),
    [recentLines]
  );

  const markSaid = useCallback((line) => {
    if (line?.id) void courseStore.companionMarkSaid(line.id);
  }, []);

  /** Patch a stored fact's value (celebrated milestone, comeback said). */
  const patchFact = useCallback((key, patch) => {
    const cur = memoryRef.current[key];
    if (!cur?.value || cur.muted) return;
    const value = { ...cur.value, ...patch };
    memoryRef.current = { ...memoryRef.current, [key]: { ...cur, value } };
    void courseStore.companionRemember([{ key, value, source: cur.source || "observed" }]);
  }, []);

  const remember = useCallback(async (key, value) => {
    await courseStore.companionRemember([{ key, value, source: "told" }], { notify: true });
    memoryRef.current = { ...memoryRef.current, [key]: { value, muted: false, source: "told" } };
  }, []);

  /** Store something she noticed, unless the student told her to stop tracking it. */
  const record = useCallback((key, value) => {
    if (memoryRef.current[key]?.muted) return;
    memoryRef.current = { ...memoryRef.current, [key]: { value, muted: false, source: "observed" } };
    void courseStore.companionRemember([{ key, value, source: "observed" }], { notify: true });
  }, []);

  const fact = useCallback((key) => known(memoryRef.current, key), []);

  /** What moved now that these days are blocked: { when, title } or null. */
  const replanFor = useCallback(async () => {
    const today = todayRef.current || (await courseStore.loadTodayData());
    const now = new Date();
    const blocked = blockedFromMemory(memoryMap(await courseStore.companionMemory()), now);
    return replanNote(rankToday(today, { blockedDays: blocked }), blocked, now);
  }, []);

  const ready = useCallback(() => readyRef.current, []);
  /** The whole memory map as of the last load (muted rows included, flagged). */
  const snapshot = useCallback(() => memoryRef.current, []);
  return useMemo(
    () => ({ opener, lineFor, markSaid, patchFact, remember, record, fact, replanFor, ready, snapshot }),
    [opener, lineFor, markSaid, patchFact, remember, record, fact, replanFor, ready, snapshot]
  );
}
