import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { character, line, finishKey, isFailing } from "./character.js";
import {
  loadCompanionState,
  saveCompanionState,
  resolveTint,
  levelForXp,
  unlockedTints,
  isRampant,
  xpFor,
  isStudyAward,
  XP_AWARDS,
} from "./companionStore.js";
import { getDueCards, localDateString } from "../study/sm2.js";
import { loadFlashcardDeck, persistFlashcardDeck } from "../study/flashcards/flashcardPersistence.js";
import { shortCourse } from "../features/dashboard/courseLabel.js";
import { cardKey, runAwards } from "./lightRun.js";
import { STUDY_EVENT } from "./studyEvents.js";
import { BORED_AFTER_MS, clockLabel, dayPart, idleGap, pickIdleGesture, sleepAfterMs } from "./idleDirector.js";
import { QuizPanel } from "./QuizPanel.jsx";
import { transition, AUTONOMOUS } from "./machine.js";
import {
  clampPoint,
  defaultHome,
  groundPlatform,
  livePlatform,
  pickStroll,
  pickWaypoint,
  platformAt,
  platformBelow,
  pointBeside,
  standOn,
  waitForTarget,
} from "./safeZones.js";
import { useCompanionMotion } from "./useCompanionMotion.js";
import { NovaSprite } from "./NovaSprite.jsx";
import { playSound } from "./novaSound.js";
import { SpeechBubble } from "./SpeechBubble.jsx";
import { RadialMenu } from "./RadialMenu.jsx";
import { Spotlight } from "./Spotlight.jsx";
import { HelpBubble } from "./HelpBubble.jsx";
import { CompanionSettings } from "./CompanionSettings.jsx";
import firstRun from "./tours/first-run.json";
import courseTools from "./tours/course-tools.json";

const Nova3D = lazy(() => import("./nova3d/Nova3D.jsx"));

const TOURS = { [firstRun.id]: firstRun, [courseTools.id]: courseTools };
/** Height of the 3D body's box at 100% size. */
const SIZE_3D = 180;
const LAND_QUIP_COOLDOWN_MS = 45 * 1000;
const WALK_OFF_MS = 1300;
const BODY_LOAD_TIMEOUT_MS = 12 * 1000;
const LATE_QUIP_COOLDOWN_MS = 20 * 60 * 1000;
const DAY_HELLO_DELAY_MS = 2500;
/** Dangling swing: radians of tilt per px/s of cursor speed, and the tilt limit. */
const SWING_PER_PX = 0.0007;
const SWING_MAX = 0.75;
/** Away from the window at least this long and she waves when you come back. */
const RETURN_AWAY_MS = 10 * 60 * 1000;
/** Chance she sits down after perching on a card, and the delay before she does. */
const SIT_CHANCE = 0.6;
const SIT_DELAY_MS = [900, 2400];
/** Modes where she turns to face the user. */
const ATTEND_MODES = new Set(["menu", "help", "nudge", "greet", "quiz"]);
/** Typewriter pace in SpeechBubble (2 chars / 36ms), so her mouth stops with the text. */
const TALK_MS_PER_CHAR = 18;

const MOVE = {
  calm: { speed: 60, idle: [14000, 28000] },
  normal: { speed: 90, idle: [8000, 20000] },
  lively: { speed: 125, idle: [5000, 12000] },
};
const ENGAGED_SPEED = 420;
const TYPING_PAUSE_MS = 5000;
const BUBBLE_W = 290;
const QUIZ_W = 380;
const NUDGE_FIRST_MS = 90 * 1000;
const NUDGE_COOLDOWN_MS = 10 * 60 * 1000;
const NUDGE_MAX_PER_SESSION = 4;
const NUDGE_SHOW_MS = 8000;
const RAMPANT_MUTTER_MS = [90 * 1000, 200 * 1000];
const XP_POP_MS = 1500;
/** The built-in OM 300 course id; its deck lives in localStorage, not SQLite. */
const BUILTIN_ID = "builtin";
const BUILTIN_NAME = "OM 300";

const builtinCourse = (flashcards) => ({ id: BUILTIN_ID, uuid: BUILTIN_ID, name: BUILTIN_NAME, flashcards });

