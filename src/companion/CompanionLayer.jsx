import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "../shell/motion.js";
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
import { courseStore } from "../db/courseStore.js";
import { cardKey, runAwards } from "./lightRun.js";
import { STUDY_EVENT } from "./studyEvents.js";
import { BORED_AFTER_MS, clockLabel, dayPart, idleGap, pickIdleGesture } from "./idleDirector.js";
import { WAKE_DENIAL_CHANCE, dueStage, mayPeek, pickProp } from "./idleStages.js";
import { buildDoodle, doodleBox, layoutDoodle, pickDoodle } from "./doodles.js";
import { DoodleTrail } from "./DoodleTrail.jsx";
import { QuizPanel } from "./QuizPanel.jsx";
import { transition, AUTONOMOUS } from "./machine.js";
import {
  clampPoint,
  coversContent,
  defaultHome,
  findDoodleSpot,
  findPeekSpot,
  findTarget,
  groundPlatform,
  livePlatform,
  pickRestEdge,
  pickStroll,
  pickWaypoint,
  platformAt,
  platformBelow,
  pointBeside,
  seatClear,
  standOn,
  waitForTarget,
} from "./safeZones.js";
import { useCompanionMotion } from "./useCompanionMotion.js";
import { isAtSpot, mayAct, maySpeak, nextCheckMs } from "./attention.js";
import { useCompanionMemory } from "./memory/useCompanionMemory.js";
import { maybeRephrase } from "./memory/rephrase.js";
import { MEMORY_LINES, pickLine } from "./memory/lines.js";
import { NameForm } from "./NameForm.jsx";
import { BirthdayForm, MONTHS, NeverBugForm } from "./OnboardForms.jsx";
import { openCourseView } from "../features/today/courseView.js";
import { blockedWhen } from "../features/today/blocked.js";
import { NovaSprite } from "./NovaSprite.jsx";
import { playSound } from "./novaSound.js";
import { SpeechBubble } from "./SpeechBubble.jsx";
import { RadialMenu } from "./RadialMenu.jsx";
import { PinNote, Spotlight } from "./Spotlight.jsx";
import { createStage, playScene } from "../nova/stage.js";
import { PANEL_LABELS, canPlace, useWorkspace, workspace } from "../nova/workspace.js";
import { NEXT_SCENE, dueBetween } from "../nova/commands.js";
import { formatPct, neededScores } from "../features/today/priority.js";
import { arrangeWorkspace } from "../nova/scenes/arrange.js";
import { stageDemo } from "../nova/scenes/stageDemo.js";
import { onScreen } from "../nova/anchors.js";
import { setVoiceLevel, setVoiceTone } from "../nova/voice.js";
import { INTENTS, choose, events as directorEvents, onWake, ran, snooze, take, timing, today as directorToday } from "../nova/director.js";
import { current, feel, rapportTier, tierAtLeast, tone as moodTone } from "../nova/mood.js";
import { callbackFor } from "./memory/derive.js";
import { sceneFrom } from "../nova/scenePlayer.js";
import briefingScene from "../nova/scenes/briefing.json";
import { HelpBubble } from "./HelpBubble.jsx";
import { CompanionSettings } from "./CompanionSettings.jsx";
import firstRun from "./tours/first-run.json";
import courseTools from "./tours/course-tools.json";
import { paletteOpen } from "../lib/hotkeys.js";

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
const BUBBLE_W = 290;
const QUIZ_W = 380;
const NUDGE_FIRST_MS = 90 * 1000;
const NUDGE_COOLDOWN_MS = 10 * 60 * 1000;
const NUDGE_MAX_PER_SESSION = 4;
const NUDGE_SHOW_MS = 8000;
const DIRECTOR_TICK_MS = 3000;
/** Onboarding: how long her reply to an answer stays up before the next question. */
const ONBOARD_BEAT_MS = 1800;
/** A grade jump this many points is an episode she'll bring up later. */
const EPISODE_GRADE_JUMP = 3;
const RAMPANT_MUTTER_MS = [90 * 1000, 200 * 1000];
const XP_POP_MS = 1500;
/** The built-in OM 300 course id; its deck lives in localStorage, not SQLite. */
const BUILTIN_ID = "builtin";
const BUILTIN_NAME = "OM 300";

const builtinCourse = (flashcards) => ({ id: BUILTIN_ID, uuid: BUILTIN_ID, name: BUILTIN_NAME, flashcards });

/** Home window on Today: how big she may grow, how long she stays, and how many stops she makes before heading back. */
const HOME_SCALE = [0.6, 2.6];
const HOME_STAY_MS = [40 * 1000, 90 * 1000];
const HOME_AWAY_STOPS = [2, 4];
const HOME_RETURN_DELAY_MS = 600;
const GROW_MS = 420;
/** Modes she can hold while standing big in her home window; anything else walks her out at normal size. */
const HOME_MODES = new Set(["idle", "menu", "sleep", "nudge", "perch", "play"]);
/** Idle stages the portrait sprite can't do (no arms, no props). */
const SPRITE_SKIP = new Set(["fidget", "prop"]);
const READ_MS = [35 * 1000, 60 * 1000];
/** Sync portal: how long it lingers after the result, and when to give up on a sync that went quiet. */
/** Resting: how often a wander turns into sitting on the nearest panel edge, and for how long. */
const REST_CHANCE = 0.7;
const REST_MS = [30 * 1000, 60 * 1000];
const SYNC_CLOSE_MS = 700;
const SYNC_STALE_MS = 60 * 1000;
const DROWSY_MS = 16 * 1000;
/** Clicks: this many inside the window counts as spam; then clicks are ignored for a beat. */
const SPAM_CLICKS = 4;
const SPAM_WINDOW_MS = 3000;
const SPAM_LOCK_MS = 1500;
const MENU_LINE_MS = 2600;
/** After a drop she stays put this long (so her line can land), then walks back to her spot. */
const BACK_AFTER_DROP_MS = 1600;
const PICKUP_LINE_CHANCE = 0.5;
const DROP_LINES = { task: "dropTask", exam: "dropExam", gauge: "dropGauge" };
const BURST_MS = 900;
/** Modes that can take her away from her spot on purpose. */
const ENGAGED_MODES = new Set(["tour", "help", "quiz", "nudge", "greet", "brief"]);

const rand = ([a, b]) => a + Math.random() * (b - a);
const randInt = ([a, b]) => Math.floor(a + Math.random() * (b - a + 1));
const rectOf = (r) => ({ left: r.left, top: r.top, width: r.width, height: r.height });
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const subscribeVisibility = (cb) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
const pageShown = () => !document.hidden;

/** The Today home window's geometry and the size she takes inside it, or null when it isn't on screen. */
function homeGeometry(baseSize) {
  const el = document.querySelector("[data-nova-home]");
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 40 || rect.bottom < 0 || rect.top > window.innerHeight) return null;
  const floorTop = (el.querySelector("[data-nova-floor]") || el).getBoundingClientRect().top;
  const room = Math.min((floorTop - rect.top - 8) * 0.92, rect.width * 1.1);
  const size = Math.round(Math.max(baseSize * HOME_SCALE[0], Math.min(baseSize * HOME_SCALE[1], room)));
  return { el, rect, floorTop, cx: rect.left + rect.width / 2, size };
}

const homeSpot = (g, size) => ({ x: g.cx - size / 2, y: g.floorTop - size });

/** Home geometry when a box at `p` (size `s`) has its center over the home window. */
function overHome(p, s, baseSize) {
  const g = homeGeometry(baseSize);
  if (!g) return null;
  const cx = p.x + s / 2;
  const cy = p.y + s / 2;
  const r = g.rect;
  return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom ? g : null;
}

/** The Today task, exam or gauge under a screen point, or null. */
function dropTargetAt(x, y) {
  for (const el of document.elementsFromPoint(x, y)) {
    const t = el.closest?.("[data-nova-drop]");
    if (t) return t;
  }
  return null;
}

/** Focus mode countdown; clicking it ends focus early. */
function FocusPill({ until, onStop }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, Math.round((until - Date.now()) / 1000));
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <button type="button" className="sc-focus-pill mono" onClick={onStop} title="End focus early" aria-label={`Focus mode, ${mmss} left. Click to stop.`}>
      FOCUS {mmss}
    </button>
  );
}

/** Lets the home window dim its core while she stands in it. */
function markStage(on) {
  const el = document.querySelector("[data-nova-home]");
  if (!el) return;
  if (on) el.dataset.housed = "true";
  else delete el.dataset.housed;
}

/**
 * Nova's overlay. Lives above the app in a portal; only Nova, her bubbles and menus take
 * pointer events. Mounted by StudyHubApp once the launch splash is gone.
 */
