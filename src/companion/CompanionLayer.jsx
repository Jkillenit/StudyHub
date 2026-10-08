import { Suspense, lazy, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "../shell/motion.js";
import { createPortal } from "react-dom";
import { character, line } from "./character.js";
import {
  loadCompanionState,
  saveCompanionState,
  resolveTint,
  levelForXp,
} from "./companionStore.js";
import { dayPart } from "./idleDirector.js";
import { DoodleTrail } from "./DoodleTrail.jsx";
import { QuizPanel } from "./QuizPanel.jsx";
import { transition, AUTONOMOUS } from "./machine.js";
import {
  clampPoint,
  defaultHome,
  platformBelow,
  standOn,
} from "./safeZones.js";
import { useCompanionMotion } from "./useCompanionMotion.js";
import { mayAct } from "./attention.js";
import { useCompanionMemory } from "./memory/useCompanionMemory.js";
import { NovaSprite } from "./NovaSprite.jsx";
import { playSound } from "./novaSound.js";
import { SpeechBubble } from "./SpeechBubble.jsx";
import { RadialMenu } from "./RadialMenu.jsx";
import { PinNote, Spotlight } from "./Spotlight.jsx";
import { createStage, playScene } from "../nova/stage.js";
import { useWorkspace, workspace } from "../nova/workspace.js";
import { arrangeWorkspace } from "../nova/scenes/arrange.js";
import { stageDemo } from "../nova/scenes/stageDemo.js";
import { setVoiceTone } from "../nova/voice.js";
import { feel, tone as moodTone } from "../nova/mood.js";
import { HelpBubble } from "./HelpBubble.jsx";
import { CompanionSettings } from "./CompanionSettings.jsx";
import { FocusPill } from "./FocusPill.jsx";
import {
  ATTEND_MODES,
  BODY_LOAD_TIMEOUT_MS,
  DAY_HELLO_DELAY_MS,
  ENGAGED_MODES,
  HOME_MODES,
  MOVE,
  SIZE_3D,
} from "./layer/constants.js";
import { pageShown, rectOf, subscribeVisibility } from "./layer/geometry.js";
import { useTimeouts } from "./hooks/useTimeouts.js";
import { useNovaWindowEvents } from "./hooks/useNovaWindowEvents.js";
import { useNovaSync } from "./hooks/useNovaSync.js";
import { useNovaCommands } from "./hooks/useNovaCommands.js";
import { useNovaNudges } from "./hooks/useNovaNudges.js";
import { useNovaDirector } from "./hooks/useNovaDirector.js";
import { useNovaStudyEvents } from "./hooks/useNovaStudyEvents.js";
import { useNovaExamSession } from "./hooks/useNovaExamSession.js";
import { useNovaMemoryVoice } from "./hooks/useNovaMemoryVoice.jsx";
import { useNovaMarks } from "./hooks/useNovaMarks.js";
import { useNovaHelp } from "./hooks/useNovaHelp.js";
import { useNovaTour } from "./hooks/useNovaTour.js";
import { useNovaQuiz } from "./hooks/useNovaQuiz.js";
import { useNovaBriefing } from "./hooks/useNovaBriefing.js";
import { useNovaDrag } from "./hooks/useNovaDrag.js";
import { useNovaPlacement } from "./hooks/useNovaPlacement.js";
import { useNovaIdleLife } from "./hooks/useNovaIdleLife.js";
import { useNovaAutonomy } from "./hooks/useNovaAutonomy.js";
import { useNovaInput } from "./hooks/useNovaInput.js";
import { courseStore } from "../db/courseStore.js";

const Nova3D = lazy(() => import("./nova3d/Nova3D.jsx"));
/** The first-run tour waits for the setup screen to close and Today to mount. */
const SETUP_TOUR_DELAY_MS = 700;

/** Every quiz runs in a session, so she quizzes from her lane instead of walking out of it. */
const leavesHomeFor = (next) => !HOME_MODES.has(next) && next !== "quiz";

/**
 * Nova's overlay. Lives above the app in a portal; only Nova, her bubbles and menus take
 * pointer events. Mounted by StudyHubApp once the launch splash is gone.
 */
export default function CompanionLayer({ courses = [], activeCourseId = null, onHub = true, hubView = "today", place = "free", onGoHub, onOpenCourse, onUpdateCourse }) {
  const [cstate, setCstate] = useState(null);
  const stateRef = useRef(null);
  const [mode, setMode] = useState("hidden");
  const modeRef = useRef("hidden");
  const [mood, setMood] = useState("neutral");
  const [bubble, setBubble] = useState(null);
  const [anchor, setAnchor] = useState({ h: "left", v: "above" });
  const [react, setReact] = useState(null);
  const [now, setNow] = useState(Date.now);
  /** 3D body status; "failed" drops back to the portrait sprite for good this session. */
  const [body, setBody] = useState("loading");
  const onBodyReady = useCallback(() => setBody("ready"), []);
  const onBodyFail = useCallback(() => setBody("failed"), []);
  const nodeRef = useRef(null);
  /** Head position from the 3D body, as CSS vars the bubble reads; cleared when the body goes. */
  const onHead = useCallback((p) => {
    const st = nodeRef.current?.style;
    if (!st) return;
    if (!p) {
      st.removeProperty("--nv-head-x");
      st.removeProperty("--nv-head-y");
      return;
    }
    st.setProperty("--nv-head-x", `${p.x}px`);
    st.setProperty("--nv-head-y", `${p.y}px`);
  }, []);
  const use3d = body !== "failed";
  const use3dRef = useRef(use3d);
  use3dRef.current = use3d;
  const [gesture, setGesture] = useState(null);
  const gestureIdRef = useRef(0);
  /** Which ring of her click menu is showing: the main options or the Rearrange layouts. */
  const [menuPage, setMenuPage] = useState("main");
  useWorkspace();
  const [talkUntil, setTalkUntil] = useState(0);
  /** The platform the 3D body stands on: `{ el }` (el null = window bottom), or null mid-air. */
  const platRef = useRef(null);
  /** Idle life's running activity (`{ kind, aborted, moving }`). */
  const activityRef = useRef(null);
  const bubbleRef = useRef(null);
  bubbleRef.current = bubble;

  const reduced = useReducedMotion();
  const later = useTimeouts();
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
  /** Synced to `size` once the placement hook below has worked it out. */
  const sizeRef = useRef(baseSize);

  /** Hidden while resting on the calendar or in a window too narrow for her lane; the message box shows her portrait. */
  const tuckedRef = useRef(false);
  const [laneShown, setLaneShown] = useState(false);
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(".sh-nova-lane");
      setLaneShown(!!el && getComputedStyle(el).display !== "none");
    };
    measure();
    const main = document.querySelector(".sh-frame-main");
    const ro = new ResizeObserver(measure);
    if (main) ro.observe(main);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [place]);
  /* Lane visibility is part of it so widening the window (or unpinning the rail) walks her back in. */
  const inSetup = place === "setup";
  const stageActive = ((place === "lane" || place === "session") && laneShown) || inSetup;
  const onToday = onHub && (hubView === "today" || hubView === "plan");
  const navRef = useRef({});
  navRef.current = { courses, activeCourseId, onHub, onGoHub, onOpenCourse, stageActive, onToday, inSetup };

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
  /** The setup screen does the talking, so she keeps still and silent there too. */
  const quietNow = () => !!stateRef.current?.quiet || focusRef.current > Date.now() || !!navRef.current.inSetup;
  const canAct = useCallback(
    () =>
      !tuckedRef.current &&
      mayAct({
        lastInput: lastInputRef.current,
        lastStudy: lastStudyRef.current,
        quiet: quietNow(),
        reduced: reducedRef.current,
        hidden: document.hidden,
      }),
    []
  );
  const dragRef = useRef(null);
  const startedRef = useRef(false);
  /** Standing big inside the Today home window. */
  const housedRef = useRef(false);
  /** Latest-closure handlers for timers and global listeners. */
  const api = useRef({});
  /** The Stage (see src/nova/stage.js). Scenes run in "brief" mode; leaving it aborts them. */
  const stageRef = useRef(null);
  if (!stageRef.current) {
    const via = (k) => (...args) => api.current.stageDeps[k](...args);
    const keys = ["stop", "walkTo", "lookAt", "pointAt", "mark", "clearMarks", "scrollTo", "openTab", "focus", "unfocus", "say", "line", "mood", "gesture", "layout", "place", "remember", "inUse"];
    stageRef.current = createStage(Object.fromEntries(keys.map((k) => [k, via(k)])));
  }
  const memory = useCompanionMemory({
    enabled: !!cstate?.enabled,
    onNews: (news) => api.current.onMemoryNews?.(news),
  });
  const reactTimerRef = useRef(0);
  const flashReaction = useCallback((kind) => {
    window.clearTimeout(reactTimerRef.current);
    setReact(kind);
    reactTimerRef.current = window.setTimeout(() => setReact(null), 650);
  }, []);

  useEffect(() => () => window.clearTimeout(reactTimerRef.current), []);

  /* ---------- state plumbing ---------- */

  const send = useCallback((event) => {
    const next = transition(modeRef.current, event);
    if (next !== modeRef.current) {
      if (modeRef.current === "brief") stageRef.current.abort();
      if (housedRef.current && leavesHomeFor(next)) api.current.leaveHome?.();
      /* A tour, quiz, help answer or nudge may have taken her elsewhere; the next input brings her back. */
      if (AUTONOMOUS.has(next) && ENGAGED_MODES.has(modeRef.current) && !housedRef.current) awayFromSpotRef.current = true;
      modeRef.current = next;
      setMode(next);
    }
    return next;
  }, []);

  const force = useCallback((next) => {
    if (modeRef.current === "brief" && next !== "brief") stageRef.current.abort();
    if (housedRef.current && leavesHomeFor(next)) api.current.leaveHome?.();
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

  const refreshAnchor = useCallback(() => {
    if (housedRef.current) {
      setAnchor({ h: "center", v: "above" });
      return;
    }
    const p = posRef.current;
    const s = sizeRef.current;
    setAnchor({
      h: p.x + s / 2 > window.innerWidth / 2 ? "left" : "right",
      v: p.y > 280 ? "above" : "below",
    });
  }, [posRef]);

  const enabled = !!cstate?.enabled;

  const core = {
    stateRef,
    modeRef,
    navRef,
    api,
    send,
    setBubble,
    say,
    setMood,
    refreshAnchor,
    bubbleRef,
    later,
    memory,
    feelIt,
    focusRef,
    reducedRef,
    busy,
    playGesture,
    setTalkUntil,
    update,
    cancel,
    flyTo,
    sizeRef,
    awayFromSpotRef,
    sfx,
    startedRef,
    openerDoneRef,
    lastInputRef,
    lastStudyRef,
    lastTypingRef,
    quietNow,
    canAct,
    dragRef,
    jumpTo,
    setFacing,
    setAnchor,
    pointAt,
    flashReaction,
    posRef,
    platRef,
    stageRef,
    lastActivityRef,
    use3dRef,
    baseSizeRef,
    nodeRef,
    reduced,
    dropTo,
    home,
    returningRef,
    activityRef,
    lastGestureAtRef,
    force,
    housedRef,
  };

  /* ---------- home window on Today: big inside it, normal size everywhere else ---------- */

  /* Leaving setup: step quietly out of its stage onto her spot (declared before the placement
     hook so its "left home" fall and landing quip don't fire); she walks into the lane from there. */
  const prevPlaceRef = useRef(place);
  useEffect(() => {
    const was = prevPlaceRef.current;
    prevPlaceRef.current = place;
    if (was !== "setup" || place === "setup" || !housedRef.current) return;
    api.current.leaveHome();
    jumpTo(home());
  }, [place, jumpTo, home]);

  const { housed, size, growRef, awayRef, houseAt, leaveHome, returnHome } = useNovaPlacement(core, { baseSize, enabled, stageActive });
  sizeRef.current = size;

  const { awardXp, pops, rampantNow } = useNovaStudyEvents(core, { cstate, now, enabled, flashReaction });
  useNovaExamSession(core);

  /* ---------- load + first appearance ---------- */

  useEffect(() => {
    let alive = true;
    loadCompanionState().then(async (s) => {
      let next = s;
      try {
        const [last] = await courseStore.getSessionHistory({ limit: 1 });
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

  /* First run is the setup screen (src/features/setup), so she never greets with bubbles here,
     and skips the launch line for that visit even if setup closes before it would fire. */
  const appear = useCallback(() => {
    setBubble(null);
    setMood("neutral");
    force("idle");
    if (!houseAt()) jumpTo(home());
    sfx("appear");
    const firstRun = !stateRef.current?.onboarded;
    later(() => {
      if (firstRun) openerDoneRef.current = true;
      else void api.current.sayOpener?.();
    }, DAY_HELLO_DELAY_MS);
  }, [force, jumpTo, home, houseAt, sfx, later]);

  useEffect(() => {
    if (!cstate || startedRef.current) return;
    if (cstate.enabled && body === "loading") return;
    startedRef.current = true;
    if (cstate.enabled) appear();
  }, [cstate, appear, body]);

  useEffect(() => {
    if (body !== "loading" || !cstate?.enabled) return undefined;
    const t = window.setTimeout(() => setBody((b) => (b === "loading" ? "failed" : b)), BODY_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [body, cstate?.enabled]);

  /* ---------- tours ---------- */

  const { marks, setMarks } = useNovaMarks();
  // useNovaTour needs setHelp, so showMe reaches its ensureRoute through api
  const ensureRouteVia = useCallback((...a) => api.current.ensureRoute(...a), []);
  const { help, setHelp, startHelp, closeHelp, showMe, openAnswer } = useNovaHelp(core, { setMarks, ensureRoute: ensureRouteVia });
  const { tour, setTour, tourRef, ensureRoute, endTour, goStep, startTour } = useNovaTour(core, { setMarks, awardXp, setHelp, mode });

  /* The setup screen finished (see SetupScreen): she owns the saved state, so she marks it. */
  useEffect(() => {
    const onSetupDone = (e) => {
      if (!stateRef.current) return;
      e.preventDefault();
      update({ onboarded: true, ...(e.detail?.named ? { askedName: true } : {}) });
      if (e.detail?.tour) later(() => startTour("first-run"), SETUP_TOUR_DELAY_MS);
    };
    window.addEventListener("studyhub-setup-done", onSetupDone);
    return () => window.removeEventListener("studyhub-setup-done", onSetupDone);
  }, [update, later, startTour]);

  /* ---------- menu actions ---------- */

  const hideForNow = useCallback(() => {
    setBubble(null);
    setHelp(null);
    cancel();
    send("HIDE");
  }, [cancel, send]);

  const { quizDeck, glow, quizCourses, lastTierRef, startQuiz, onQuizAnswer, onQuizFinish, closeQuiz } = useNovaQuiz(core, { courses, awardXp, returnHome, setHelp, setMarks, onUpdateCourse });

  const { sync, syncRef, offline } = useNovaSync(core, { flashReaction, sfx });

  const contextualTour = useCallback(() => {
    const nav = navRef.current;
    const inUserCourse = nav.activeCourseId && nav.courses.some((c) => c.id === nav.activeCourseId);
    startTour(inUserCourse ? "course-tools" : "first-run");
  }, [startTour]);

  /* ---------- what she remembers ---------- */

  const { memoryActions } = useNovaMemoryVoice(core, { startQuiz });

  /* ---------- clicking & dragging Nova ---------- */

  const { dragging, dropMarkRef, dropTarget, menuLine, onScoutClick, onPointerDown, onPointerMove, onPointerUp } = useNovaDrag(core, { housedRef, houseAt, leaveHome, closeHelp });

  /* Anything she's engaged in (quiz, help, tour, briefing), a line she's saying, or a drag brings her back out. */
  const tucked = enabled && (place === "tuck" || (place === "lane" && !laneShown)) && (HOME_MODES.has(mode) || mode === "wander") && !dragging && !bubble;
  tuckedRef.current = tucked;
  useEffect(() => {
    const root = document.documentElement;
    if (tucked) root.dataset.novaTucked = "";
    else delete root.dataset.novaTucked;
    return () => delete root.dataset.novaTucked;
  }, [tucked]);

  /* ---------- autonomy: wander, perch, sleep ---------- */

  const movement = cstate?.movement || "normal";

  const quiet = !!cstate?.quiet;

  const visibleNow = !!cstate?.enabled && mode !== "hidden";
  /** Polling loops stop while the window is minimized/hidden; listeners that detect "back" still use visibleNow. */
  const shown = useSyncExternalStore(subscribeVisibility, pageShown);
  const ticking = visibleNow && shown;
  const bodyReady = use3d && body === "ready";

  const { seat, setSeat, wokeByRef } = useNovaAutonomy(core, {
    mode,
    enabled,
    movement,
    quiet,
    use3d,
    bodyReady,
    ticking,
    syncRef,
    lastTierRef,
    housedRef,
    leaveHome,
    awayRef,
  });

  /* ---------- idle life: staged by how long the student has been idle ---------- */

  const { stagesDoneRef, activity, idleLie, drowsy, glance, setGlance, doodle, setDoodle, penRef, doodleDrawnRef, glanceAtRect } = useNovaIdleLife(core, {
    mode,
    facing,
    bodyReady,
    ticking,
    quiet,
    syncRef,
    housedRef,
    setSeat,
  });

  /* ---------- the spoken briefing: she walks to what she's talking about ---------- */

  useNovaBriefing(core, { ensureRoute, setMarks, glanceAtRect, setGlance });

  const { dueNow } = useNovaNudges(core, { mode, flashReaction, startQuiz });

  /* ---------- Ask Nova: typed commands (see src/nova/commands.js) ---------- */
  const { focusUntil, stopFocus } = useNovaCommands(core, { startQuiz, startHelp, closeHelp });

  /* The message box (src/shell/NovaBar.jsx) talks to her through window events. */
  useEffect(() => {
    const engaged = () => ["tour", "greet", "quiz"].includes(modeRef.current);
    const onRun = (e) => {
      if (engaged()) return;
      e.preventDefault();
      void api.current.runCommand?.(e.detail);
    };
    const onAnswer = (e) => {
      if (!engaged() && openAnswer(e.detail)) e.preventDefault();
    };
    window.addEventListener("studyhub-nova-run", onRun);
    window.addEventListener("studyhub-nova-answer", onAnswer);
    return () => {
      window.removeEventListener("studyhub-nova-run", onRun);
      window.removeEventListener("studyhub-nova-answer", onAnswer);
    };
  }, [openAnswer]);

  /* ---------- the Director: what she does on her own next (see src/nova/director.js) ---------- */

  useNovaDirector(core, { dueNow, memoryActions, syncRef });

  // after useNovaCommands: its Ctrl+J listener must run before the input listener
  const { burst } = useNovaInput(core, {
    visibleNow,
    mode,
    bubble,
    flying,
    size,
    tour,
    housedRef,
    stagesDoneRef,
    wokeByRef,
    closeHelp,
    startHelp,
    endTour,
  });

  /* ---------- settings ---------- */

  const onSettingsChange = useCallback(
    (patch) => {
      if ("enabled" in patch) {
        update(patch);
        if (patch.enabled) {
          if (modeRef.current === "hidden") appear();
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

  const { settingsOpen, setSettingsOpen } = useNovaWindowEvents(core, { visibleNow, quiet, onSettingsChange });

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
    onGoHub?.("plan");
    later(fn, 300);
  };
  const layoutItems = [
    { id: "l-briefing", label: "BRIEFING", icon: "▦", onClick: pickLayout(() => arrangeWorkspace("briefing")) },
    { id: "l-grades", label: "GRADES", icon: "◔", onClick: pickLayout(() => arrangeWorkspace("grades")) },
    { id: "l-tidy", label: "TIDY UP", icon: "▤", onClick: pickLayout(() => arrangeWorkspace("tidy")) },
    ...(workspace.get().before ? [{ id: "l-back", label: "PUT IT BACK", icon: "↺", onClick: pickLayout(workspace.putBack) }] : []),
    { id: "l-menu", label: "BACK", icon: "‹", onClick: () => setMenuPage("main") },
  ];
  const mainItems = [
    ...(place === "session" || inSetup ? [] : [{ id: "quiz", label: "QUIZ ME", icon: "✦", onClick: () => startQuiz() }]),
    ...(onHub && !inSetup ? [{ id: "layout", label: "REARRANGE", icon: "▦", onClick: () => setMenuPage("layout") }] : []),
    ...(place === "session" || inSetup ? [] : [{ id: "tour", label: "SHOW ME AROUND", icon: "◎", onClick: contextualTour }]),
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
      <span ref={dropMarkRef} className="nv-drop" hidden aria-hidden />
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
          tucked ? "sc-scout--tucked" : "",
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
                    onReady={onBodyReady}
                    onFail={onBodyFail}
                    onHead={onHead}
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
          onToday={() => {
            closeQuiz();
            onGoHub?.("today");
          }}
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
            if (modeRef.current === "hidden") appear();
            window.dispatchEvent(new Event("studyhub-open-setup"));
          }}
        />
      ) : null}
    </div>,
    document.body
  );
}