const rand = ([a, b]) => a + Math.random() * (b - a);
const rectOf = (r) => ({ left: r.left, top: r.top, width: r.width, height: r.height });
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Nova's overlay. Lives above the app in a portal; only Nova, her bubbles and menus take
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
  const [now, setNow] = useState(Date.now);
  const [builtinCards, setBuiltinCards] = useState(loadFlashcardDeck);
  const [pops, setPops] = useState([]);
  const popIdRef = useRef(0);
  const drillRef = useRef({ known: 0, missed: 0 });
  /** 3D body status; "failed" drops back to the portrait sprite for good this session. */
  const [body, setBody] = useState("loading");
  const use3d = body !== "failed";
  const use3dRef = useRef(use3d);
  use3dRef.current = use3d;
  const [gesture, setGesture] = useState(null);
  const gestureIdRef = useRef(0);
  const [dropMark, setDropMark] = useState(null);
  const [talkUntil, setTalkUntil] = useState(0);
  /** The platform the 3D body stands on: `{ el }` (el null = window bottom), or null mid-air. */
  const platRef = useRef(null);
  const lastLandQuipRef = useRef(0);
  const lastLateQuipRef = useRef(0);
  const [seat, setSeat] = useState(null);
  const seatRef = useRef(null);
  seatRef.current = seat;
  const lastTierRef = useRef(null);
  const bubbleRef = useRef(null);
  bubbleRef.current = bubble;

  const nodeRef = useRef(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const sfx = useCallback((name) => {
    if (stateRef.current?.sound) playSound(name);
  }, []);
  const onTeleport = useCallback((phase) => sfx(phase === "out" ? "teleportOut" : "teleportIn"), [sfx]);
  const { posRef, flyTo, jumpTo, dropTo, cancel, busy, flying, facing, setFacing, gait } = useCompanionMotion(nodeRef, {
    reduced,
    onTeleport,
    walker: use3d,
  });
  const lastGestureAtRef = useRef(Date.now());
  const playGesture = useCallback((name, { idle = false, at = null } = {}) => {
    gestureIdRef.current += 1;
    lastGestureAtRef.current = Date.now();
    setGesture({ name, id: gestureIdRef.current, idle, at });
  }, []);
  /** Point at a DOM rect: the offset from her chest to its center, in screen px. */
  const pointAt = useCallback(
    (rect) => {
      const s = sizeRef.current;
      const p = posRef.current;
      playGesture("point", { at: { x: rect.left + rect.width / 2 - (p.x + s / 2), y: rect.top + rect.height / 2 - (p.y + s * 0.3) } });
    },
    [playGesture, posRef]
  );

  const size = Math.round((use3d ? SIZE_3D : character.size) * (cstate?.scale || 1));
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const quizCourses = useMemo(
    () => (builtinCards.length ? [...courses, builtinCourse(builtinCards)] : courses),
    [courses, builtinCards]
  );
  const navRef = useRef({});
  navRef.current = { courses, quizCourses, activeCourseId, onHub, onGoHub, onOpenCourse };

  const lastActivityRef = useRef(Date.now());
  const lastInputRef = useRef(0);
  const lastDriftRef = useRef(0);
  const tourRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const startedRef = useRef(false);
  /** Latest-closure handlers for timers and global listeners. */
  const api = useRef({});
  const quizRef = useRef({ sessionId: null, pending: new Map(), answered: 0, correct: 0, missStreak: 0 });
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
    const p = clampPoint(stateRef.current?.home || defaultHome(s), s);
    if (!use3dRef.current) return p;
    return standOn(platformBelow(p, s), p.x + s / 2, s);
  }, []);

  const refreshAnchor = useCallback(() => {
    const p = posRef.current;
    const s = sizeRef.current;
    setAnchor({
      h: p.x + s / 2 > window.innerWidth / 2 ? "left" : "right",
      v: p.y > 280 ? "above" : "below",
    });
  }, [posRef]);

  const pushPop = useCallback((text) => {
    popIdRef.current += 1;
    const id = popIdRef.current;
    setPops((list) => [...list.slice(-2), { id, text }]);
    window.setTimeout(() => setPops((list) => list.filter((p) => p.id !== id)), XP_POP_MS);
  }, []);

  /**
   * The one place XP is granted. Adds the daily bonus to the first study award of the day,
   * counts studying against rampancy, and (when `announce`) lets Nova react to level-ups.
   */
  const awardXp = useCallback(
    (parts, { announce = true } = {}) => {
      const cur = stateRef.current;
      if (!cur) return null;
      const today = localDateString();
      const studied = isStudyAward(parts);
      const daily = studied && cur.lastDailyOn !== today;
      const all = daily ? [...parts, ["daily", 1]] : parts;
      const xpGained = xpFor(all);
      if (!xpGained) return null;
      const before = levelForXp(cur.xp || 0);
      const level = levelForXp((cur.xp || 0) + xpGained);
      const prev = new Set(unlockedTints(cur.xp || 0).map((t) => t.id));
      const unlocked = unlockedTints((cur.xp || 0) + xpGained).find((t) => !prev.has(t.id))?.label || null;
      const wasRampant = isRampant(cur);
      update((s) => ({
        xp: (s.xp || 0) + xpGained,
        ...(studied ? { lastStudyAt: new Date().toISOString(), lastDailyOn: today, ignored: 0 } : {}),
      }));
      if (cur.enabled) pushPop(`+${xpGained} XP`);
      const leveledUp = level > before;
      let spoke = false;
      if (announce && studied && wasRampant) {
        setMood("happy");
        say(line("rampantRecover"));
        spoke = true;
      } else if (announce && leveledUp) {
        setMood("excited");
        sfx("streak");
        playGesture("kiss");
        say(line(unlocked ? "levelUnlock" : "levelUp", { level, tint: unlocked?.toLowerCase() }));
        spoke = true;
      }
      return { xpGained, level, leveledUp, unlocked, daily, spoke };
    },
    [update, pushPop, say, sfx, playGesture]
  );

  /* ---------- load + first appearance ---------- */

  useEffect(() => {
    let alive = true;
    loadCompanionState().then(async (s) => {
      let next = s;
      try {
        const [last] = (await window.studyHub?.db?.sessions?.history?.({ limit: 1 })) || [];
        const at = last?.ended_at || last?.started_at;
        if (at && (!s.lastStudyAt || Date.parse(at) > Date.parse(s.lastStudyAt))) next = { ...s, lastStudyAt: at };
      } catch {
        /* study history is a nicety for rampancy */
      }
      if (!alive) return;
      stateRef.current = next;
      setCstate(next);
      if (next !== s) saveCompanionState(next);
    });
    const tick = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(tick);
    };
  }, []);

  const appear = useCallback(
    async (greet) => {
      setBubble(null);
      setMood("neutral");
      if (!greet) {
        force("idle");
        jumpTo(home());
        sfx("appear");
        const part = dayPart();
        const chance = part === "late" ? 0.7 : part === "morning" ? 0.4 : 0;
        if (Math.random() < chance) {
          window.setTimeout(() => {
            if (modeRef.current !== "idle" || busy()) return;
            setMood("happy");
            refreshAnchor();
            say(line(part === "late" ? "lateHello" : "morningHello", { time: clockLabel() }));
          }, DAY_HELLO_DELAY_MS);
        }
        return;
      }
      force("idle");
      send("GREET");
      setMood("excited");
      jumpTo({ x: window.innerWidth + 10, y: window.innerHeight * 0.45 });
      const s = sizeRef.current;
      const spot = use3dRef.current
        ? standOn(groundPlatform(), window.innerWidth * 0.6, s)
        : clampPoint({ x: window.innerWidth * 0.6, y: window.innerHeight * 0.38 }, s);
      const ok = await flyTo(spot, { speed: 380 });
      if (!ok || modeRef.current !== "greet") return;
      if (use3dRef.current) {
        platRef.current = groundPlatform();
        playGesture("wave");
      }
      setMood("happy");
      api.current.greet();
    },
    [force, send, jumpTo, flyTo, home, sfx, playGesture, busy, say, refreshAnchor]
  );

  useEffect(() => {
    if (!cstate || startedRef.current) return;
    if (cstate.enabled && body === "loading") return;
    startedRef.current = true;
    if (cstate.enabled) void appear(!cstate.onboarded);
  }, [cstate, appear, body]);

  useEffect(() => {
    if (body !== "loading" || !cstate?.enabled) return undefined;
    const t = window.setTimeout(() => setBody((b) => (b === "loading" ? "failed" : b)), BODY_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [body, cstate?.enabled]);

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
      const firstFinish = completed && !stateRef.current?.tours?.[t.id]?.done;
      update((s) => ({
        onboarded: true,
        tours: { ...s.tours, [t.id]: { step: 0, done: completed || !!s.tours[t.id]?.done } },
      }));
      send("END");
      setMood(completed ? "happy" : "neutral");
      say(line(completed ? "tourDone" : "tourSkip"));
      if (firstFinish) awardXp([["tour", 1]]);
    },
    [update, send, say, awardXp]
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
      if (el) pointAt(el.getBoundingClientRect());
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
    [endTour, ensureRoute, flyTo, setFacing, update, pointAt]
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
      pointAt(el.getBoundingClientRect());
      refreshAnchor();
      setRing(rectOf(el.getBoundingClientRect()));
      window.setTimeout(() => setRing(null), 2600);
    },
    [ensureRoute, flyTo, setFacing, refreshAnchor, pointAt]
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
      const fresh = loadFlashcardDeck();
      setBuiltinCards(fresh);
      const pool = [...nav.courses, builtinCourse(fresh)];
      const hasCards = (id) => pool.some((c) => c.id === id && (c.flashcards || []).length);
      const deck = deckId && hasCards(deckId) ? deckId : hasCards(nav.activeCourseId) ? nav.activeCourseId : "all";
      setBubble(null);
      setHelp(null);
      setRing(null);
      cancel();
      if (send("QUIZ") !== "quiz") return;
      quizRef.current = { sessionId: `quiz_${Date.now()}`, pending: new Map(), answered: 0, correct: 0, missStreak: 0 };
      if (stateRef.current?.ignored) update({ ignored: 0 });
      setQuizDeck(deck);
      setGlow(1);
      setMood("excited");
      const ok = await flyTo(dockPoint(), { speed: ENGAGED_SPEED });
      if (!ok || modeRef.current !== "quiz") return;
      setFacing(1);
      setAnchor({ h: "left", v: "below" });
      say(line("quizStart"));
    },
    [cancel, send, flyTo, dockPoint, setFacing, say, update]
  );

  const flashReaction = useCallback((kind) => {
    window.clearTimeout(reactTimerRef.current);
    setReact(kind);
    reactTimerRef.current = window.setTimeout(() => setReact(null), 650);
  }, []);

  useEffect(() => () => window.clearTimeout(reactTimerRef.current), []);

  const onQuizAnswer = useCallback(
    ({ card, grade, fields, correct, partial, streak, answer }) => {
      if (card.courseId !== BUILTIN_ID) {
        void window.studyHub?.db?.mastery?.update?.({
          flashcardUuid: cardKey(card),
          grade,
          easeFactor: fields.easeFactor,
          intervalDays: fields.intervalDays,
          repetitions: fields.repetitions,
          nextReview: fields.next_review,
          sessionId: quizRef.current.sessionId,
        });
      }
      const pending = quizRef.current.pending;
      if (!pending.has(card.courseId)) pending.set(card.courseId, new Map());
      pending.get(card.courseId).set(cardKey(card), fields);

      const run = quizRef.current;
      run.answered += 1;
      if (correct) {
        run.correct += 1;
        run.missStreak = 0;
      } else {
        run.missStreak += 1;
      }

      setGlow((g) => Math.max(0, Math.min(character.glowLevels, g + (correct ? 1 : -1))));
      setAnchor({ h: "left", v: "below" });
      if (correct) {
        setMood(streak >= 3 ? "excited" : "happy");
        flashReaction("bounce");
        sfx(streak >= 3 ? "streak" : "correct");
        if (partial) say(line("partial"));
        else say(line(streak >= 3 ? "correctStreak" : "correct", { streak }));
        if (streak > 0 && streak % 5 === 0) playGesture("kiss");
        else if (streak === 3) playGesture("wink");
      } else if (isFailing(run)) {
        setMood("stern");
        flashReaction("glitch");
        sfx("glitch");
        if (run.missStreak >= 2) playGesture("facepalm");
        const streakLine = run.missStreak >= 3 && Math.random() < 0.5;
        say(line(streakLine ? "wrongHarshStreak" : "wrongHarsh", { misses: run.missStreak }));
      } else {
        setMood("sad");
        flashReaction("droop");
        sfx("wrong");
        const text = String(answer);
        say(text.length > 32 ? line("wrongLong") : line("wrong", { answer: text }));
      }
    },
    [flashReaction, say, sfx, playGesture]
  );

  /** Called once per run: XP, high score, session log, and fresh SM-2 fields back into course state. */
  const onQuizFinish = useCallback(
    (summary) => {
      const cur = stateRef.current;
      const prevBest = cur.highScores?.[summary.deckId] || 0;
      const newHighScore = summary.mode === "streak" && summary.score > prevBest;
      const wasRampant = isRampant(cur);
      const award = awardXp(runAwards(summary), { announce: false }) || {
        xpGained: 0,
        level: levelForXp(cur.xp || 0),
        leveledUp: false,
        unlocked: null,
      };
      update((s) => ({
        runs: (s.runs || 0) + 1,
        highScores: newHighScore ? { ...s.highScores, [summary.deckId]: summary.score } : s.highScores,
      }));

      const endedAt = new Date().toISOString();
      const logUuids = [...new Set(summary.courseUuids.map((u) => (u === BUILTIN_ID ? null : u)))];
      for (const courseUuid of logUuids.length ? logUuids : [null]) {
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
      quizRef.current = { ...quizRef.current, sessionId: `quiz_${Date.now()}`, pending: new Map() };
      for (const [courseId, updates] of pending) {
        if (courseId === BUILTIN_ID) {
          const next = loadFlashcardDeck().map((c) => (updates.has(cardKey(c)) ? { ...c, ...updates.get(cardKey(c)) } : c));
          persistFlashcardDeck(next);
          setBuiltinCards(next);
          window.dispatchEvent(new CustomEvent("studyhub-flashcards-updated"));
          continue;
        }
        void onUpdateCourse?.(courseId, (course) => ({
          ...course,
          flashcards: (course.flashcards || []).map((c) => (updates.has(cardKey(c)) ? { ...c, ...updates.get(cardKey(c)) } : c)),
        }));
      }

      const tier = finishKey(summary.correct, summary.answered);
      lastTierRef.current = tier;
      setMood({ finishedGreat: "excited", finishedGood: "happy", finishedMeh: "neutral", finishedBad: "stern" }[tier]);
      if (tier === "finishedBad") {
        flashReaction("glitch");
        sfx("glitch");
        playGesture("facepalm");
      } else {
        if (tier === "finishedGreat" || (award.leveledUp && !wasRampant)) playGesture("kiss");
        sfx(tier === "finishedGreat" ? "streak" : "correct");
      }
      if (wasRampant && summary.answered) {
        setMood("happy");
        say(line("rampantRecover"));
      } else if (award.leveledUp && tier !== "finishedBad") {
        say(line(award.unlocked ? "levelUnlock" : "levelUp", { level: award.level, tint: award.unlocked?.toLowerCase() }));
      } else {
        say(line(tier, { correct: summary.correct, total: summary.answered }));
      }
      return {
        xpGained: award.xpGained,
        level: award.level,
        leveledUp: award.leveledUp,
        unlocked: award.unlocked ? `${award.unlocked} projection` : null,
        newHighScore,
      };
    },
    [update, onUpdateCourse, say, flashReaction, sfx, awardXp, playGesture]
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
            say(line("tourSkip"));
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

  /* ---------- clicking & dragging Nova ---------- */

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
    sfx("open");
    setMood(m === "sleep" ? "confused" : "neutral");
    refreshAnchor();
  }, [cancel, send, closeHelp, refreshAnchor, sfx]);

  /*
   * Held in 3D: she dangles from the grab point and swings on a damped spring driven by
   * the cursor's horizontal speed, then settles back upright after release.
   */
  const swingRef = useRef({ a: 0, v: 0, vx: 0, lastT: 0, raf: 0, held: false });
  const swingStep = useCallback(() => {
    const sw = swingRef.current;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sw.vx *= Math.exp(-dt * 6);
      const target = sw.held ? Math.max(-SWING_MAX, Math.min(SWING_MAX, sw.vx * SWING_PER_PX)) : 0;
      sw.v += (-(sw.a - target) * 70 - sw.v * 4.5) * dt;
      sw.a += sw.v * dt;
      const el = nodeRef.current?.querySelector(".sc-bob");
      if (!sw.held && Math.abs(sw.a) < 0.003 && Math.abs(sw.v) < 0.02) {
        sw.raf = 0;
        sw.a = 0;
        sw.v = 0;
        if (el) {
          el.style.transform = "";
          el.style.transformOrigin = "";
        }
        return;
      }
      if (el) el.style.transform = `rotate(${sw.a.toFixed(4)}rad)`;
      sw.raf = requestAnimationFrame(step);
    };
    sw.raf = requestAnimationFrame(step);
  }, []);
  const startSwing = useCallback(
    (ox, oy) => {
      const sw = swingRef.current;
      sw.held = true;
      sw.vx = 0;
      sw.lastT = 0;
      const el = nodeRef.current?.querySelector(".sc-bob");
      if (el) el.style.transformOrigin = `${Math.round(ox)}px ${Math.round(oy)}px`;
      if (!reduced && !sw.raf) swingStep();
    },
    [reduced, swingStep]
  );
  const releaseSwing = useCallback(() => {
    swingRef.current.held = false;
  }, []);
  useEffect(() => () => cancelAnimationFrame(swingRef.current.raf), []);

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
        if (use3dRef.current) {
          d.held = true;
          setBubble(null);
          setMood("stern");
          platRef.current = null;
          startSwing(d.ox, d.oy);
        }
      }
      const s = sizeRef.current;
      const p = clampPoint({ x: e.clientX - d.ox, y: e.clientY - d.oy }, s);
      if (d.held) {
        const sw = swingRef.current;
        const now = performance.now();
        const dt = Math.max(1, now - (sw.lastT || now - 16));
        sw.vx = sw.vx * 0.6 + ((p.x - posRef.current.x) / dt) * 1000 * 0.4;
        sw.lastT = now;
        const below = platformBelow(p, s);
        setDropMark({ x: p.x + s / 2, y: below.top });
      }
      jumpTo(p);
    },
    [cancel, jumpTo, posRef, startSwing]
  );

  const onPointerUp = useCallback(
    () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d?.moved) return;
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      setDragging(false);
      const m = modeRef.current;
      if (d.held) {
        setDropMark(null);
        releaseSwing();
        if (AUTONOMOUS.has(m) || m === "sleep") send("DROP");
        void api.current.fall({ dropped: true });
        return;
      }
      if (AUTONOMOUS.has(m) || m === "sleep" || m === "menu") {
        update({ home: { x: Math.round(posRef.current.x), y: Math.round(posRef.current.y) } });
        if (m !== "menu") send("DROP");
      }
      refreshAnchor();
    },
    [update, send, refreshAnchor, posRef, releaseSwing]
  );

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
      if (use3d) {
        const step = pickStroll(sizeRef.current, posRef.current, platRef.current);
        if (!step) {
          schedule(rand(cfg.idle));
          return;
        }
        send("WANDER");
        const ok = await flyTo(step, { speed: cfg.speed, walk: step.walk });
        if (!ok || modeRef.current !== "wander") return;
        platRef.current = step.plat;
        send(step.plat.el ? "PERCH" : "ARRIVE");
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
  }, [mode, enabled, movement, send, flyTo, posRef, use3d]);

  /*
   * 3D: keep her feet on something. She rides her platform when it scrolls, and falls to
   * whatever is below when it disappears (or when an engaged move left her mid-air).
   */
  api.current.fall = async ({ dropped = false } = {}) => {
    const s = sizeRef.current;
    const below = dropped ? platformBelow(posRef.current, s) : platformBelow(posRef.current, s, platRef.current?.el);
    if (modeRef.current === "sleep") send("WAKE");
    const ok = await dropTo(below.top - s);
    platRef.current = below;
    if (!ok) return;
    if (modeRef.current === "perch") send("DONE");
    playGesture("land");
    sfx("teleportIn");
    const now = Date.now();
    if (dropped) {
      if (AUTONOMOUS.has(modeRef.current)) {
        update({ home: { x: Math.round(posRef.current.x), y: Math.round(posRef.current.y) } });
        if (below.el && modeRef.current === "idle") send("PERCH");
      }
      if (Math.random() < 0.45) {
        lastLandQuipRef.current = now;
        setMood("stern");
        refreshAnchor();
        say(line("grabbed"));
      }
      return;
    }
    if (now - lastLandQuipRef.current > LAND_QUIP_COOLDOWN_MS && AUTONOMOUS.has(modeRef.current)) {
      lastLandQuipRef.current = now;
      setMood("stern");
      refreshAnchor();
      say(line("landed"));
    }
    window.setTimeout(async () => {
      if (modeRef.current !== "idle" || busy() || (stateRef.current?.movement || "normal") === "off") return;
      const step = pickStroll(sizeRef.current, posRef.current, platRef.current, { sameOnly: true });
      if (!step) return;
      send("WANDER");
      const walked = await flyTo(step, { speed: (MOVE[stateRef.current?.movement] || MOVE.normal).speed, walk: true });
      if (walked && modeRef.current === "wander") send("ARRIVE");
    }, WALK_OFF_MS);
  };

  const visibleNow = !!cstate?.enabled && mode !== "hidden";

  /*
   * 3D idle life: every 20-45s (scaled by movement) she yawns, looks around, gets bored or
   * stretches. Checked on a steady tick so it survives idle/wander/perch hops.
   */
  const bodyReady = use3d && body === "ready";
  useEffect(() => {
    if (!bodyReady || !visibleNow) return undefined;
    let due = Date.now() + idleGap(stateRef.current?.movement);
    let last = null;
    const id = window.setInterval(() => {
      const now = Date.now();
      if (now < Math.max(due, lastGestureAtRef.current + 8000)) return;
      const m = modeRef.current;
      if (document.hidden || (m !== "idle" && m !== "perch") || busy() || bubbleRef.current || dragRef.current) return;
      const part = dayPart();
      const name = seatRef.current ? "sitYawn" : pickIdleGesture({ part, bored: now - lastActivityRef.current > BORED_AFTER_MS, last });
      last = name;
      playGesture(name, { idle: true });
      due = now + idleGap(stateRef.current?.movement);
      if ((name === "yawn" || name === "sitYawn") && part === "late" && now - lastLateQuipRef.current > LATE_QUIP_COOLDOWN_MS) {
        lastLateQuipRef.current = now;
        window.setTimeout(() => {
          const mm = modeRef.current;
          if ((mm !== "idle" && mm !== "perch") || bubbleRef.current || busy()) return;
          setMood("neutral");
          refreshAnchor();
          say(line("lateNight", { time: clockLabel() }));
        }, 5200);
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [bodyReady, visibleNow, busy, playGesture, refreshAnchor, say]);

  const prevModeRef = useRef(mode);
  useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = mode;
    if (bodyReady && prev === "sleep" && mode === "idle") playGesture("stretch", { idle: true });
  }, [mode, bodyReady, playGesture]);
  useEffect(() => {
    if (!use3d || !visibleNow) return undefined;
    let raf = 0;
    const check = () => {
      raf = 0;
      const m = modeRef.current;
      const grounded = AUTONOMOUS.has(m) || m === "sleep";
      if (!(grounded || m === "menu" || m === "nudge") || dragRef.current?.moved || busy()) return;
      const s = sizeRef.current;
      const pos = posRef.current;
      const plat = platRef.current;
      const cx = pos.x + s / 2;
      if (plat && Math.abs(plat.top - (pos.y + s)) <= 2) {
        const live = livePlatform(plat, s);
        if (live && cx >= live.left - 4 && cx <= live.right + 4) {
          if (Math.abs(live.top - plat.top) > 0.5) jumpTo({ x: pos.x, y: live.top - s });
          platRef.current = live;
          return;
        }
        if (grounded) void api.current.fall();
        return;
      }
      const here = platformAt(pos, s);
      if (here) {
        platRef.current = here;
        return;
      }
      if (grounded) void api.current.fall();
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    const id = window.setInterval(schedule, 400);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(id);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [use3d, visibleNow, busy, jumpTo, posRef]);

  useEffect(() => {
    if (mode !== "perch") return undefined;
    const t = window.setTimeout(() => send("DONE"), rand([10000, 30000]));
    return () => window.clearTimeout(t);
  }, [mode, send]);

  /* 3D: sometimes she sits on the edge of the card she perched on; cold when you're slipping. */
  useEffect(() => {
    if (mode !== "perch" || !bodyReady) return undefined;
    const t = window.setTimeout(() => {
      if (modeRef.current !== "perch" || busy() || dragRef.current || Math.random() > SIT_CHANCE) return;
      const slipping = isRampant(stateRef.current) || lastTierRef.current === "finishedBad" || lastTierRef.current === "finishedMeh";
      setSeat(slipping ? "cold" : "playful");
    }, rand(SIT_DELAY_MS));
    return () => {
      window.clearTimeout(t);
      setSeat(null);
    };
  }, [mode, bodyReady, busy]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (AUTONOMOUS.has(modeRef.current) && Date.now() - lastActivityRef.current > sleepAfterMs(dayPart())) {
        cancel();
        setBubble(null);
        send("SLEEP");
      }
    }, 10000);
    return () => window.clearInterval(id);
  }, [cancel, send]);

  /* Back after a while away from the window: she wakes up and waves. */
  useEffect(() => {
    if (!visibleNow) return undefined;
    let awayAt = 0;
    const leave = () => {
      if (!awayAt) awayAt = Date.now();
    };
    const back = () => {
      if (document.hidden || !awayAt) return;
      const away = Date.now() - awayAt;
      awayAt = 0;
      const m = modeRef.current;
      if (away < RETURN_AWAY_MS || !(AUTONOMOUS.has(m) || m === "sleep") || busy() || dragRef.current) return;
      if (m === "sleep") send("WAKE");
      lastActivityRef.current = Date.now();
      window.setTimeout(() => {
        const mm = modeRef.current;
        if (!AUTONOMOUS.has(mm) || busy()) return;
        playGesture("wave");
        if (!bubbleRef.current) {
          setMood("happy");
          refreshAnchor();
          say(line("welcomeBack"));
        }
      }, 600);
    };
    const onVis = () => (document.hidden ? leave() : back());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
    };
  }, [visibleNow, busy, send, playGesture, refreshAnchor, say]);

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
    const best = [...navRef.current.courses, builtinCourse(loadFlashcardDeck())]
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
    const rampant = isRampant(cur);
    setMood(rampant ? "stern" : "happy");
    if (rampant) {
      flashReaction("glitch");
      sfx("glitch");
    }
    refreshAnchor();
    n.answered = false;
    const course = best.c.id === BUILTIN_ID ? BUILTIN_NAME : shortCourse(best.c.courseCode || best.c.name) || best.c.name;
    say(line(rampant ? "dueRampant" : "due", { count: best.due, course }), {
      sticky: true,
      nudge: true,
      actions: [
        {
          label: "QUIZ ME",
          primary: true,
          onClick: () => {
            n.answered = true;
            startQuiz(best.c.id);
          },
        },
        {
          label: "NOT NOW",
          onClick: () => {
            n.answered = true;
            n.cooldown *= 2;
            update((s) => ({ ignored: (s.ignored || 0) + 1 }));
            send("CLOSE");
            setMood("neutral");
            say(line("dismissed"));
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
      send("CLOSE");
      setMood("neutral");
      if (!nudgeRef.current.answered) {
        update((s) => ({ ignored: (s.ignored || 0) + 1 }));
        say(line("ignoredNudge"));
        playGesture("taunt");
      } else {
        setBubble(null);
      }
    }, NUDGE_SHOW_MS);
    return () => window.clearTimeout(t);
  }, [mode, send, update, say, playGesture]);

  /* Drill cards and practice tests elsewhere in the app: XP, plus the odd comment. */
  useEffect(() => {
    const onStudy = (e) => {
      const d = e.detail || {};
      const m = modeRef.current;
      const canTalk = !!stateRef.current?.enabled && (AUTONOMOUS.has(m) || m === "sleep");
      if (canTalk && m === "sleep") send("WAKE");
      if (d.type === "card") {
        const r = drillRef.current;
        if (d.correct) {
          r.known += 1;
          r.missed = 0;
        } else {
          r.missed += 1;
          r.known = 0;
        }
        const res = awardXp([[d.correct ? "cardKnown" : "cardAgain", 1]], { announce: canTalk });
        if (!canTalk || res?.spoke) return;
        if (res?.daily) {
          setMood("happy");
          say(line("dailyBonus", { xp: XP_AWARDS.daily.xp }));
        } else if (d.correct && r.known % 5 === 0) {
          setMood("excited");
          flashReaction("bounce");
          sfx("streak");
          say(line("drillStreak", { streak: r.known }));
          playGesture("wink");
        } else if (!d.correct && r.missed === 3) {
          setMood("stern");
          flashReaction("glitch");
          sfx("glitch");
          say(line("drillHarsh"));
          playGesture("facepalm");
        }
        return;
      }
      if (d.type === "test" && d.total) {
        const res = awardXp([["testCorrect", d.correct], ["testDone", 1]], { announce: canTalk });
        if (!canTalk || res?.spoke) return;
        const tier = finishKey(d.correct, d.total);
        setMood({ finishedGreat: "excited", finishedGood: "happy", finishedMeh: "neutral", finishedBad: "stern" }[tier]);
        if (tier === "finishedBad") {
          flashReaction("glitch");
          playGesture("facepalm");
        } else if (tier === "finishedGreat") {
          playGesture("kiss");
        }
        say(line(tier, { correct: d.correct, total: d.total }));
      }
    };
    window.addEventListener(STUDY_EVENT, onStudy);
    return () => window.removeEventListener(STUDY_EVENT, onStudy);
  }, [awardXp, say, sfx, flashReaction, send, playGesture]);

  /* Rampant: now and then she mutters and glitches while idle. */
  const rampantNow = !!cstate && isRampant(cstate, now);
  useEffect(() => {
    if (!rampantNow || !enabled) {
      delete document.documentElement.dataset.novaRampant;
      return undefined;
    }
    document.documentElement.dataset.novaRampant = "";
    let timer = 0;
    const schedule = (ms) => {
      timer = window.setTimeout(tick, ms);
    };
    const tick = () => {
      const m = modeRef.current;
      if (!document.hidden && (m === "idle" || m === "perch") && Date.now() - lastInputRef.current > TYPING_PAUSE_MS) {
        setMood("stern");
        flashReaction("glitch");
        sfx("glitch");
        refreshAnchor();
        say(line("rampant"));
      }
      schedule(rand(RAMPANT_MUTTER_MS));
    };
    schedule(20000);
    return () => {
      window.clearTimeout(timer);
      delete document.documentElement.dataset.novaRampant;
    };
  }, [rampantNow, enabled, flashReaction, sfx, refreshAnchor, say]);

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
      if (use3dRef.current || modeRef.current !== "wander" || now - lastDriftRef.current < 3000) return;
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
    const spot = use3dRef.current
      ? standOn(groundPlatform(), window.innerWidth * 0.55, s)
      : clampPoint({ x: window.innerWidth * 0.55, y: window.innerHeight * 0.42 }, s);
    const ok = await flyTo(spot, { speed: ENGAGED_SPEED });
    if (!ok) return;
    if (use3dRef.current) {
      platRef.current = groundPlatform();
      playGesture("wave");
    }
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

  const speech = mode === "tour" ? (tour?.ready ? tour.step.text : "") : bubble?.text || "";
  useEffect(() => {
    setTalkUntil(speech ? performance.now() + 300 + speech.length * TALK_MS_PER_CHAR : 0);
  }, [speech, bubble]);

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
  const tint = resolveTint(cstate);
  const level = levelForXp(cstate.xp || 0);
  const shownMood = mode === "sleep" ? "sleep" : mood;
  const showRampant = rampantNow && mode !== "quiz" && mode !== "tour" && mode !== "help" && mode !== "sleep";
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
    const tone = showRampant ? "rampant" : mood === "stern" ? "harsh" : mood === "excited" ? "warm" : null;
    bubbleNode = (
      <SpeechBubble text={bubble.text} title={bubble.title} actions={bubble.actions} h={anchor.h} v={anchor.v} tone={tone} />
    );
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
      {dropMark ? <span className="nv-drop" style={{ left: dropMark.x, top: dropMark.y }} aria-hidden /> : null}
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
          use3d ? "sc-scout--3d" : "",
          use3d && body === "loading" ? "sc-scout--loading" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ width: size, height: size }}
      >
        <button
          type="button"
          className="sc-scout-btn"
          aria-label="Nova, study companion. Open menu"
          aria-haspopup="menu"
          aria-expanded={mode === "menu"}
          onClick={onScoutClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="sc-bob">
            <span className="sc-fx">
              {use3d ? (
                cstate.enabled ? (
                <Suspense fallback={null}>
                  <Nova3D
                    size={size}
                    facing={facing}
                    gait={gait === "walk" || gait === "fall" ? gait : null}
                    speed={(MOVE[movement] || MOVE.normal).speed}
                    mood={shownMood}
                    talkUntil={talkUntil}
                    rampant={showRampant}
                    glow={glow}
                    asleep={mode === "sleep"}
                    attend={ATTEND_MODES.has(mode)}
                    held={dragging}
                    seat={mode === "perch" ? seat : null}
                    glitch={react === "glitch" || react === "droop"}
                    tint={tint}
                    visible={visible}
                    gesture={gesture}
                    onReady={() => setBody("ready")}
                    onFail={() => setBody("failed")}
                  />
                </Suspense>
                ) : null
              ) : (
                <NovaSprite
                  mood={shownMood}
                  glow={glow}
                  facing={facing}
                  flying={flying || dragging}
                  glitch={react === "glitch" || react === "droop"}
                  rampant={showRampant}
                  tint={tint}
                  size={size}
                />
              )}
            </span>
          </span>
          {use3d ? <span className="sc-hit" /> : null}
        </button>
        {visible
          ? pops.map((p) => (
              <span key={p.id} className="sc-xp-pop mono" aria-hidden>
                {p.text}
              </span>
            ))
          : null}
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
                <span>NOVA · LV {level}</span>
                <button
                  type="button"
                  className="sc-menu-gear mono"
                  onClick={() => {
                    send("CLOSE");
                    setSettingsOpen(true);
                  }}
                  aria-label="Nova settings"
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
          courses={quizCourses}
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
          onResetStats={() => update({ xp: 0, highScores: {}, runs: 0, ignored: 0, lastStudyAt: new Date().toISOString() })}
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
