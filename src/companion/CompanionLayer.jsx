import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { character, line } from "./character.js";
import { loadCompanionState, saveCompanionState, resolveAccessory, levelForXp, unlockedAccessories } from "./companionStore.js";
import { getDueCards } from "../study/sm2.js";
import { shortCourse } from "../features/dashboard/courseLabel.js";
import { cardKey, xpForRun } from "./lightRun.js";
import { QuizPanel } from "./QuizPanel.jsx";
import { transition, AUTONOMOUS } from "./machine.js";
import { clampPoint, defaultHome, pickWaypoint, pointBeside, waitForTarget } from "./safeZones.js";
import { useCompanionMotion } from "./useCompanionMotion.js";
import { ScoutSprite } from "./ScoutSprite.jsx";
import { SpeechBubble } from "./SpeechBubble.jsx";
import { RadialMenu } from "./RadialMenu.jsx";
import { Spotlight } from "./Spotlight.jsx";
import { HelpBubble } from "./HelpBubble.jsx";
import { CompanionSettings } from "./CompanionSettings.jsx";
import firstRun from "./tours/first-run.json";
import courseTools from "./tours/course-tools.json";

const TOURS = { [firstRun.id]: firstRun, [courseTools.id]: courseTools };

const MOVE = {
  calm: { speed: 60, idle: [14000, 28000] },
  normal: { speed: 90, idle: [8000, 20000] },
  lively: { speed: 125, idle: [5000, 12000] },
};
const ENGAGED_SPEED = 420;
const SLEEP_AFTER_MS = 3 * 60 * 1000;
const TYPING_PAUSE_MS = 5000;
const BUBBLE_W = 290;
const QUIZ_W = 380;
const NUDGE_FIRST_MS = 90 * 1000;
const NUDGE_COOLDOWN_MS = 10 * 60 * 1000;
const NUDGE_MAX_PER_SESSION = 4;
const NUDGE_SHOW_MS = 8000;

const rand = ([a, b]) => a + Math.random() * (b - a);
const rectOf = (r) => ({ left: r.left, top: r.top, width: r.width, height: r.height });
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Scout's overlay. Lives above the app in a portal; only Scout, her bubbles and menus take
 * pointer events. Mounted by StudyHubApp once the launch splash is gone.
 */