export default function CompanionLayer({ courses = [], activeCourseId = null, onHub = true, hubView = "today", onGoHub, onOpenCourse, onUpdateCourse }) {
  const [cstate, setCstate] = useState(null);
  const stateRef = useRef(null);
  const [mode, setMode] = useState("hidden");
  const modeRef = useRef("hidden");
  const [mood, setMood] = useState("neutral");
  const [bubble, setBubble] = useState(null);
  const [anchor, setAnchor] = useState({ h: "left", v: "above" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tour, setTour] = useState(null);
  /** Highlights and pinned notes on page elements: `{ key, el, style, note }`. */
  const [marks, setMarks] = useState([]);
  const [, setMarkTick] = useState(0);
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
  /** What a drop would start (a Today task, exam or gauge), ringed while she's held over it. */
  const [dropTarget, setDropTarget] = useState(null);
  const [menuLine, setMenuLine] = useState(null);
  /** Which ring of her click menu is showing: the main options or the Rearrange layouts. */
  const [menuPage, setMenuPage] = useState("main");
  useWorkspace();
  const clicksRef = useRef([]);
  const spamUntilRef = useRef(0);
  const [burst, setBurst] = useState(0);
  const [talkUntil, setTalkUntil] = useState(0);
  /** The platform the 3D body stands on: `{ el }` (el null = window bottom), or null mid-air. */
  const platRef = useRef(null);
  const lastLandQuipRef = useRef(0);
  const lastLateQuipRef = useRef(0);
  const [seat, setSeat] = useState(null);
  const seatRef = useRef(null);
  seatRef.current = seat;
  /* Idle life: the running activity (`{ kind, aborted, moving }`), what ran this idle stretch, and what the body shows. */
  const activityRef = useRef(null);
  const stagesDoneRef = useRef(new Set());
  const lastPeekRef = useRef(0);
  const [activity, setActivity] = useState(null);
  const [idleLie, setIdleLie] = useState(null);
  const [drowsy, setDrowsy] = useState(false);
  const [glance, setGlance] = useState(null);
  const [doodle, setDoodle] = useState(null);
  const penRef = useRef(null);
  const doodleIdRef = useRef(0);
  const doodleDrawnRef = useRef(null);
  const lastDoodleRef = useRef(null);
  const peekClipRef = useRef(null);
  /** The input that woke her, so the "I wasn't asleep" line only follows a mouse or touch. */
  const wokeByRef = useRef(null);
  /** Blackboard sync in progress: `{ phase: "open" | "ok" | "fail", step }`, drawn as a portal beside her. */
  const [sync, setSync] = useState(null);
  const syncRef = useRef(null);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const lastTierRef = useRef(null);
  const bubbleRef = useRef(null);
  bubbleRef.current = bubble;

  const nodeRef = useRef(null);
  const growRef = useRef(null);
  const reduced = useReducedMotion();
  /** Standing big inside the Today home window. `homeSize` is her size there. */
  const [housed, setHoused] = useState(false);
  const housedRef = useRef(false);
  const [homeSize, setHomeSize] = useState(null);
  const awayRef = useRef({ stops: 0, goal: randInt(HOME_AWAY_STOPS) });
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

  const baseSize = Math.round((use3d ? SIZE_3D : character.size) * (cstate?.scale || 1));
  const baseSizeRef = useRef(baseSize);
  baseSizeRef.current = baseSize;
  const size = housed && homeSize ? homeSize : baseSize;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const quizCourses = useMemo(
    () => (builtinCards.length ? [...courses, builtinCourse(builtinCards)] : courses),
    [courses, builtinCards]
  );
  const stageActive = onHub && hubView === "today";
  const navRef = useRef({});
  navRef.current = { courses, quizCourses, activeCourseId, onHub, onGoHub, onOpenCourse, stageActive };

  const lastActivityRef = useRef(Date.now());
  /** Last pointer, key, wheel or touch input; she only acts on her own after IDLE_START_MS of none. */
  const lastInputRef = useRef(Date.now());
  /** Last flashcard answered anywhere in the app; mid-session she stays still and silent. */
  const lastStudyRef = useRef(0);
  /** Last key or scroll: she holds her memory lines while the user is typing or reading. */
  const lastTypingRef = useRef(0);
  /** Mid-visit news waits until the launch line (or first-launch hello) is out of the way. */
  const openerDoneRef = useRef(false);
  /** She has wandered off her spot and should go back on the next input. */
  const awayFromSpotRef = useRef(false);
  const returningRef = useRef(false);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  /** Focus mode ends at this time (0 = off); she stays quiet like quiet mode until then. */
  const focusRef = useRef(0);
  const focusMinutesRef = useRef(25);
  const quietNow = () => !!stateRef.current?.quiet || focusRef.current > Date.now();
  const canAct = useCallback(
    () =>
      mayAct({
        lastInput: lastInputRef.current,
        lastStudy: lastStudyRef.current,
        quiet: quietNow(),
        reduced: reducedRef.current,
        hidden: document.hidden,
      }),
    []
  );
  const lastDriftRef = useRef(0);
  const tourRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const startedRef = useRef(false);
  /** Latest-closure handlers for timers and global listeners. */
  const api = useRef({});
  /** The Stage (see src/nova/stage.js). Scenes run in "brief" mode; leaving it aborts them. */
  const stageRef = useRef(null);
  if (!stageRef.current) {
    const via = (k) => (...args) => api.current.stageDeps[k](...args);
    const keys = ["stop", "walkTo", "lookAt", "pointAt", "mark", "clearMarks", "scrollTo", "openTab", "focus", "unfocus", "say", "line", "mood", "gesture", "layout", "place", "remember", "inUse"];
    stageRef.current = createStage(Object.fromEntries(keys.map((k) => [k, via(k)])));
  }
  const focusedRef = useRef(null);
  /** The utterance a scene is speaking aloud, so aborting the scene can silence it. */
  const speakingRef = useRef(null);
  const memory = useCompanionMemory({
    enabled: !!cstate?.enabled,
    onNews: (news) => api.current.onMemoryNews?.(news),
  });
  const quizRef = useRef({ sessionId: null, pending: new Map(), answered: 0, correct: 0, missStreak: 0 });
  const nudgeRef = useRef({ mountedAt: Date.now(), last: 0, cooldown: NUDGE_COOLDOWN_MS, count: 0 });
  const reactTimerRef = useRef(0);

  /* ---------- state plumbing ---------- */

  const send = useCallback((event) => {
    const next = transition(modeRef.current, event);
    if (next !== modeRef.current) {
      if (modeRef.current === "brief") stageRef.current.abort();
      if (housedRef.current && !HOME_MODES.has(next)) api.current.leaveHome?.();
      /* A tour, quiz, help answer or nudge may have taken her elsewhere; the next input brings her back. */
      if (AUTONOMOUS.has(next) && ENGAGED_MODES.has(modeRef.current) && !housedRef.current) awayFromSpotRef.current = true;
      modeRef.current = next;
      setMode(next);
    }
    return next;
  }, []);

  const force = useCallback((next) => {
    if (modeRef.current === "brief" && next !== "brief") stageRef.current.abort();
    if (housedRef.current && !HOME_MODES.has(next)) api.current.leaveHome?.();
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

  /** Something happened that moves her feelings (see nova/mood.js); her lines follow the new tone. */
  const feelIt = useCallback(
    (event) => {
      update((s) => ({ feelings: feel(s.feelings, event) }));
      setVoiceTone(moodTone(stateRef.current?.feelings));
    },
    [update]
  );

  const say = useCallback((text, opts = {}) => setBubble(text || opts.actions ? { text, ...opts } : null), []);

  const home = useCallback(() => {
    const s = sizeRef.current;
    const p = clampPoint(stateRef.current?.home || defaultHome(s), s);
    if (!use3dRef.current) return p;
    return standOn(platformBelow(p, s), p.x + s / 2, s);
  }, []);

  /* ---------- home window on Today: big inside it, normal size everywhere else ---------- */

  /** Snap into the home window at full home size. False when the window isn't on screen. */
  const houseAt = useCallback(() => {
    if (!navRef.current.stageActive) return false;
    const g = homeGeometry(baseSizeRef.current);
    if (!g) return false;
    housedRef.current = true;
    sizeRef.current = g.size;
    platRef.current = null;
    setHomeSize(g.size);
    setHoused(true);
    jumpTo(homeSpot(g, g.size));
    markStage(true);
    awayRef.current = { stops: 0, goal: randInt(HOME_AWAY_STOPS) };
    awayFromSpotRef.current = false;
    return true;
  }, [jumpTo]);

  /** Shrink back to normal size where she stands, feet and center kept in place. */
  const leaveHome = useCallback(() => {
    if (!housedRef.current) return;
    const big = sizeRef.current;
    const s = baseSizeRef.current;
    const p = posRef.current;
    housedRef.current = false;
    sizeRef.current = s;
    setHoused(false);
    markStage(false);
    jumpTo({ x: p.x + (big - s) / 2, y: p.y + big - s });
  }, [jumpTo, posRef]);
  api.current.leaveHome = leaveHome;

  /**
   * Teleport back into the home window and grow. Resolves null when there's no home window to
   * go to (callers fall back to the usual spot), false when something interrupted the trip.
   */
  api.current.goHome = async ({ speed = ENGAGED_SPEED } = {}) => {
    if (housedRef.current) return true;
    const g = navRef.current.stageActive ? homeGeometry(baseSizeRef.current) : null;
    if (!g) return null;
    if (modeRef.current !== "wander" && send("WANDER") !== "wander") return false;
    const ok = await flyTo(homeSpot(g, sizeRef.current), { speed });
    if (!ok || modeRef.current !== "wander") return false;
    if (!houseAt()) return false;
    send("ARRIVE");
    return true;
  };
  const returnHome = useCallback(
    async (speed) => {
      const res = await api.current.goHome({ speed });
      if (res === null) await flyTo(home(), { speed });
    },
    [flyTo, home]
  );

  /**
   * Input while she's off her spot sends her straight back: the home window on Today,
   * her saved spot everywhere else. Only interrupts her own wandering, never an engaged mode.
   */
  api.current.backToSpot = () => {
    const m = modeRef.current;
    if (!awayFromSpotRef.current || returningRef.current || dragRef.current || activityRef.current) return;
    if (!(AUTONOMOUS.has(m) || m === "sleep")) return;
    returningRef.current = true;
    cancel();
    setBubble(null);
    if (m === "sleep") send("WAKE");
    const done = () => {
      returningRef.current = false;
      awayFromSpotRef.current = false;
    };
    if (navRef.current.stageActive && homeGeometry(baseSizeRef.current)) {
      void api.current.goHome({ speed: ENGAGED_SPEED }).finally(done);
      return;
    }
    const spot = home();
    if (isAtSpot(posRef.current, spot)) {
      if (modeRef.current === "wander") send("ARRIVE");
      done();
      return;
    }
    if (modeRef.current !== "wander") send("WANDER");
    void flyTo(spot, { speed: ENGAGED_SPEED })
      .then((ok) => {
        if (ok && modeRef.current === "wander") send("ARRIVE");
      })
      .finally(done);
  };

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
      next = { ...next, feelings: feel(next.feelings, "returned") };
      if (dayPart() === "late") next.feelings = feel(next.feelings, "lateNight");
      setVoiceTone(moodTone(next.feelings));
      stateRef.current = next;
      setCstate(next);
      saveCompanionState(next);
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
        if (!houseAt()) jumpTo(home());
        sfx("appear");
        window.setTimeout(() => void api.current.sayOpener?.(), DAY_HELLO_DELAY_MS);
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
    [force, send, jumpTo, flyTo, home, houseAt, sfx, playGesture, busy, say, refreshAnchor]
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
    if (route === "hub" || route?.startsWith("hub:")) {
      nav.onGoHub?.(route === "hub" ? "today" : route.slice(4));
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
      setMarks([]);
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

  /* Keep highlights and pinned notes on their elements through resizes and scrolling. */
  const hasMarks = marks.length > 0;
  useEffect(() => {
    if (!hasMarks) return undefined;
    let raf = 0;
    const onChange = () => {
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        setMarkTick((n) => n + 1);
      });
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [hasMarks]);

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
    setMarks([]);
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
      setMarks([{ key: "help", el, style: null }]);
      window.setTimeout(() => setMarks((list) => list.filter((m) => m.key !== "help")), 2600);
    },
    [ensureRoute, flyTo, setFacing, refreshAnchor, pointAt]
  );

  /* ---------- menu actions ---------- */

  /** A deliberate sit (resting on a panel edge) holds until this time. */
  const sitHoldRef = useRef(0);

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
      setMarks([]);
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
        void courseStore.logStudySession({
          courseUuid,
          kind: "quiz",
          startedAt: summary.startedAt,
          endedAt,
          reviewed: summary.answered,
          correct: summary.correct,
          incorrect: summary.answered - summary.correct,
          bestCombo: summary.best,
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
    void returnHome(220);
  }, [send, returnHome]);

  const contextualTour = useCallback(() => {
    const nav = navRef.current;
    const inUserCourse = nav.activeCourseId && nav.courses.some((c) => c.id === nav.activeCourseId);
    startTour(inUserCourse ? "course-tools" : "first-run");
  }, [startTour]);

  /** Asks once what to call them. `intro` is her first-launch hello; `after` runs once they answer or skip. */
  api.current.askName = ({ intro = false, after = null } = {}) => {
    update({ askedName: true });
    const ask = intro ? { text: MEMORY_LINES.introName[0] } : pickLine("askName", {});
    const done = () => {
      if (!stateRef.current?.askedMore) api.current.askMore(after);
      else if (after) after();
      else setBubble(null);
    };
    setMood("happy");
    refreshAnchor();
    say(ask.text, {
      sticky: true,
      form: (
        <NameForm
          onSave={(name) => {
            void memory.remember("name", { name });
            say(pickLine("nameSaved", { name }).text, { sticky: true });
            window.setTimeout(done, ONBOARD_BEAT_MS);
          }}
          onSkip={done}
        />
      ),
    });
  };

  /** The rest of getting to know them: birthday, then what to leave alone. Asked once. */
  api.current.askMore = (after = null) => {
    update({ askedMore: true });
    const finish = () => (after ? after() : setBubble(null));
    const neverBug = () =>
      say(pickLine("askNeverBug", {}).text, {
        sticky: true,
        form: (
          <NeverBugForm
            initial={memory.fact("never_bug")?.intents || []}
            onSave={(intents) => {
              void memory.remember("never_bug", { intents });
              say(pickLine(intents.length ? "neverBugSaved" : "neverBugNone", {}).text, { sticky: true });
              window.setTimeout(finish, ONBOARD_BEAT_MS);
            }}
          />
        ),
      });
    setMood("happy");
    refreshAnchor();
    say(pickLine("askBirthday", {}).text, {
      sticky: true,
      form: (
        <BirthdayForm
          onSave={(b) => {
            void memory.remember("birthday", b);
            say(pickLine("birthdaySaved", { month: MONTHS[b.month - 1], day: b.day }).text, { sticky: true });
            window.setTimeout(neverBug, ONBOARD_BEAT_MS);
          }}
          onSkip={neverBug}
        />
      ),
    });
  };

  api.current.greet = () => {
    openerDoneRef.current = true;
    if (!memory.fact("name")) {
      api.current.askName({ intro: true, after: () => api.current.offerTour({ introduced: true }) });
      return;
    }
    api.current.offerTour();
  };

  api.current.offerTour = ({ introduced = false } = {}) => {
    const name = memory.fact("name")?.name;
    const text = name ? line("tourOffer", { name }) : line(introduced ? "tourOfferAnon" : "firstLaunch");
    say(text, {
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
            void returnHome(200);
          },
        },
      ],
    });
  };

  /* ---------- what she remembers ---------- */

  /** On screen, on her own time, nothing else being said, and the student isn't typing or mid-session. */
  const canSpeak = () => {
    const cur = stateRef.current;
    return (
      !!cur?.enabled &&
      AUTONOMOUS.has(modeRef.current) &&
      !busy() &&
      !dragRef.current &&
      !bubbleRef.current &&
      maySpeak({ lastTyping: lastTypingRef.current, lastStudy: lastStudyRef.current, quiet: quietNow(), hidden: document.hidden })
    );
  };

  const waitToSpeak = async (maxMs) => {
    const until = Date.now() + maxMs;
    while (!canSpeak()) {
      if (Date.now() > until || stateRef.current?.quiet) return false;
      await new Promise((r) => window.setTimeout(r, 500));
    }
    return true;
  };

  /** Says a picked memory line (optionally rephrased by Claude), and records it so it won't repeat this week. */
  api.current.speakMemory = async (pick, { actions = null, celebrate = false, waitMs = 6000 } = {}) => {
    if (!pick?.line) return false;
    const text = await maybeRephrase(pick.line.text, pick.vars);
    if (!(await waitToSpeak(waitMs))) return false;
    memory.markSaid(pick.line);
    setMood(celebrate ? "excited" : "happy");
    if (celebrate) {
      sfx("streak");
      playGesture("kiss");
    }
    refreshAnchor();
    say(text, actions ? { actions } : {});
    return true;
  };

  const memoryActions = (pick) => {
    const nav = navRef.current;
    const close = { label: "NOT NOW", onClick: () => setBubble(null) };
    if (pick.action === "quick5") {
      return [{ label: "5 CARDS", primary: true, onClick: () => startQuiz() }, { label: "GOING TO BED", onClick: () => setBubble(null) }];
    }
    if (pick.action === "weakDrill") {
      const course = nav.courses.find((c) => c.id === pick.vars.courseUuid || c.uuid === pick.vars.courseUuid);
      if (!course || !nav.onOpenCourse) return null;
      return [
        {
          label: "DRILL IT",
          primary: true,
          onClick: () => {
            setBubble(null);
            openCourseView(nav.onOpenCourse, course.id, { item: "qz-deck", moduleId: pick.vars.moduleUuid, deckMode: "module" });
          },
        },
        close,
      ];
    }
    return null;
  };

  /** The launch line: the most personal thing she knows, within a few seconds of opening. */
  api.current.sayOpener = async () => {
    try {
      await api.current.openWithMemory();
    } finally {
      openerDoneRef.current = true;
    }
  };
  api.current.openWithMemory = async () => {
    const cur = stateRef.current;
    if (!cur?.enabled || cur.quiet || !cur.onboarded) return;
    await memory.ready();
    if (!stateRef.current?.askedName && !memory.fact("name")) {
      if (await waitToSpeak(6000)) api.current.askName();
      return;
    }
    if (!stateRef.current?.askedMore) {
      if (await waitToSpeak(6000)) api.current.askMore();
      return;
    }
    const pick = await memory.opener({ timeLabel: clockLabel() }).catch(() => null);
    if (!pick) {
      const part = dayPart();
      const chance = part === "late" ? 0.7 : part === "morning" ? 0.4 : 0;
      if (Math.random() < chance && canSpeak()) {
        setMood("happy");
        refreshAnchor();
        say(line(part === "late" ? "lateHello" : "morningHello", { time: clockLabel() }));
      }
      return;
    }
    const ok = await api.current.speakMemory(pick, { actions: memoryActions(pick), celebrate: !!pick.celebrate });
    if (!ok) return;
    if (pick.memoryKey) memory.patchFact(pick.memoryKey, pick.celebrate ? { celebrated: true } : { said: true });
    if (pick.then) {
      const follow = await memory.lineFor(pick.then.trigger, pick.then.vars);
      if (follow) await api.current.speakMemory({ line: follow, vars: pick.then.vars }, { waitMs: 20000 });
    }
  };

  /* Something changed mid-visit (a comeback, a milestone): say it once she's free, or save it for next time. */
  api.current.onMemoryNews = async (news) => {
    if (!openerDoneRef.current || stateRef.current?.quiet) return;
    const item = news.find((n) => n.type === "milestone") || news.find((n) => n.type === "joke_retired") || news.find((n) => n.type === "comeback");
    if (!item) return;
    const [trigger, memoryKey] = {
      milestone: [`milestone.${item.id}`, `milestone:${item.id}`],
      joke_retired: ["jokeRetired", "joke:nemesis"],
      comeback: ["comeback", `comeback:${item.courseUuid}`],
    }[item.type];
    const celebrate = item.type !== "comeback";
    const picked = await memory.lineFor(trigger, item);
    if (!picked) return;
    const ok = await api.current.speakMemory({ line: picked, vars: item }, { celebrate, waitMs: 120000 });
    if (ok) memory.patchFact(memoryKey, item.type === "milestone" ? { celebrated: true } : { said: true });
  };

  /* Blocked days: she says what she moved, or that she'll plan around them. */
  useEffect(() => {
    const onBlocked = async (e) => {
      if (!stateRef.current?.enabled || stateRef.current?.quiet) return;
      const note = await memory.replanFor();
      const picked = note
        ? await memory.lineFor("blockedReplan", note)
        : await memory.lineFor("blockedMarked", { when: blockedWhen(e.detail?.days || []) });
      if (picked) void api.current.speakMemory({ line: picked, vars: note || {} }, { waitMs: 8000 });
    };
    const onForgot = () => {
      if (!stateRef.current?.enabled || stateRef.current?.quiet) return;
      void api.current.speakMemory({ line: pickLine("forgot", {}), vars: {} }, { waitMs: 8000 });
    };
    window.addEventListener("studyhub-companion-blocked", onBlocked);
    window.addEventListener("studyhub-companion-forgot", onForgot);
    return () => {
      window.removeEventListener("studyhub-companion-blocked", onBlocked);
      window.removeEventListener("studyhub-companion-forgot", onForgot);
    };
  }, [memory]);

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
    const now = Date.now();
    if (now < spamUntilRef.current) return;
    clicksRef.current = [...clicksRef.current.filter((t) => now - t < SPAM_WINDOW_MS), now];
    cancel();
    lastActivityRef.current = now;
    if (clicksRef.current.length >= SPAM_CLICKS) {
      clicksRef.current = [];
      spamUntilRef.current = now + SPAM_LOCK_MS;
      if (m === "menu") send("CLOSE");
      setMood("stern");
      if (use3dRef.current) playGesture("facepalm");
      refreshAnchor();
      feelIt("clickSpam");
      say(line("clickSpam"));
      return;
    }
    setBubble(null);
    const next = send("CLICK");
    sfx("open");
    setMood(m === "sleep" ? "confused" : "happy");
    if (next === "menu") {
      if (use3dRef.current && m !== "sleep") playGesture(Math.random() < 0.5 ? "wave" : "wink");
      setMenuLine(m === "sleep" ? null : line("clickHi"));
    }
    refreshAnchor();
  }, [cancel, send, closeHelp, refreshAnchor, sfx, say, playGesture, feelIt]);

  useEffect(() => {
    if (!menuLine) return undefined;
    const t = window.setTimeout(() => setMenuLine(null), MENU_LINE_MS);
    return () => window.clearTimeout(t);
  }, [menuLine]);

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
        if (housedRef.current) {
          const k = baseSizeRef.current / sizeRef.current;
          d.ox *= k;
          d.oy *= k;
          leaveHome();
        }
        setBubble(null);
        if (use3dRef.current) {
          d.held = true;
          setMood("stern");
          platRef.current = null;
          startSwing(d.ox, d.oy);
        }
        if (Math.random() < PICKUP_LINE_CHANCE) {
          refreshAnchor();
          say(line("pickedUp"));
        }
      }
      const s = sizeRef.current;
      const p = clampPoint({ x: e.clientX - d.ox, y: e.clientY - d.oy }, s);
      const g = navRef.current.stageActive ? overHome(p, s, baseSizeRef.current) : null;
      const hit = g ? null : dropTargetAt(e.clientX, e.clientY);
      if (hit !== d.target) {
        d.target = hit;
        setDropTarget(hit ? rectOf(hit.getBoundingClientRect()) : null);
      }
      if (hit) {
        setDropMark(null);
        jumpTo(p);
        return;
      }
      if (d.held) {
        const sw = swingRef.current;
        const now = performance.now();
        const dt = Math.max(1, now - (sw.lastT || now - 16));
        sw.vx = sw.vx * 0.6 + ((p.x - posRef.current.x) / dt) * 1000 * 0.4;
        sw.lastT = now;
      }
      if (g) setDropMark({ x: g.cx, y: g.floorTop });
      else if (d.held) setDropMark({ x: p.x + s / 2, y: platformBelow(p, s).top });
      else setDropMark(null);
      jumpTo(p);
    },
    [cancel, jumpTo, posRef, startSwing, leaveHome, refreshAnchor, say]
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
      setDropMark(null);
      setDropTarget(null);
      releaseSwing();
      const m = modeRef.current;
      const homeable = AUTONOMOUS.has(m) || m === "sleep" || m === "menu";
      if (homeable && m !== "menu") send("DROP");
      if (homeable && navRef.current.stageActive && overHome(posRef.current, sizeRef.current, baseSizeRef.current) && houseAt()) {
        refreshAnchor();
        return;
      }
      if (!homeable) {
        refreshAnchor();
        return;
      }
      /* Dropped on a task, exam or gauge: start it with the item's own button. */
      const kind = d.target?.isConnected ? d.target.dataset.novaDrop : null;
      if (kind) {
        const btn = d.target.matches("button") ? d.target : d.target.querySelector("button");
        btn?.click();
        setMood("happy");
        refreshAnchor();
        say(line(DROP_LINES[kind] || "dropTask"));
      }
      if (d.held) void api.current.fall({ dropped: true, quip: !kind });
      else api.current.returnAfterDrop();
    },
    [send, refreshAnchor, posRef, releaseSwing, houseAt, say]
  );

  /* ---------- autonomy: wander, perch, sleep ---------- */

  const movement = cstate?.movement || "normal";
  const enabled = !!cstate?.enabled;

  const quiet = !!cstate?.quiet;

  useEffect(() => {
    if (mode !== "idle" || !enabled || quiet || reduced) return undefined;
    const cfg = MOVE[movement] || MOVE.normal;
    let timer = 0;
    let alive = true;
    const schedule = (ms) => {
      timer = window.setTimeout(tick, ms);
    };
    const tick = async () => {
      if (!alive) return;
      if (!canAct() || syncRef.current) {
        schedule(nextCheckMs({ lastInput: lastInputRef.current, lastStudy: lastStudyRef.current }) + rand([500, 4000]));
        return;
      }
      awayFromSpotRef.current = true;
      if (housedRef.current) {
        leaveHome();
        if (use3d) {
          void api.current.fall();
          schedule(rand(cfg.idle));
          return;
        }
      } else if (navRef.current.stageActive && ++awayRef.current.stops > awayRef.current.goal) {
        const res = await api.current.goHome({ speed: cfg.speed });
        if (res !== null || !alive) return;
      }
      if (use3d && Math.random() < REST_CHANCE) {
        const s = sizeRef.current;
        const rest = pickRestEdge(s, posRef.current);
        if (rest) {
          const here = rest.plat.el === platRef.current?.el && Math.abs(rest.x - posRef.current.x) < 12;
          if (!here) {
            send("WANDER");
            const ok = await flyTo(rest, { speed: cfg.speed, walk: rest.plat.el === platRef.current?.el });
            if (!ok || modeRef.current !== "wander") return;
          }
          platRef.current = rest.plat;
          if (send("PERCH") !== "perch") return;
          sitHoldRef.current = Date.now() + rand(REST_MS);
          const slipping = isRampant(stateRef.current) || lastTierRef.current === "finishedBad" || lastTierRef.current === "finishedMeh";
          setSeat(slipping ? "cold" : "playful");
          return;
        }
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
    schedule(rand(housedRef.current ? HOME_STAY_MS : cfg.idle));
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [mode, enabled, movement, quiet, reduced, canAct, send, flyTo, posRef, use3d, leaveHome]);

  /* Leaving Today sends her out of the home window; coming back walks her home. */
  useEffect(() => {
    if (!enabled) return undefined;
    if (!stageActive) {
      if (housedRef.current) {
        leaveHome();
        awayFromSpotRef.current = true;
        if (use3dRef.current) void api.current.fall();
      }
      return undefined;
    }
    const t = window.setTimeout(() => {
      const m = modeRef.current;
      if (housedRef.current || !AUTONOMOUS.has(m) || busy() || dragRef.current) return;
      void api.current.goHome();
    }, HOME_RETURN_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [stageActive, enabled, leaveHome, busy]);

  /* Keep her sized and standing on the home floor as the window reflows. */
  useEffect(() => {
    if (!housed) return undefined;
    let raf = 0;
    const refit = () => {
      raf = 0;
      if (!housedRef.current || dragRef.current?.moved) return;
      const g = homeGeometry(baseSizeRef.current);
      if (!g) {
        leaveHome();
        jumpTo(clampPoint(posRef.current, baseSizeRef.current));
        return;
      }
      sizeRef.current = g.size;
      setHomeSize(g.size);
      const spot = homeSpot(g, g.size);
      const p = posRef.current;
      if (Math.abs(spot.x - p.x) > 0.5 || Math.abs(spot.y - p.y) > 0.5) jumpTo(spot);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(refit);
    };
    const stage = document.querySelector("[data-nova-home]");
    const ro = stage && typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (ro) ro.observe(stage);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [housed, leaveHome, jumpTo, posRef]);

  /* Grow into / shrink out of the home size instead of snapping. */
  const grownSizeRef = useRef(size);
  useLayoutEffect(() => {
    const prev = grownSizeRef.current;
    grownSizeRef.current = size;
    const el = growRef.current;
    if (!el || prev === size || reduced || Math.abs(prev - size) < 4) return undefined;
    el.style.transition = "none";
    el.style.transform = `scale(${prev / size})`;
    void el.offsetWidth;
    el.style.transition = `transform ${GROW_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
    el.style.transform = "scale(1)";
    const t = window.setTimeout(() => {
      el.style.transition = "";
      el.style.transform = "";
    }, GROW_MS + 40);
    return () => window.clearTimeout(t);
  }, [size, reduced]);

  /*
   * 3D: keep her feet on something. She rides her platform when it scrolls, and falls to
   * whatever is below when it disappears (or when an engaged move left her mid-air).
   */
  /** After a drop she lingers a beat, then heads back to her spot (the home window on Today). */
  api.current.returnAfterDrop = () => {
    window.setTimeout(() => {
      if (dragRef.current || !(AUTONOMOUS.has(modeRef.current) || modeRef.current === "sleep")) return;
      awayFromSpotRef.current = true;
      api.current.backToSpot?.();
    }, BACK_AFTER_DROP_MS);
  };

  api.current.fall = async ({ dropped = false, quip = true } = {}) => {
    if (housedRef.current) return;
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
      api.current.returnAfterDrop();
      if (quip && Math.random() < 0.45) {
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
      if (modeRef.current !== "idle" || busy() || !canAct()) return;
      const step = pickStroll(sizeRef.current, posRef.current, platRef.current, { sameOnly: true });
      if (!step) return;
      send("WANDER");
      const walked = await flyTo(step, { speed: (MOVE[stateRef.current?.movement] || MOVE.normal).speed, walk: true });
      if (walked && modeRef.current === "wander") send("ARRIVE");
    }, WALK_OFF_MS);
  };

  const visibleNow = !!cstate?.enabled && mode !== "hidden";
  /** Polling loops stop while the window is minimized/hidden; listeners that detect "back" still use visibleNow. */
  const shown = useSyncExternalStore(subscribeVisibility, pageShown);
  const ticking = visibleNow && shown;

  /*
   * 3D idle life: every 20-45s (scaled by movement) she yawns, looks around, gets bored or
   * stretches. Checked on a steady tick so it survives idle/wander/perch hops.
   */
  const bodyReady = use3d && body === "ready";
  useEffect(() => {
    if (!bodyReady || !ticking) return undefined;
    let due = Date.now() + idleGap(stateRef.current?.movement, Math.random, dayPart());
    let last = null;
    const id = window.setInterval(() => {
      const now = Date.now();
      if (now < Math.max(due, lastGestureAtRef.current + 8000)) return;
      const m = modeRef.current;
      if (!canAct() || (m !== "idle" && m !== "perch") || busy() || bubbleRef.current || dragRef.current || syncRef.current) return;
      const part = dayPart();
      const name = seatRef.current ? "sitYawn" : pickIdleGesture({ part, bored: now - lastActivityRef.current > BORED_AFTER_MS, last });
      last = name;
      playGesture(name, { idle: true });
      due = now + idleGap(stateRef.current?.movement, Math.random, part);
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
  }, [bodyReady, ticking, busy, canAct, playGesture, refreshAnchor, say]);

  const prevModeRef = useRef(mode);
  useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = mode;
    if (prev !== "sleep" || mode === "sleep") return;
    const by = wokeByRef.current;
    wokeByRef.current = null;
    if (bodyReady && (mode === "idle" || mode === "wander")) playGesture("startle");
    if (!by || by === "keydown" || by === "wheel" || Math.random() >= WAKE_DENIAL_CHANCE) return;
    window.setTimeout(async () => {
      if (!AUTONOMOUS.has(modeRef.current) || bubbleRef.current || stateRef.current?.quiet) return;
      const pick = await memory.lineFor("wakeDenial", {});
      if (!pick || bubbleRef.current) return;
      memory.markSaid(pick);
      setMood("stern");
      refreshAnchor();
      say(pick.text);
    }, 1100);
  }, [mode, bodyReady, playGesture, memory, refreshAnchor, say]);
  useEffect(() => {
    if (!use3d || !ticking) return undefined;
    let raf = 0;
    const check = () => {
      raf = 0;
      if (housedRef.current) return;
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
  }, [use3d, ticking, busy, jumpTo, posRef]);

  useEffect(() => {
    if (mode !== "perch") return undefined;
    const t = window.setTimeout(() => send("DONE"), Math.max(rand([10000, 30000]), sitHoldRef.current - Date.now()));
    return () => window.clearTimeout(t);
  }, [mode, send]);

  /* 3D: sometimes she sits on the edge of the card she perched on; cold when you're slipping. */
  useEffect(() => {
    if (mode !== "perch" || !bodyReady) return undefined;
    const t = window.setTimeout(() => {
      if (modeRef.current !== "perch" || busy() || dragRef.current || sitHoldRef.current > Date.now() || Math.random() > SIT_CHANCE) return;
      if (!seatClear(posRef.current, sizeRef.current)) return;
      const slipping = isRampant(stateRef.current) || lastTierRef.current === "finishedBad" || lastTierRef.current === "finishedMeh";
      setSeat(slipping ? "cold" : "playful");
    }, rand(SIT_DELAY_MS));
    return () => {
      window.clearTimeout(t);
      setSeat(null);
    };
  }, [mode, bodyReady, busy, posRef]);

  /* Off her spot, if the page shifts content under her, she goes back rather than cover it. */
  useEffect(() => {
    if (!ticking) return undefined;
    const id = window.setInterval(() => {
      const m = modeRef.current;
      if (!awayFromSpotRef.current || activityRef.current || busy() || dragRef.current || !(AUTONOMOUS.has(m) || m === "sleep")) return;
      if (coversContent(posRef.current, sizeRef.current, { standing: use3dRef.current })) api.current.backToSpot?.();
    }, 1500);
    return () => window.clearInterval(id);
  }, [ticking, busy, posRef]);

  /* ---------- idle life: staged by how long the student has been idle ---------- */

  const bodyReadyRef = useRef(false);
  bodyReadyRef.current = bodyReady;
  const threeD = () => use3dRef.current && bodyReadyRef.current;

  /** Resolves true after `ms` if the activity is still running, false once input cut it short. */
  const hold = (ms, tk) =>
    new Promise((resolve) => window.setTimeout(() => resolve(!tk.aborted && activityRef.current === tk), ms));

  /** Put the body back to normal. `fast` (input) snaps the doodle out instead of letting it fade. */
  const clearActivityVisuals = (fast) => {
    setActivity(null);
    setIdleLie(null);
    setDrowsy(false);
    setSeat((s) => (s === "cards" ? null : s));
    penRef.current = null;
    doodleDrawnRef.current?.();
    doodleDrawnRef.current = null;
    if (fast) setDoodle((d) => (d ? { ...d, abort: true } : null));
    peekClipRef.current?.();
    peekClipRef.current = null;
  };

  /** Any input ends idle life: she drops what she's doing and the layer walks her back. */
  api.current.endActivity = () => {
    const tk = activityRef.current;
    if (!tk) return;
    tk.aborted = true;
    activityRef.current = null;
    clearActivityVisuals(true);
    if (tk.moving) cancel();
    if (use3dRef.current) playGesture("cancel", { idle: true });
    if (modeRef.current === "play") send("DONE");
  };

  useEffect(() => {
    if (mode !== "play" && activityRef.current) api.current.endActivity();
  }, [mode]);

  api.current.runStage = async (kind) => {
    if (activityRef.current) return;
    const tk = { kind, aborted: false, moving: false };
    activityRef.current = tk;
    if (send("PLAY") !== "play") {
      activityRef.current = null;
      return;
    }
    setBubble(null);
    let after = "DONE";
    try {
      after = (await api.current.stages[kind]?.(tk)) || "DONE";
    } catch {
      after = "DONE";
    }
    if (activityRef.current !== tk) return;
    activityRef.current = null;
    clearActivityVisuals(false);
    if (modeRef.current === "play") send(after);
  };

  /** Point her eyes at a DOM rect for `ms`. */
  const glanceAtRect = (rect, ms) => {
    const s = sizeRef.current;
    const p = posRef.current;
    setGlance({ x: rect.left + rect.width / 2 - (p.x + s / 2), y: rect.top + rect.height / 2 - (p.y + s / 2), ms });
  };

  /** Hide the part of her that overlaps `el`, every frame, so she looks like she's behind it. */
  const clipBehind = (el) => {
    const node = nodeRef.current;
    let raf = 0;
    const step = () => {
      raf = requestAnimationFrame(step);
      if (!node) return;
      const r = el.isConnected ? el.getBoundingClientRect() : null;
      const s = sizeRef.current;
      const p = posRef.current;
      const x1 = r ? Math.max(0, r.left - p.x) : 0;
      const x2 = r ? Math.min(s, r.right - p.x) : 0;
      const y1 = r ? Math.max(0, r.top - p.y) : 0;
      const y2 = r ? Math.min(s, r.bottom - p.y) : 0;
      node.style.clipPath = x2 > x1 && y2 > y1 ? `path(evenodd, "M0 0H${s}V${s}H0Z M${x1} ${y1}H${x2}V${y2}H${x1}Z")` : "";
    };
    step();
    return () => {
      cancelAnimationFrame(raf);
      if (node) node.style.clipPath = "";
    };
  };

  api.current.stages = {
    /* 30s: looks around, stretches, glances at the Tonight panel. */
    fidget: async (tk) => {
      playGesture("look", { idle: true });
      if (!(await hold(5500, tk))) return;
      playGesture("stretch", { idle: true });
      if (!(await hold(3600, tk))) return;
      const tonight = findTarget("today-tonight");
      if (!tonight) return;
      glanceAtRect(tonight.getBoundingClientRect(), 2600);
      await hold(2800, tk);
    },

    /* 60s: a light-trail doodle on open grid space beside her. */
    doodle: async (tk) => {
      const pick = pickDoodle({ memory: memory.snapshot(), now: new Date(), last: lastDoodleRef.current });
      const built = buildDoodle(pick);
      const s = sizeRef.current;
      const box = doodleBox(built, s);
      const spot = findDoodleSpot(posRef.current, s, { ...box, prefer: facing });
      if (!spot) return;
      lastDoodleRef.current = pick.id;
      setFacing(spot.side);
      if (!(await hold(400, tk))) return;
      const drawn = new Promise((resolve) => {
        doodleDrawnRef.current = resolve;
      });
      if (threeD()) setActivity("draw");
      doodleIdRef.current += 1;
      setDoodle({ id: doodleIdRef.current, strokes: layoutDoodle(built, spot.rect), color: built.color, abort: false });
      await drawn;
      if (tk.aborted) return;
      setActivity(null);
      setMood("happy");
      if (threeD() && Math.random() < 0.4) playGesture("wink", { idle: true });
      await hold(2600, tk);
      setMood("neutral");
    },

    /* 2 min: reads a hologram book on her stomach, or sits on an edge and shuffles a deck. */
    prop: async (tk) => {
      const canSit = !housedRef.current && !!platRef.current?.el && seatClear(posRef.current, sizeRef.current);
      return api.current.stages[pickProp({ canSit })](tk);
    },
    read: async (tk) => {
      setIdleLie("belly");
      if (!(await hold(1200, tk))) return;
      setActivity("read");
      if (!(await hold(rand(READ_MS), tk))) return;
      setActivity(null);
      await hold(700, tk);
    },
    cards: async (tk) => {
      if (!(await hold(60, tk))) return;
      setSeat("cards");
      if (!(await hold(800, tk))) return;
      setActivity("cards");
      if (!(await hold(rand(READ_MS), tk))) return;
      setActivity(null);
      await hold(700, tk);
    },

    /* 5 min: yawns, lies down propped on an elbow, eyes drooping, then dozes off. */
    doze: async (tk) => {
      if (threeD()) {
        playGesture("yawn", { idle: true });
        if (!(await hold(4600, tk))) return;
        playGesture("cancel", { idle: true });
        setIdleLie("prop");
        setDrowsy(true);
        if (!(await hold(DROWSY_MS, tk))) return;
      }
      return "SLEEP";
    },

    /* Once in a while: hides behind a panel, peeks out, walks back. */
    peek: async (tk) => {
      const s = sizeRef.current;
      const start = { ...posRef.current };
      const spot = findPeekSpot(start, s, platRef.current);
      if (!spot) return;
      const wasAway = awayFromSpotRef.current;
      awayFromSpotRef.current = true;
      peekClipRef.current = clipBehind(spot.el);
      const speed = (MOVE[stateRef.current?.movement] || MOVE.normal).speed;
      tk.moving = true;
      const there = await flyTo({ x: spot.x, y: spot.y }, { speed, walk: true });
      tk.moving = false;
      if (!there || tk.aborted) return;
      setFacing(spot.outward);
      if (!(await hold(900, tk))) return;
      playGesture("lean", { idle: true });
      if (!(await hold(2600, tk))) return;
      if (Math.random() < 0.5) {
        playGesture("wink", { idle: true });
        if (!(await hold(1400, tk))) return;
      }
      tk.moving = true;
      const back = await flyTo(start, { speed, walk: true });
      tk.moving = false;
      if (back && !tk.aborted) awayFromSpotRef.current = wasAway;
    },
  };

  api.current.idleTick = () => {
    if (activityRef.current || syncRef.current) return;
    const m = modeRef.current;
    if ((m !== "idle" && m !== "perch") || busy() || dragRef.current || bubbleRef.current || returningRef.current) return;
    if (!canAct()) return;
    const now = Date.now();
    const idleMs = now - lastInputRef.current;
    const body3d = threeD();
    const stage = dueStage(idleMs, stagesDoneRef.current, { part: dayPart(), skip: body3d ? null : SPRITE_SKIP });
    if (stage) {
      stagesDoneRef.current.add(stage);
      void api.current.runStage(stage);
      return;
    }
    if (body3d && !housedRef.current && mayPeek({ idleMs, lastPeek: lastPeekRef.current, now })) {
      lastPeekRef.current = now;
      void api.current.runStage("peek");
    }
  };

  useEffect(() => {
    if (!ticking || quiet || reduced) {
      api.current.endActivity?.();
      return undefined;
    }
    const id = window.setInterval(() => api.current.idleTick?.(), 1000);
    return () => window.clearInterval(id);
  }, [ticking, quiet, reduced]);

  /* ---------- the spoken briefing: she walks to what she's talking about ---------- */

  const briefRef = useRef({ token: 0 });

  /** Where to stand for a briefing target: on its panel's top edge above it, else beside it. */
  const briefSpot = (el, rect, s) => {
    const panel = el.closest("[data-perch]");
    const plat = panel ? livePlatform({ el: panel }, s) : null;
    const cx = rect.left + rect.width / 2;
    if (plat) {
      for (const dx of [-0.45, 0.45, 0]) {
        const p = standOn(plat, cx + dx * s, s);
        if (!coversContent(p, s)) return { p, plat };
      }
    }
    return { p: pointBeside(rect, s, "left"), plat: null };
  };

  api.current.briefStart = () => {
    const m = modeRef.current;
    if (!stateRef.current?.enabled || stateRef.current?.quiet || !(AUTONOMOUS.has(m) || m === "sleep")) return;
    cancel();
    setBubble(null);
    if (send("BRIEF") !== "brief") return;
    briefRef.current.token += 1;
    setMood("point");
  };

  const faceToward = (rect) => {
    const s = sizeRef.current;
    setFacing(posRef.current.x + s / 2 > rect.left + rect.width / 2 ? -1 : 1);
  };

  /* What the Stage does with her body and the page. Rebuilt every render so it sees fresh state. */
  api.current.stageDeps = {
    stop: () => {
      cancel();
      if (speakingRef.current) window.speechSynthesis.cancel();
    },
    walkTo: async (el) => {
      el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      await nextFrame();
      const rect = el.getBoundingClientRect();
      if (!onScreen(rect)) return false;
      setBubble(null);
      const s = sizeRef.current;
      const { p, plat } = briefSpot(el, rect, s);
      if (!(await flyTo(p, { speed: ENGAGED_SPEED }))) return false;
      platRef.current = plat;
      faceToward(el.getBoundingClientRect());
      return true;
    },
    lookAt: (el) => (el ? glanceAtRect(el.getBoundingClientRect(), 2500) : setGlance({ x: 0, y: 0, ms: 2500 })),
    pointAt: (el) => {
      const rect = el.getBoundingClientRect();
      if (!onScreen(rect)) return false;
      faceToward(rect);
      setMood("point");
      pointAt(rect);
    },
    mark: (key, el, style, note) => setMarks((list) => [...list.filter((m) => m.key !== key), { key, el, style, note }]),
    clearMarks: () => setMarks((list) => (list.length ? [] : list)),
    scrollTo: async (el) => {
      el.scrollIntoView?.({ block: "center", behavior: reducedRef.current ? "auto" : "smooth" });
      await new Promise((r) => window.setTimeout(r, reducedRef.current ? 0 : 450));
    },
    openTab: ensureRoute,
    focus: (el) => {
      api.current.stageDeps.unfocus();
      const panel = el.closest(".sh-arrive") || el;
      panel.dataset.novaFocus = "";
      document.body.dataset.novaFocusing = "";
      focusedRef.current = panel;
    },
    unfocus: () => {
      if (focusedRef.current) delete focusedRef.current.dataset.novaFocus;
      focusedRef.current = null;
      delete document.body.dataset.novaFocusing;
    },
    say: (text, { speak = false } = {}) => {
      refreshAnchor();
      say(text);
      if (!speak || !("speechSynthesis" in window)) return undefined;
      return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.onstart = () => setTalkUntil(performance.now() + 60 * 1000);
        u.onend = u.onerror = () => {
          if (speakingRef.current === u) speakingRef.current = null;
          setTalkUntil(0);
          resolve();
        };
        speakingRef.current = u;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      });
    },
    line,
    mood: setMood,
    gesture: (name) => playGesture(name),
    layout: () => workspace.get().layout,
    place: workspace.place,
    remember: workspace.remember,
    /* Using a panel = typing in it or having one of its popovers open. Hover and focus alone don't count (focus lingers after clicks). */
    inUse: (el) => {
      const a = document.activeElement;
      const typing = el.contains(a) && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
      return typing || !!el.querySelector('[aria-expanded="true"]');
    },
  };

  /** Run a Stage scene: she stops what she's doing, performs it, then heads back. Any input cuts it short. False if she can't start. */
  api.current.playScene = (scene) => {
    api.current.briefStart();
    if (modeRef.current !== "brief") return false;
    void stageRef.current.run(scene).then((done) => api.current.briefEnd({ now: !done }));
    return true;
  };

  /** End of the briefing (or cut short by input): back to her spot, full size at home. */
  api.current.briefEnd = ({ now = false } = {}) => {
    if (modeRef.current !== "brief") return;
    const token = ++briefRef.current.token;
    const finish = () => {
      if (modeRef.current !== "brief" || briefRef.current.token !== token) return;
      cancel();
      send("END");
      setMood("neutral");
      awayFromSpotRef.current = true;
      api.current.backToSpot?.();
    };
    if (now) finish();
    else window.setTimeout(finish, 1200);
  };

  useEffect(() => {
    void window.studyHub?.desktop?.get?.().then((d) => setVoiceLevel(d?.settings?.level));
  }, []);

  useEffect(() => {
    const onScene = (e) => {
      const d = e.detail;
      if (typeof d?.scene === "function") d.handled = api.current.playScene(d.scene);
    };
    const stage = stageRef.current;
    window.addEventListener("studyhub-companion-scene", onScene);
    return () => {
      window.removeEventListener("studyhub-companion-scene", onScene);
      stage.abort();
    };
  }, []);

  /* ---------- sync: she opens a portal and pulls the data in; glitches on failure, static offline ---------- */

  useEffect(() => {
    const bb = window.studyHub?.blackboard;
    if (!bb?.onSyncProgress || !bb?.onSyncComplete) return undefined;
    let closeTimer = 0;
    let staleTimer = 0;
    const courseLabel = (uuid) => {
      const c = navRef.current.courses.find((x) => x.uuid === uuid || x.id === uuid);
      return shortCourse(c?.courseCode || c?.code || c?.name) || c?.name || "that course";
    };
    const close = (ms) => {
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        syncRef.current = null;
        setSync(null);
      }, ms);
    };
    const offProgress = bb.onSyncProgress((p) => {
      const cur = stateRef.current;
      const m = modeRef.current;
      if (!cur?.enabled || cur.quiet || !(AUTONOMOUS.has(m) || m === "sleep")) return;
      if (!syncRef.current) {
        api.current.endActivity?.();
        if (modeRef.current === "sleep") send("WAKE");
        setBubble(null);
      }
      window.clearTimeout(closeTimer);
      window.clearTimeout(staleTimer);
      staleTimer = window.setTimeout(() => close(0), SYNC_STALE_MS);
      syncRef.current = { phase: "open", step: p?.step || null };
      setSync(syncRef.current);
      setMood("thinking");
    });
    const offComplete = bb.onSyncComplete((res) => {
      window.clearTimeout(staleTimer);
      if (!syncRef.current) return;
      if (res?.ok) {
        syncRef.current = { phase: "ok" };
        setSync(syncRef.current);
        setMood("happy");
        close(SYNC_CLOSE_MS);
        return;
      }
      syncRef.current = { phase: "fail" };
      setSync(syncRef.current);
      flashReaction("glitch");
      sfx("glitch");
      setMood("stern");
      close(SYNC_CLOSE_MS + 300);
      const error = String(res?.error || "").trim();
      const course = courseLabel(res?.courseUuid);
      if (stateRef.current?.quiet) return;
      refreshAnchor();
      if (error === "not-logged-in") say(line("syncFailLogin", { course }));
      else if (error) say(line("syncFail", { course, error: error.replace(/\.$/, "") }));
    });
    return () => {
      offProgress?.();
      offComplete?.();
      window.clearTimeout(closeTimer);
      window.clearTimeout(staleTimer);
    };
  }, [send, flashReaction, sfx, refreshAnchor, say]);

  useEffect(() => {
    const onOffline = () => {
      setOffline(true);
      const m = modeRef.current;
      if (stateRef.current?.enabled && !stateRef.current?.quiet && AUTONOMOUS.has(m) && !bubbleRef.current) {
        refreshAnchor();
        say(line("offline"));
      }
    };
    const onOnline = () => setOffline(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [refreshAnchor, say]);


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
      if (stateRef.current?.quiet) return;
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

  /** The course with the most due cards, while due-card nudges are allowed this session. */
  const dueNow = () => {
    const cur = stateRef.current;
    const n = nudgeRef.current;
    if (!cur.nudges || !cur.onboarded || n.count >= NUDGE_MAX_PER_SESSION || Date.now() - n.mountedAt < NUDGE_FIRST_MS) return null;
    const best = [...navRef.current.courses, builtinCourse(loadFlashcardDeck())]
      .map((c) => ({ c, count: getDueCards(c.flashcards || []).length }))
      .sort((a, b) => b.count - a.count)[0];
    return best?.count ? best : null;
  };

  /* Due-card nudges (the Director's dueCards intent): rare, polite, and they back off when dismissed. */
  api.current.nudgeDue = async (best) => {
    const cur = stateRef.current;
    const n = nudgeRef.current;
    n.count += 1;
    n.kind = "due";
    cancel();
    if (send("NUDGE") !== "nudge") return;
    const spot = document.querySelector('[data-tour-id="today-cards"]');
    if (spot) {
      const r = spot.getBoundingClientRect();
      if (r.width && r.bottom > 0 && r.top < window.innerHeight) {
        awayFromSpotRef.current = true;
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
    say(line(rampant ? "dueRampant" : "due", { count: best.count, course }), {
      sticky: true,
      nudge: true,
      actions: [
        {
          label: "QUIZ ME",
          primary: true,
          onClick: () => {
            n.answered = true;
            feelIt("nudgeTaken");
            startQuiz(best.c.id);
          },
        },
        {
          label: "NOT NOW",
          onClick: () => {
            n.answered = true;
            n.cooldown *= 2;
            snooze("dueCards", n.cooldown);
            update((s) => ({ ignored: (s.ignored || 0) + 1 }));
            feelIt("nudgeDismissed");
            send("CLOSE");
            setMood("neutral");
            say(line("dismissed"));
          },
        },
      ],
    });
  };

  /* The Director's briefingOffer intent: a morning "want the rundown?" that plays the briefing scene. */
  api.current.offerBriefing = () => {
    const n = nudgeRef.current;
    n.kind = "briefing";
    n.answered = false;
    cancel();
    if (send("NUDGE") !== "nudge") return;
    setMood("happy");
    refreshAnchor();
    say(line("briefingOffer"), {
      sticky: true,
      nudge: true,
      actions: [
        {
          label: "BRIEF ME",
          primary: true,
          onClick: () => {
            n.answered = true;
            send("CLOSE");
            setBubble(null);
            api.current.playScene(sceneFrom(briefingScene, directorToday || {}));
          },
        },
        {
          label: "LATER",
          onClick: () => {
            n.answered = true;
            send("CLOSE");
            setMood("neutral");
            setBubble(null);
          },
        },
      ],
    });
  };

  useEffect(() => {
    if (mode !== "nudge") return undefined;
    const t = window.setTimeout(() => {
      if (modeRef.current !== "nudge") return;
      send("CLOSE");
      setMood("neutral");
      if (!nudgeRef.current.answered && nudgeRef.current.kind === "due") {
        update((s) => ({ ignored: (s.ignored || 0) + 1 }));
        feelIt("nudgeIgnored");
        say(line("ignoredNudge"));
        playGesture("taunt");
      } else {
        setBubble(null);
      }
    }, NUDGE_SHOW_MS);
    return () => window.clearTimeout(t);
  }, [mode, send, update, say, playGesture, feelIt]);

  /* ---------- Ask Nova: typed commands (see src/nova/commands.js) ---------- */

  /** On Today first, then (after the route settles) do `fn`. */
  const onToday = (fn) => {
    navRef.current.onGoHub?.("today");
    window.setTimeout(fn, 300);
  };

  api.current.runCommand = async (cmd) => {
    const nav = navRef.current;
    const reply = (key, vars = {}) => {
      setMood("happy");
      refreshAnchor();
      say(line(key, { name: memory.fact("name")?.name, ...vars }));
    };
    closeHelp();
    switch (cmd.id) {
      case "quiz":
        return startQuiz(cmd.course?.id);
      case "focus":
        return api.current.startFocus(cmd.minutes);
      case "talk":
        if (cmd.key === "sorry") feelIt("apology");
        return reply(`talk.${cmd.key}`);
      case "next":
        return onToday(() => playScene(sceneFrom(NEXT_SCENE, directorToday || {})));
      case "view":
        return nav.onGoHub?.(cmd.view);
      case "open":
        if (!cmd.tab) return nav.onOpenCourse?.(cmd.course.id);
        return openCourseView(nav.onOpenCourse, cmd.course.id, cmd.tab === "deck" ? { item: "qz-deck" } : { tab: cmd.tab });
      case "grades":
        if (cmd.course) return openCourseView(nav.onOpenCourse, cmd.course.id, { tab: "grades" });
        return onToday(() => arrangeWorkspace("grades"));
      case "layout":
        return onToday(() => (cmd.name === "back" ? workspace.putBack() : arrangeWorkspace(cmd.name)));
      case "move":
        if (!canPlace(cmd.panel, cmd.slot)) return reply("cmd.cantMove", { panel: PANEL_LABELS[cmd.panel] });
        return onToday(() => playScene((stage) => stage.movePanel(cmd.panel, cmd.slot)));
      case "due": {
        const list = dueBetween(await courseStore.loadTodayData(), cmd.days, new Date(), cmd.course?.id);
        return reply(list.length > 1 ? "cmd.dueMany" : list.length ? "cmd.dueOne" : "cmd.dueNone", { when: cmd.when, count: list.length, first: list[0] });
      }
      case "need": {
        if (!cmd.course) return reply("cmd.needWhich");
        const data = await courseStore.loadTodayData();
        const course = data?.courses?.find((c) => c.uuid === cmd.course.id);
        const label = shortCourse(cmd.course.courseCode || cmd.course.name) || cmd.course.name;
        const s = course ? neededScores(course) : null;
        const item = cmd.item === "final" ? s?.final : s?.next;
        if (!item) return reply("cmd.needNone", { course: label, item: cmd.item });
        if (item.needed == null) return reply("cmd.needUnknown", { course: label });
        const vars = { course: label, title: item.title, needed: formatPct(item.needed), target: formatPct(s.target) };
        return reply(item.needed <= 0 ? "cmd.needSafe" : item.needed > 100 ? "cmd.needImpossible" : "cmd.need", vars);
      }
      default:
        return undefined;
    }
  };

  /* Focus mode: she goes quiet for N minutes, shows a countdown, and checks in at the end. */
  const [focusUntil, setFocusUntil] = useState(0);
  focusRef.current = focusUntil;
  api.current.startFocus = (minutes) => {
    setFocusUntil(Date.now() + minutes * 60000);
    focusMinutesRef.current = minutes;
    setMood("happy");
    refreshAnchor();
    say(line("cmd.focusStart", { minutes }));
    api.current.backToSpot?.();
  };
  const stopFocus = () => {
    setFocusUntil(0);
    say(line("cmd.focusStop"));
  };
  useEffect(() => {
    if (!focusUntil) return undefined;
    const t = window.setTimeout(() => {
      setFocusUntil(0);
      const minutes = focusMinutesRef.current;
      setMood("excited");
      refreshAnchor();
      say(line("cmd.focusEnd", { minutes }), {
        sticky: true,
        actions: [
          { label: "QUIZ ME", primary: true, onClick: () => startQuiz() },
          { label: `ANOTHER ${minutes}`, onClick: () => api.current.startFocus(minutes) },
          { label: "BREAK", onClick: () => setBubble(null) },
        ],
      });
    }, Math.max(0, focusUntil - Date.now()));
    return () => window.clearTimeout(t);
  }, [focusUntil, refreshAnchor, say, startQuiz]);

  /* Ctrl+J: Ask Nova from anywhere. */
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "j") return;
      if (!stateRef.current?.enabled || modeRef.current === "hidden" || paletteOpen()) return;
      e.preventDefault();
      if (modeRef.current === "help") closeHelp();
      else {
        if (modeRef.current === "menu") send("CLOSE");
        startHelp();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startHelp, closeHelp, send]);

  /* ---------- the Director: what she does on her own next (see src/nova/director.js) ---------- */

  /** The gauge under the pointer and since when; hovering one long enough is a question. */
  const hoverRef = useRef({ anchor: null, since: 0 });
  useEffect(() => {
    const onOver = (e) => {
      const anchor = e.target.closest?.('[data-nova-anchor$=".gauge"]')?.dataset.novaAnchor || null;
      if (anchor !== hoverRef.current.anchor) hoverRef.current = { anchor, since: Date.now() };
    };
    document.addEventListener("pointerover", onOver);
    return () => document.removeEventListener("pointerover", onOver);
  }, []);

  api.current.directorTick = () => {
    const cur = stateRef.current;
    if (!cur?.enabled || !startedRef.current || !openerDoneRef.current) return;
    const now = Date.now();
    setVoiceTone(moodTone(cur.feelings, now));
    const onToday = !!navRef.current.stageActive;
    const lastInput = lastInputRef.current;
    const lastStudy = lastStudyRef.current;
    const idle = mayAct({ lastInput, lastStudy, now });
    const hover = { anchor: hoverRef.current.anchor, ms: now - hoverRef.current.since };
    const feelings = current(cur.feelings, now);
    const tier = rapportTier(feelings.rapport).id;
    const bday = memory.fact("birthday");
    const today = new Date(now);
    const ctx = {
      skip: new Set(memory.fact("never_bug")?.intents || []),
      birthday: !!bday && bday.month === today.getMonth() + 1 && bday.day === today.getDate(),
      callback: idle ? callbackFor(memory.snapshot(), { allowed: (min) => tierAtLeast(tier, min), now: today }) : null,
      blocked: quietNow() || document.hidden || !!syncRef.current || !AUTONOMOUS.has(modeRef.current),
      typing: !maySpeak({ lastTyping: lastTypingRef.current, lastStudy, now }),
      idle,
      feelings,
      events: directorEvents,
      onToday,
      today: directorToday,
      part: dayPart(),
      hover,
      gauge: onToday && hover.anchor ? directorToday?.courses?.find((c) => `course.${c.uuid}.gauge` === hover.anchor) || null : null,
      due: idle ? dueNow() : null,
    };
    const it = choose(INTENTS, ctx, timing, now);
    if (!it) return;
    ran(it, now);
    if (it.id === "dueCards") void api.current.nudgeDue(ctx.due);
    else if (it.id === "briefingOffer") api.current.offerBriefing();
    else if (it.id === "birthday") void api.current.sayMemoryLine("birthday", { name: memory.fact("name")?.name }, { celebrate: true });
    else if (it.id === "callback") void api.current.sayCallback(ctx.callback);
    else if (it.id === "gradeMoved") {
      const grade = directorEvents.find((e) => e.type === "grade");
      if (!api.current.playScene(sceneFrom(it, { ...ctx, grade }))) return;
      take("grade");
      feelIt(grade.up ? "gradeUp" : "gradeDown");
      if (grade.up && grade.to - grade.from >= EPISODE_GRADE_JUMP) {
        memory.record("episode:grade_up", { course: grade.course, fromPct: grade.from.toFixed(1), toPct: grade.pct, at: new Date(now).toISOString(), refs: 0, lastRef: null });
      }
    } else {
      if (it.id === "explainGauge") hoverRef.current = { anchor: null, since: now };
      api.current.playScene(sceneFrom(it, ctx));
    }
  };

  api.current.sayMemoryLine = async (trigger, vars, opts = {}) => {
    const picked = await memory.lineFor(trigger, vars);
    return picked ? api.current.speakMemory({ line: picked, vars }, opts) : false;
  };

  /** "Remember when...": one episode or running joke, then it rests for a while. */
  api.current.sayCallback = async (cb) => {
    const pick = { line: await memory.lineFor(`callback.${cb.kind}`, cb.vars), vars: cb.vars, action: cb.kind === "nemesis" ? "weakDrill" : null };
    if (!(await api.current.speakMemory(pick, { actions: memoryActions(pick) }))) return;
    memory.patchFact(cb.key, { refs: (cb.vars.refs || 0) + 1, lastRef: new Date().toISOString() });
  };

  useEffect(() => {
    const tick = () => api.current.directorTick();
    const id = window.setInterval(tick, DIRECTOR_TICK_MS);
    const off = onWake(tick);
    return () => {
      window.clearInterval(id);
      off();
    };
  }, []);

  /* Drill cards and practice tests elsewhere in the app: XP, plus the odd comment. */
  useEffect(() => {
    const onStudy = (e) => {
      const d = e.detail || {};
      const m = modeRef.current;
      const canTalk = !!stateRef.current?.enabled && (AUTONOMOUS.has(m) || m === "sleep");
      if (canTalk && m === "sleep") send("WAKE");
      if (canTalk) api.current.backToSpot?.();
      if (d.type === "card") {
        /* Mid-drill she stays put and silent: XP pops and her expression only. */
        lastStudyRef.current = Date.now();
        const r = drillRef.current;
        if (d.correct) {
          r.known += 1;
          r.missed = 0;
        } else {
          r.missed += 1;
          r.known = 0;
        }
        awardXp([[d.correct ? "cardKnown" : "cardAgain", 1]], { announce: false });
        feelIt(d.correct ? "cardRight" : "cardWrong");
        if (!canTalk) return;
        if (d.correct && r.known % 5 === 0) setMood("excited");
        else if (!d.correct && r.missed === 3) setMood("stern");
        return;
      }
      if (d.type === "test" && d.total) {
        const res = awardXp([["testCorrect", d.correct], ["testDone", 1]], { announce: canTalk });
        feelIt("testDone");
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
  }, [awardXp, say, sfx, flashReaction, send, playGesture, feelIt]);

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
      if ((m === "idle" || m === "perch") && canAct()) {
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
  }, [rampantNow, enabled, canAct, flashReaction, sfx, refreshAnchor, say]);

  /* Input: resets the idle clock, wakes her, and calls her back if she wandered off. Plus cursor shyness and the summon hotkey. */
  useEffect(() => {
    let lastMove = 0;
    const onActivity = (e) => {
      const now = Date.now();
      lastActivityRef.current = now;
      lastInputRef.current = now;
      stagesDoneRef.current = new Set();
      if (e?.type === "keydown" || e?.type === "wheel") lastTypingRef.current = now;
      api.current.endActivity?.();
      if (modeRef.current === "brief" && e?.type !== "pointermove") api.current.briefEnd?.({ now: true });
      if (e?.target && nodeRef.current?.contains(e.target)) return;
      if (modeRef.current === "sleep") wokeByRef.current = e?.type || "keydown";
      if (modeRef.current === "sleep" && !awayFromSpotRef.current) send("WAKE");
      api.current.backToSpot?.();
    };
    const onPointerMoveGlobal = (e) => {
      const now = Date.now();
      if (now - lastMove < 120) return;
      lastMove = now;
      onActivity(e);
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
      onActivity();
    };
    window.addEventListener("pointermove", onPointerMoveGlobal, { passive: true });
    window.addEventListener("pointerdown", onActivity, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMoveGlobal);
      window.removeEventListener("pointerdown", onActivity, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onActivity);
      window.removeEventListener("touchstart", onActivity);
    };
  }, [send, flyTo, posRef]);

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
    if (m === "help") {
      closeHelp();
      return;
    }
    cancel();
    setBubble(null);
    if (!AUTONOMOUS.has(modeRef.current) && modeRef.current !== "sleep") force("idle");
    if (!housedRef.current) {
      const s = sizeRef.current;
      jumpTo(
        use3dRef.current
          ? standOn(groundPlatform(), window.innerWidth * 0.55, s)
          : clampPoint({ x: window.innerWidth * 0.55, y: window.innerHeight * 0.42 }, s)
      );
      if (use3dRef.current) platRef.current = groundPlatform();
    }
    setBurst((n) => n + 1);
    sfx("teleportIn");
    startHelp();
  };

  useEffect(() => {
    if (!burst) return undefined;
    const t = window.setTimeout(() => setBurst(0), BURST_MS);
    return () => window.clearTimeout(t);
  }, [burst]);

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
    const offTray = window.studyHub?.desktop?.onOpenSettings?.(() => setSettingsOpen(true));
    return () => {
      window.removeEventListener("studyhub-scout-settings", open);
      offTray?.();
    };
  }, []);

  /* Today's arrival waves her hello; the briefing's voice moves her mouth. */
  useEffect(() => {
    const onGreet = () => {
      if (!visibleNow || stateRef.current?.quiet || reducedRef.current || !AUTONOMOUS.has(modeRef.current) || busy()) return;
      setMood("happy");
      playGesture("wave");
    };
    const onTalk = (e) => {
      const ms = e.detail?.ms;
      setTalkUntil(ms ? performance.now() + ms : 0);
    };
    window.addEventListener("studyhub-companion-greet", onGreet);
    window.addEventListener("studyhub-companion-talk", onTalk);
    return () => {
      window.removeEventListener("studyhub-companion-greet", onGreet);
      window.removeEventListener("studyhub-companion-talk", onTalk);
    };
  }, [visibleNow, busy, playGesture]);

  useEffect(() => {
    document.documentElement.dataset.nova = visibleNow ? "on" : "off";
    document.documentElement.dataset.novaQuiet = quiet ? "on" : "off";
    window.dispatchEvent(new CustomEvent("studyhub-companion-state", { detail: { visible: visibleNow, quiet } }));
  }, [visibleNow, quiet]);

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
      update(patch);
      if (patch.quiet) {
        if (modeRef.current === "sleep") send("WAKE");
        if (modeRef.current === "perch") send("DONE");
        api.current.backToSpot?.();
      }
    },
    [update, appear, cancel, force, send]
  );

  /* Quiet mode can be flipped from the app Settings panel and from her menu too. */
  useEffect(() => {
    const onQuiet = (e) => onSettingsChange({ quiet: !!e.detail?.quiet });
    window.addEventListener("studyhub-companion-quiet", onQuiet);
    return () => window.removeEventListener("studyhub-companion-quiet", onQuiet);
  }, [onSettingsChange]);

  if (!cstate) return null;

  const visible = cstate.enabled && mode !== "hidden";
  const tint = resolveTint(cstate);
  const level = levelForXp(cstate.xp || 0);
  const shownMood = mode === "sleep" ? "sleep" : mood;
  /** Leg swing pace: livelier after a good grade or streak, lazier late at night. */
  const legEnergy = (mood === "excited" ? 1.4 : mood === "happy" ? 1.2 : 1) * (dayPart() === "late" ? 0.7 : 1);
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
        courses={quizCourses}
        onCommand={(cmd) => void api.current.runCommand(cmd)}
        onQuery={(query) => setHelp((h) => ({ ...h, query }))}
        onPick={(answer) => {
          setHelp((h) => ({ ...h, answer, pointed: false }));
          setMood("happy");
        }}
        onBack={() => {
          setMarks([]);
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
      <SpeechBubble text={bubble.text} title={bubble.title} actions={bubble.actions} h={anchor.h} v={anchor.v} tone={tone}>
        {bubble.form || null}
      </SpeechBubble>
    );
  }

  if (mode !== "menu" && menuPage !== "main") setMenuPage("main");
  const pickLayout = (fn) => () => {
    send("CLOSE");
    fn();
  };
  const layoutItems = [
    { id: "l-briefing", label: "BRIEFING", icon: "▦", onClick: pickLayout(() => arrangeWorkspace("briefing")) },
    { id: "l-grades", label: "GRADES", icon: "◔", onClick: pickLayout(() => arrangeWorkspace("grades")) },
    { id: "l-tidy", label: "TIDY UP", icon: "▤", onClick: pickLayout(() => arrangeWorkspace("tidy")) },
    ...(workspace.get().before ? [{ id: "l-back", label: "PUT IT BACK", icon: "↺", onClick: pickLayout(workspace.putBack) }] : []),
    { id: "l-menu", label: "BACK", icon: "‹", onClick: () => setMenuPage("main") },
  ];
  const mainItems = [
    { id: "quiz", label: "QUIZ ME", icon: "✦", onClick: () => startQuiz() },
    { id: "layout", label: "REARRANGE", icon: "▦", onClick: () => setMenuPage("layout") },
    { id: "tour", label: "SHOW ME AROUND", icon: "◎", onClick: contextualTour },
    { id: "help", label: "ASK NOVA", icon: "›", onClick: startHelp },
    {
      id: "quiet",
      label: quiet ? "QUIET MODE: ON" : "QUIET MODE",
      icon: "◐",
      onClick: () => {
        send("CLOSE");
        onSettingsChange({ quiet: !quiet });
        setMood("neutral");
        say(line(quiet ? "quietOff" : "quietOn"));
      },
    },
    { id: "hide", label: "HIDE FOR NOW", icon: "–", onClick: hideForNow },
    ...(import.meta.env.DEV ? [{ id: "stage-demo", label: "STAGE DEMO", icon: "⚙", onClick: pickLayout(() => playScene(stageDemo)) }] : []),
  ];
  const menuItems = menuPage === "layout" ? layoutItems : mainItems;

  return createPortal(
    <div className="sc-layer">
      {visible && mode === "tour" && tour ? <Spotlight rect={tour.rect} dim /> : null}
      {visible
        ? marks.map((m) => {
            if (!m.el.isConnected) return null;
            const r = rectOf(m.el.getBoundingClientRect());
            return m.style === "note" ? <PinNote key={m.key} rect={r} text={m.note} /> : <Spotlight key={m.key} rect={r} dim={false} tone={m.style} />;
          })
        : null}
      {dropTarget ? <Spotlight rect={dropTarget} dim={false} pad={4} /> : null}
      {focusUntil ? <FocusPill until={focusUntil} onStop={stopFocus} /> : null}
      {dropMark ? <span className="nv-drop" style={{ left: dropMark.x, top: dropMark.y }} aria-hidden /> : null}
      {doodle ? (
        <DoodleTrail
          doodle={doodle}
          penRef={penRef}
          onDrawn={() => {
            doodleDrawnRef.current?.();
            doodleDrawnRef.current = null;
          }}
          onGone={() => setDoodle((d) => (d?.id === doodle.id ? null : d))}
        />
      ) : null}
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
          housed ? "sc-scout--home" : "",
          dayPart(new Date(now)) === "late" ? "sc-scout--late" : "",
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
          <span className="sc-grow" ref={growRef}>
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
                    seat={mode === "perch" || mode === "play" ? seat : null}
                    lie={mode === "sleep" ? "side" : mode === "play" ? idleLie : null}
                    activity={mode === "play" ? activity : sync?.phase === "open" ? "pull" : null}
                    drowsy={mode === "play" && drowsy}
                    staticNoise={offline}
                    pen={penRef}
                    glance={glance}
                    still={reduced}
                    energy={legEnergy}
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
        {visible && sync ? (
          <span className={`sc-portal sc-portal--${sync.phase} sc-portal--${facing < 0 ? "left" : "right"}`} aria-hidden>
            <span className="sc-portal-ring" />
            <span className="sc-portal-core" />
            {sync.phase === "open"
              ? [0, 1, 2, 3, 4].map((i) => <i key={i} className="sc-portal-bit" style={{ "--d": `${i * 0.18}s` }} />)
              : null}
          </span>
        ) : null}
        {visible && offline ? <span className="sc-static" aria-hidden /> : null}
        {visible && burst ? (
          <span key={burst} className="sc-burst" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} style={{ "--a": `${i * 30}deg` }} />
            ))}
          </span>
        ) : null}
        {visible && mode === "sleep" ? (
          <span className="sc-zzz mono" aria-hidden>
            <i>z</i>
            <i>z</i>
            <i>z</i>
          </span>
        ) : null}
        {visible && mode === "menu" ? (
          <RadialMenu
            key={menuPage}
            items={menuItems}
            center={center}
            size={size}
            onClose={() => send("CLOSE")}
            caption={menuLine}
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