export default function CompanionLayer({ courses = [], activeCourseId = null, onHub = true, onGoHub, onOpenCourse, onUpdateCourse }) {
  const [cstate, setCstate] = useState(null);
  const stateRef = useRef(null);
  const [mode, setMode] = useState("hidden");
  const modeRef = useRef("hidden");
  const [mood, setMood] = useState("neutral");
  const [bubble, setBubble] = useState(null);
  const [anchor, setAnchor] = useState({ h: "left", v: "above" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tour, setTour] = useState(null);
  const [ring, setRing] = useState(null);
  const [help, setHelp] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [glow, setGlow] = useState(1);
  const [react, setReact] = useState(null);
  const [quizDeck, setQuizDeck] = useState("all");

  const nodeRef = useRef(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const { posRef, flyTo, jumpTo, cancel, flying, facing, setFacing } = useCompanionMotion(nodeRef, { reduced });

  const size = Math.round(character.size * (cstate?.scale || 1));
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const navRef = useRef({});
  navRef.current = { courses, activeCourseId, onHub, onGoHub, onOpenCourse };

  const lastActivityRef = useRef(Date.now());
  const lastInputRef = useRef(0);
  const lastDriftRef = useRef(0);
  const tourRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const startedRef = useRef(false);
  /** Latest-closure handlers for timers and global listeners. */
  const api = useRef({});
  const quizRef = useRef({ sessionId: null, pending: new Map() });
  const nudgeRef = useRef({ mountedAt: Date.now(), last: 0, cooldown: NUDGE_COOLDOWN_MS, count: 0 });
  const reactTimerRef = useRef(0);

  /* ---------- state plumbing ---------- */

  const send = useCallback((event) => {
    const next = transition(modeRef.current, event);
    if (next !== modeRef.current) {
      modeRef.current = next;
      setMode(next);
    }
    return next;
  }, []);

  const force = useCallback((next) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  const update = useCallback((patch) => {
    const cur = stateRef.current;
    if (!cur) return;
    const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
    stateRef.current = next;
    setCstate(next);
    saveCompanionState(next);
  }, []);

  const say = useCallback((text, opts = {}) => setBubble(text || opts.actions ? { text, ...opts } : null), []);

  const home = useCallback(() => {
    const s = sizeRef.current;
    return clampPoint(stateRef.current?.home || defaultHome(s), s);
  }, []);

  const refreshAnchor = useCallback(() => {
    const p = posRef.current;
    const s = sizeRef.current;
    setAnchor({
      h: p.x + s / 2 > window.innerWidth / 2 ? "left" : "right",
      v: p.y > 280 ? "above" : "below",
    });
  }, [posRef]);

  /* ---------- load + first appearance ---------- */

  useEffect(() => {
    let alive = true;
    loadCompanionState().then((s) => {
      if (!alive) return;
      stateRef.current = s;
      setCstate(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const appear = useCallback(
    async (greet) => {
      setBubble(null);
      setMood("neutral");
      if (!greet) {
        force("idle");
        jumpTo(home());
        return;
      }
      force("idle");
      send("GREET");
      setMood("excited");
      jumpTo({ x: window.innerWidth + 10, y: window.innerHeight * 0.45 });
      const s = sizeRef.current;
      const ok = await flyTo(clampPoint({ x: window.innerWidth * 0.6, y: window.innerHeight * 0.38 }, s), { speed: 380 });
      if (!ok || modeRef.current !== "greet") return;
      setMood("happy");
      api.current.greet();
    },
    [force, send, jumpTo, flyTo, home]
  );

  useEffect(() => {
    if (!cstate || startedRef.current) return;
    startedRef.current = true;
    if (cstate.enabled) void appear(!cstate.onboarded);
  }, [cstate, appear]);

  /* ---------- tours ---------- */

  const ensureRoute = useCallback((route) => {
    const nav = navRef.current;
    if (route === "hub") {
      if (!nav.onHub) nav.onGoHub?.();
      return true;
    }
    if (route === "course") {
      const inUserCourse = nav.activeCourseId && nav.courses.some((c) => c.id === nav.activeCourseId);
      if (inUserCourse) return true;
      if (!nav.courses.length) return false;
      nav.onOpenCourse?.(nav.courses[0].id);
      return true;
    }
    return true;
  }, []);

  const endTour = useCallback(
    (completed) => {
      const t = tourRef.current;
      if (!t) return;
      t.cleanup?.();
      tourRef.current = null;
      setTour(null);
      update((s) => ({
        onboarded: true,
        tours: { ...s.tours, [t.id]: { step: 0, done: completed || !!s.tours[t.id]?.done } },
      }));
      send("END");
      setMood(completed ? "happy" : "neutral");
      say(completed ? line("tourDone") : "No problem. The tour's in my menu whenever you want it.");
    },
    [update, send, say]
  );

  const goStep = useCallback(
    async (index, dir = 1) => {
      const t = tourRef.current;
      if (!t) return;
      t.cleanup?.();
      t.cleanup = null;
      t.el = null;
      const token = ++t.token;
      let i = index;
      if (i < 0) {
        i = 0;
        dir = 1;
      }
      if (i >= t.steps.length) {
        endTour(true);
        return;
      }
      const step = t.steps[i];
      const skip = () => goStep(i + dir < 0 ? i + 1 : i + dir, i + dir < 0 ? 1 : dir);
      update((s) => ({ tours: { ...s.tours, [t.id]: { ...(s.tours[t.id] || {}), step: i } } }));
      setTour({ id: t.id, index: i, total: t.steps.length, step, rect: null, ready: false });
      setMood("thinking");

      if (!ensureRoute(step.route)) return skip();
      const el = step.targetId ? await waitForTarget(step.targetId, 3000) : null;
      if (tourRef.current !== t || t.token !== token) return;
      if (step.targetId && !el) return skip();

      const s = sizeRef.current;
      let p;
      let rect = null;
      if (el) {
        el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        await nextFrame();
        rect = el.getBoundingClientRect();
        p = pointBeside(rect, s, step.placement);
      } else {
        p = { ...clampPoint({ x: window.innerWidth / 2 - s / 2, y: window.innerHeight / 2 - s }, s), side: "right" };
      }
      setTour((prev) => (prev ? { ...prev, rect: rect ? rectOf(rect) : null } : prev));
      await flyTo(p, { speed: ENGAGED_SPEED });
      if (tourRef.current !== t || t.token !== token) return;

      if (rect) setFacing(p.x + s / 2 > rect.left + rect.width / 2 ? -1 : 1);
      setMood("point");
      let h = p.side === "left" ? "left" : p.side === "right" ? "right" : p.x + s / 2 > window.innerWidth / 2 ? "left" : "right";
      const need = BUBBLE_W + 12;
      if (h === "right" && window.innerWidth - (p.x + s) < need && p.x >= need) h = "left";
      else if (h === "left" && p.x < need && window.innerWidth - (p.x + s) >= need) h = "right";
      setAnchor({ h, v: p.y > window.innerHeight / 2 ? "above" : "below" });
      t.el = el;
      t.placement = step.placement;
      if (el && step.waitFor === "click") {
        const onTargetClick = () => goStep(i + 1, 1);
        el.addEventListener("click", onTargetClick, { once: true });
        t.cleanup = () => el.removeEventListener("click", onTargetClick);
      }
      setTour((prev) => (prev ? { ...prev, ready: true } : prev));
    },
    [endTour, ensureRoute, flyTo, setFacing, update]
  );

  const startTour = useCallback(
    (id) => {
      const def = TOURS[id];
      if (!def) return;
      setBubble(null);
      setHelp(null);
      setRing(null);
      cancel();
      if (send("TOUR") !== "tour") return;
      const saved = stateRef.current?.tours?.[id];
      const resumeAt = saved && !saved.done && saved.step > 0 && saved.step < def.steps.length ? saved.step : 0;
      tourRef.current = { id, steps: def.steps, token: 0, el: null, cleanup: null };
      void goStep(resumeAt, 1);
    },
    [cancel, send, goStep]
  );

  /* Keep the spotlight glued to its target through resizes and scrolling. */
  useEffect(() => {
    if (mode !== "tour") return undefined;
    let raf = 0;
    let settle = 0;
    const onChange = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const t = tourRef.current;
        if (!t?.el) return;
        const r = t.el.getBoundingClientRect();
        setTour((prev) => (prev ? { ...prev, rect: rectOf(r) } : prev));
        window.clearTimeout(settle);
        settle = window.setTimeout(() => {
          const p = pointBeside(t.el.getBoundingClientRect(), sizeRef.current, t.placement);
          jumpTo(p);
        }, 160);
      });
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [mode, jumpTo]);

  /* ---------- help ---------- */

  const startHelp = useCallback(() => {
    setBubble(null);
    cancel();
    if (send("HELP") !== "help") return;
    setHelp({ query: "", answer: null, pointed: false });
    setMood("thinking");
    refreshAnchor();
  }, [cancel, send, refreshAnchor]);

  const closeHelp = useCallback(() => {
    setHelp(null);
    setRing(null);
    send("CLOSE");
    setMood("neutral");
  }, [send]);

  const showMe = useCallback(
    async (entry) => {
      ensureRoute(entry.route);
      const el = await waitForTarget(entry.pointTo, 3000);
      if (modeRef.current !== "help") return;
      if (!el) {
        setMood("confused");
        setHelp((h) => (h ? { ...h, pointed: true } : h));
        return;
      }
      el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      await nextFrame();
      const rect = el.getBoundingClientRect();
      const s = sizeRef.current;
      const p = pointBeside(rect, s, "right");
      setHelp((h) => (h ? { ...h, pointed: true } : h));
      const ok = await flyTo(p, { speed: ENGAGED_SPEED });
      if (!ok || modeRef.current !== "help") return;
      setFacing(p.x + s / 2 > rect.left + rect.width / 2 ? -1 : 1);
      setMood("point");
      refreshAnchor();
      setRing(rectOf(el.getBoundingClientRect()));
      window.setTimeout(() => setRing(null), 2600);
    },
    [ensureRoute, flyTo, setFacing, refreshAnchor]
  );

  /* ---------- menu actions ---------- */

  const hideForNow = useCallback(() => {
    setBubble(null);
    setHelp(null);
    cancel();
    send("HIDE");
  }, [cancel, send]);

  const dockPoint = useCallback(() => {
    const s = sizeRef.current;
    const panelLeft = window.innerWidth - 16 - QUIZ_W;
    return clampPoint({ x: panelLeft - s - 18, y: 110 }, s);
  }, []);

  const startQuiz = useCallback(
    async (deckId) => {
      const nav = navRef.current;
      const hasCards = (id) => nav.courses.some((c) => c.id === id && (c.flashcards || []).length);
      const deck = deckId && hasCards(deckId) ? deckId : hasCards(nav.activeCourseId) ? nav.activeCourseId : "all";
      setBubble(null);
      setHelp(null);
      setRing(null);
      cancel();
      if (send("QUIZ") !== "quiz") return;
      quizRef.current = { sessionId: `quiz_${Date.now()}`, pending: new Map() };
      setQuizDeck(deck);
      setGlow(1);
      setMood("excited");
      const ok = await flyTo(dockPoint(), { speed: ENGAGED_SPEED });
      if (!ok || modeRef.current !== "quiz") return;
      setFacing(1);
      setAnchor({ h: "left", v: "below" });
      say("Let's light this up. Pick a deck and a mode.");
    },
    [cancel, send, flyTo, dockPoint, setFacing, say]
  );

  const flashReaction = useCallback((kind) => {
    window.clearTimeout(reactTimerRef.current);
    setReact(kind);
    reactTimerRef.current = window.setTimeout(() => setReact(null), 650);
  }, []);

  useEffect(() => () => window.clearTimeout(reactTimerRef.current), []);

  const onQuizAnswer = useCallback(
    ({ card, grade, fields, correct, partial, streak, answer }) => {
      void window.studyHub?.db?.mastery?.update?.({
        flashcardUuid: cardKey(card),
        grade,
        easeFactor: fields.easeFactor,
        intervalDays: fields.intervalDays,
        repetitions: fields.repetitions,
        nextReview: fields.next_review,
        sessionId: quizRef.current.sessionId,
      });
      const pending = quizRef.current.pending;
      if (!pending.has(card.courseId)) pending.set(card.courseId, new Map());
      pending.get(card.courseId).set(cardKey(card), fields);

      setGlow((g) => Math.max(0, Math.min(character.glowLevels, g + (correct ? 1 : -1))));
      setAnchor({ h: "left", v: "below" });
      if (correct) {
        setMood(streak >= 3 ? "excited" : "happy");
        flashReaction("bounce");
        if (partial) say("Close enough. Watch the spelling next time.");
        else say(line(streak >= 3 ? "correctStreak" : "correct", { streak }));
      } else {
        setMood("sad");
        flashReaction("droop");
        const text = String(answer);
        say(text.length > 32 ? line("wrongLong") : line("wrong", { answer: text }));
      }
    },
    [flashReaction, say]
  );

  /** Called once per run: XP, high score, session log, and fresh SM-2 fields back into course state. */
  const onQuizFinish = useCallback(
    (summary) => {
      const cur = stateRef.current;
      const xpGained = xpForRun(summary);
      const before = levelForXp(cur.xp || 0);
      const xp = (cur.xp || 0) + xpGained;
      const level = levelForXp(xp);
      const prevUnlocks = new Set(unlockedAccessories(cur.xp || 0).map((a) => a.id));
      const unlocked = unlockedAccessories(xp).find((a) => !prevUnlocks.has(a.id))?.label || null;
      const prevBest = cur.highScores?.[summary.deckId] || 0;
      const newHighScore = summary.mode === "streak" && summary.score > prevBest;
      update((s) => ({
        xp,
        runs: (s.runs || 0) + 1,
        highScores: newHighScore ? { ...s.highScores, [summary.deckId]: summary.score } : s.highScores,
      }));

      const endedAt = new Date().toISOString();
      for (const courseUuid of summary.courseUuids.length ? summary.courseUuids : [null]) {
        if (!summary.answered) break;
        void window.studyHub?.db?.sessions?.log?.({
          courseUuid,
          kind: "quiz",
          startedAt: summary.startedAt,
          endedAt,
          reviewed: summary.answered,
          correct: summary.correct,
          incorrect: summary.answered - summary.correct,
        });
      }

      const pending = quizRef.current.pending;
      quizRef.current = { sessionId: `quiz_${Date.now()}`, pending: new Map() };
      for (const [courseId, updates] of pending) {
        void onUpdateCourse?.(courseId, (course) => ({
          ...course,
          flashcards: (course.flashcards || []).map((c) => (updates.has(cardKey(c)) ? { ...c, ...updates.get(cardKey(c)) } : c)),
        }));
      }

      setMood(summary.answered && summary.correct / summary.answered >= 0.7 ? "excited" : "happy");
      if (level > before) {
        say(unlocked ? `Level ${level}! I unlocked the ${unlocked.toLowerCase()}. Very distinguished.` : `Level ${level}! Keep this up and I'll need sunglasses.`);
      } else {
        say(line("finished", { correct: summary.correct, total: summary.answered }));
      }
      return { xpGained, level, leveledUp: level > before, unlocked, newHighScore };
    },
    [update, onUpdateCourse, say]
  );

  const closeQuiz = useCallback(() => {
    setBubble(null);
    send("END");
    setGlow(1);
    setMood("neutral");
    void flyTo(home(), { speed: 220 });
  }, [send, flyTo, home]);

  const contextualTour = useCallback(() => {
    const nav = navRef.current;
    const inUserCourse = nav.activeCourseId && nav.courses.some((c) => c.id === nav.activeCourseId);
    startTour(inUserCourse ? "course-tools" : "first-run");
  }, [startTour]);

  api.current.greet = () => {
    say(line("firstLaunch"), {
      sticky: true,
      actions: [
        { label: "TAKE THE TOUR", primary: true, autoFocus: true, onClick: () => startTour("first-run") },
        {
          label: "MAYBE LATER",
          onClick: () => {
            update({ onboarded: true });
            send("CLOSE");
            say("No problem. The tour's in my menu whenever you want it.");
          },
        },
        {
          label: "I'VE GOT IT",
          onClick: () => {
            update({ onboarded: true });
            send("CLOSE");
            say(line("dismissed"));
            void flyTo(home(), { speed: 200 });
          },
        },
      ],
    });
  };

  /* ---------- clicking & dragging Scout ---------- */

  const onScoutClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const m = modeRef.current;
    if (m === "tour" || m === "greet" || m === "quiz") return;
    if (m === "help") {
      closeHelp();
      return;
    }
    cancel();
    setBubble(null);
    lastActivityRef.current = Date.now();
    send("CLICK");
    setMood(m === "sleep" ? "confused" : "neutral");
    refreshAnchor();
  }, [cancel, send, closeHelp, refreshAnchor]);

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      dragRef.current = {
        sx: e.clientX,
        sy: e.clientY,
        ox: e.clientX - posRef.current.x,
        oy: e.clientY - posRef.current.y,
        moved: false,
      };
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* capture is a nicety; dragging still works without it */
      }
    },
    [posRef]
  );

  const onPointerMove = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
        d.moved = true;
        cancel();
        setDragging(true);
      }
      jumpTo(clampPoint({ x: e.clientX - d.ox, y: e.clientY - d.oy }, sizeRef.current));
    },
    [cancel, jumpTo]
  );

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d?.moved) return;
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    setDragging(false);
    const m = modeRef.current;
    if (AUTONOMOUS.has(m) || m === "sleep" || m === "menu") {
      update({ home: { x: Math.round(posRef.current.x), y: Math.round(posRef.current.y) } });
      if (m !== "menu") send("DROP");
    }
    refreshAnchor();
  }, [update, send, refreshAnchor, posRef]);

  /* ---------- autonomy: wander, perch, sleep ---------- */

  const movement = cstate?.movement || "normal";
  const enabled = !!cstate?.enabled;

  useEffect(() => {
    if (mode !== "idle" || !enabled || movement === "off") return undefined;
    const cfg = MOVE[movement] || MOVE.normal;
    let timer = 0;
    let alive = true;
    const schedule = (ms) => {
      timer = window.setTimeout(tick, ms);
    };
    const tick = async () => {
      if (!alive) return;
      if (document.hidden || Date.now() - lastInputRef.current < TYPING_PAUSE_MS) {
        schedule(4000);
        return;
      }
      const wp = pickWaypoint(sizeRef.current, posRef.current);
      if (!wp) {
        schedule(rand(cfg.idle));
        return;
      }
      send("WANDER");
      const ok = await flyTo(wp, { speed: cfg.speed });
      if (!ok || modeRef.current !== "wander") return;
      send(wp.perch ? "PERCH" : "ARRIVE");
    };
    schedule(rand(cfg.idle));
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [mode, enabled, movement, send, flyTo, posRef]);

  useEffect(() => {
    if (mode !== "perch") return undefined;
    const t = window.setTimeout(() => send("DONE"), rand([10000, 30000]));
    return () => window.clearTimeout(t);
  }, [mode, send]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (AUTONOMOUS.has(modeRef.current) && Date.now() - lastActivityRef.current > SLEEP_AFTER_MS) {
        cancel();
        setBubble(null);
        send("SLEEP");
      }
    }, 10000);
    return () => window.clearInterval(id);
  }, [cancel, send]);

  /* Due-card nudges: rare, polite, and they back off when dismissed. */
  api.current.maybeNudge = async () => {
    const cur = stateRef.current;
    const n = nudgeRef.current;
    const now = Date.now();
    if (!cur?.enabled || !cur.nudges || !cur.onboarded || document.hidden) return;
    if (modeRef.current !== "idle" && modeRef.current !== "perch") return;
    if (n.count >= NUDGE_MAX_PER_SESSION || now - n.mountedAt < NUDGE_FIRST_MS) return;
    if (n.last && now - n.last < n.cooldown) return;
    if (now - lastInputRef.current < TYPING_PAUSE_MS) return;
    const best = navRef.current.courses
      .map((c) => ({ c, due: getDueCards(c.flashcards || []).length }))
      .sort((a, b) => b.due - a.due)[0];
    if (!best || best.due < 3) return;
    n.count += 1;
    n.last = now;
    cancel();
    if (send("NUDGE") !== "nudge") return;
    const spot = document.querySelector('[data-tour-id="today-cards"]');
    if (spot) {
      const r = spot.getBoundingClientRect();
      if (r.width && r.bottom > 0 && r.top < window.innerHeight) {
        await flyTo(pointBeside(r, sizeRef.current, "right"), { speed: 200 });
        if (modeRef.current !== "nudge") return;
      }
    }
    setMood("happy");
    refreshAnchor();
    say(line("due", { count: best.due, course: shortCourse(best.c.courseCode || best.c.name) || best.c.name }), {
      sticky: true,
      actions: [
        { label: "QUIZ ME", primary: true, onClick: () => startQuiz(best.c.id) },
        {
          label: "NOT NOW",
          onClick: () => {
            n.cooldown *= 2;
            setBubble(null);
            send("CLOSE");
            setMood("neutral");
          },
        },
      ],
    });
  };

  useEffect(() => {
    const id = window.setInterval(() => void api.current.maybeNudge(), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (mode !== "nudge") return undefined;
    const t = window.setTimeout(() => {
      if (modeRef.current !== "nudge") return;
      setBubble(null);
      send("CLOSE");
      setMood("neutral");
    }, NUDGE_SHOW_MS);
    return () => window.clearTimeout(t);
  }, [mode, send]);

  /* Activity, typing pauses, cursor shyness, the summon hotkey. */
  useEffect(() => {
    let lastMove = 0;
    const onActivity = () => {
      lastActivityRef.current = Date.now();
      if (modeRef.current === "sleep") send("WAKE");
    };
    const onPointerMoveGlobal = (e) => {
      const now = Date.now();
      if (now - lastMove < 120) return;
      lastMove = now;
      onActivity();
      if (modeRef.current !== "wander" || now - lastDriftRef.current < 3000) return;
      const s = sizeRef.current;
      const p = posRef.current;
      const cx = p.x + s / 2;
      const cy = p.y + s / 2;
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      if (dist >= 80) return;
      lastDriftRef.current = now;
      const ax = (cx - e.clientX) / (dist || 1);
      const ay = (cy - e.clientY) / (dist || 1);
      void flyTo(clampPoint({ x: p.x + ax * 120, y: p.y + ay * 120 }, s), { speed: 160 }).then((ok) => {
        if (ok && modeRef.current === "wander") send("ARRIVE");
      });
    };
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        api.current.summon();
        return;
      }
      lastInputRef.current = Date.now();
      onActivity();
      if (modeRef.current === "wander") {
        cancel();
        send("ARRIVE");
      }
    };
    const onWheel = () => {
      lastInputRef.current = Date.now();
      onActivity();
      if (modeRef.current === "perch") send("DONE");
    };
    window.addEventListener("pointermove", onPointerMoveGlobal, { passive: true });
    window.addEventListener("pointerdown", onActivity, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMoveGlobal);
      window.removeEventListener("pointerdown", onActivity, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, [send, cancel, flyTo, posRef]);

  api.current.summon = async () => {
    const cur = stateRef.current;
    if (!cur) return;
    const m = modeRef.current;
    if (m === "tour" || m === "quiz") return;
    if (!cur.enabled) update({ enabled: true });
    if (m === "hidden" || !cur.enabled) force("idle");
    if (m === "menu") {
      send("CLOSE");
      return;
    }
    setBubble(null);
    setHelp(null);
    if (modeRef.current !== "idle" && modeRef.current !== "wander" && modeRef.current !== "perch" && modeRef.current !== "sleep") {
      force("idle");
    }
    const s = sizeRef.current;
    const ok = await flyTo(clampPoint({ x: window.innerWidth * 0.55, y: window.innerHeight * 0.42 }, s), { speed: ENGAGED_SPEED });
    if (!ok) return;
    send("CLICK");
    refreshAnchor();
  };

  /* Close the menu / help when clicking elsewhere. */
  useEffect(() => {
    if (mode !== "menu" && mode !== "help") return undefined;
    const onDown = (e) => {
      if (nodeRef.current?.contains(e.target)) return;
      if (modeRef.current === "help") closeHelp();
      else send("CLOSE");
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [mode, send, closeHelp]);

  /* Escape leaves a tour; stay on screen through resizes. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && modeRef.current === "tour") endTour(false);
      if (e.key === "Escape" && modeRef.current === "help") closeHelp();
    };
    const onResize = () => {
      if (modeRef.current === "quiz") {
        jumpTo(dockPoint());
        return;
      }
      const s = sizeRef.current;
      const c = clampPoint(posRef.current, s);
      if (c.x !== posRef.current.x || c.y !== posRef.current.y) jumpTo(c);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [endTour, closeHelp, jumpTo, posRef, dockPoint]);

  const prevSizeRef = useRef(size);
  useEffect(() => {
    if (prevSizeRef.current === size) return;
    prevSizeRef.current = size;
    const c = clampPoint(posRef.current, size);
    if (c.x !== posRef.current.x || c.y !== posRef.current.y) jumpTo(c);
  }, [size, jumpTo, posRef]);

  /* Plain bubbles fade on their own; sticky ones wait for a choice. */
  useEffect(() => {
    if (!bubble || bubble.sticky) return undefined;
    const t = window.setTimeout(() => {
      setBubble(null);
      if (AUTONOMOUS.has(modeRef.current)) setMood("neutral");
    }, 4200 + (bubble.text?.length || 0) * 35);
    return () => window.clearTimeout(t);
  }, [bubble]);

  useEffect(() => {
    if (flying || mode === "tour") return;
    refreshAnchor();
  }, [flying, mode, bubble, refreshAnchor]);

  useEffect(() => {
    const open = () => setSettingsOpen((v) => !v);
    window.addEventListener("studyhub-scout-settings", open);
    return () => window.removeEventListener("studyhub-scout-settings", open);
  }, []);

  /* ---------- settings ---------- */

  const onSettingsChange = useCallback(
    (patch) => {
      if ("enabled" in patch) {
        update(patch);
        if (patch.enabled) {
          if (modeRef.current === "hidden") void appear(false);
        } else {
          if (tourRef.current) {
            tourRef.current.cleanup?.();
            tourRef.current = null;
            setTour(null);
          }
          setBubble(null);
          setHelp(null);
          cancel();
          force("hidden");
        }
        return;
      }
      if (patch.movement === "off" && modeRef.current === "wander") {
        cancel();
        send("ARRIVE");
      }
      update(patch);
    },
    [update, appear, cancel, force, send]
  );

  if (!cstate) return null;

  const visible = cstate.enabled && mode !== "hidden";
  const accessory = resolveAccessory(cstate);
  const level = levelForXp(cstate.xp || 0);
  const shownMood = mode === "sleep" ? "sleep" : mood;
  const center = { x: posRef.current.x + size / 2, y: posRef.current.y + size / 2 };

  let bubbleNode = null;
  if (visible && mode === "tour" && tour?.ready) {
    const last = tour.index === tour.total - 1;
    const waiting = tour.step.waitFor === "click";
    const actions = [];
    if (tour.index > 0) actions.push({ label: "BACK", onClick: () => goStep(tour.index - 1, -1) });
    if (!waiting) actions.push({ label: last ? "DONE" : "NEXT", primary: true, autoFocus: true, onClick: () => goStep(tour.index + 1, 1) });
    actions.push({ label: "SKIP TOUR", onClick: () => endTour(false) });
    bubbleNode = (
      <SpeechBubble
        key={`tour-${tour.index}`}
        title={tour.step.title?.toUpperCase()}
        text={waiting ? `${tour.step.text} Click it to continue.` : tour.step.text}
        actions={actions}
        footer={`${tour.index + 1} / ${tour.total}`}
        h={anchor.h}
        v={anchor.v}
        wide
      />
    );
  } else if (visible && mode === "help" && help) {
    bubbleNode = (
      <HelpBubble
        help={help}
        h={anchor.h}
        v={anchor.v}
        onQuery={(query) => setHelp((h) => ({ ...h, query }))}
        onPick={(answer) => {
          setHelp((h) => ({ ...h, answer, pointed: false }));
          setMood("happy");
        }}
        onBack={() => {
          setRing(null);
          setHelp((h) => ({ ...h, answer: null }));
        }}
        onClose={closeHelp}
        onShowMe={showMe}
        onAction={(kind, entry) => {
          if (kind === "tour") startTour(entry.tour);
          else if (kind === "quiz") startQuiz();
          else if (kind === "open-ai") {
            closeHelp();
            window.dispatchEvent(new CustomEvent("studyhub-open-ai"));
          }
        }}
      />
    );
  } else if (visible && bubble && !flying && mode !== "menu") {
    bubbleNode = <SpeechBubble text={bubble.text} title={bubble.title} actions={bubble.actions} h={anchor.h} v={anchor.v} />;
  }

  const menuItems = [
    { id: "quiz", label: "QUIZ ME", icon: "✦", onClick: () => startQuiz() },
    { id: "tour", label: "SHOW ME AROUND", icon: "◎", onClick: contextualTour },
    { id: "help", label: "HOW DO I…?", icon: "?", onClick: startHelp },
    { id: "hide", label: "HIDE FOR NOW", icon: "–", onClick: hideForNow },
  ];

  return createPortal(
    <div className="sc-layer">
      {visible && mode === "tour" && tour ? <Spotlight rect={tour.rect} dim /> : null}
      {visible && ring ? <Spotlight rect={ring} dim={false} /> : null}
      <div
        ref={nodeRef}
        className={[
          "sc-scout",
          visible ? "" : "sc-scout--hidden",
          dragging ? "sc-scout--dragging" : "",
          mode === "sleep" ? "sc-scout--asleep" : "",
          reduced ? "sc-scout--still" : "",
          mode === "perch" ? "sc-scout--perched" : "",
          react ? `sc-scout--${react}` : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ width: size, height: size }}
      >
        <button
          type="button"
          className="sc-scout-btn"
          aria-label="Scout, study companion. Open menu"
          aria-haspopup="menu"
          aria-expanded={mode === "menu"}
          onClick={onScoutClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="sc-bob">
            <ScoutSprite mood={shownMood} glow={glow} facing={facing} flying={flying || dragging} accessory={accessory} size={size} />
          </span>
        </button>
        {visible && mode === "sleep" ? (
          <span className="sc-zzz mono" aria-hidden>
            <i>z</i>
            <i>z</i>
            <i>z</i>
          </span>
        ) : null}
        {visible && mode === "menu" ? (
          <RadialMenu
            items={menuItems}
            center={center}
            size={size}
            onClose={() => send("CLOSE")}
            footer={
              <>
                <span>SCOUT · LV {level}</span>
                <button
                  type="button"
                  className="sc-menu-gear mono"
                  onClick={() => {
                    send("CLOSE");
                    setSettingsOpen(true);
                  }}
                  aria-label="Scout settings"
                >
                  ⚙
                </button>
              </>
            }
          />
        ) : null}
        {bubbleNode}
      </div>
      {visible && mode === "quiz" ? (
        <QuizPanel
          courses={courses}
          initialDeck={quizDeck}
          highScores={cstate.highScores}
          onAnswer={onQuizAnswer}
          onFinish={onQuizFinish}
          onClose={closeQuiz}
        />
      ) : null}
      {settingsOpen ? (
        <CompanionSettings
          state={{ ...cstate, enabled: visible }}
          onChange={onSettingsChange}
          onClose={() => setSettingsOpen(false)}
          onResetTours={() => update({ tours: {} })}
          onResetStats={() => update({ xp: 0, highScores: {}, runs: 0 })}
          onReplayWelcome={() => {
            setSettingsOpen(false);
            update({ onboarded: false, enabled: true });
            void appear(true);
          }}
        />
      ) : null}
    </div>,
    document.body
  );
}
