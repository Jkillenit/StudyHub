import { useEffect, useRef, useState } from "react";
import { dayPart } from "../idleDirector.js";
import { dueStage, mayPeek, pickProp } from "../idleStages.js";
import { buildDoodle, doodleBox, layoutDoodle, pickDoodle } from "../doodles.js";
import { findDoodleSpot, findPeekSpot, findTarget, seatClear } from "../safeZones.js";
import { rand } from "../layer/geometry.js";
import { DROWSY_MS, MOVE, READ_MS, SPRITE_SKIP } from "../layer/constants.js";

/** Idle life: staged activities (fidget, doodle, read, cards, doze, peek) by how long the student has been idle. */
export function useNovaIdleLife(core, { mode, facing, bodyReady, ticking, quiet, syncRef, housedRef, setSeat }) {
  const {
    stateRef,
    modeRef,
    api,
    send,
    setBubble,
    setMood,
    bubbleRef,
    memory,
    busy,
    playGesture,
    cancel,
    flyTo,
    sizeRef,
    awayFromSpotRef,
    lastInputRef,
    canAct,
    dragRef,
    setFacing,
    posRef,
    platRef,
    use3dRef,
    nodeRef,
    reduced,
    returningRef,
    activityRef,
  } = core;
  /* What ran this idle stretch, and what the body shows. */
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

  const bodyReadyRef = useRef(false);
  bodyReadyRef.current = bodyReady;
  const threeD = () => use3dRef.current && bodyReadyRef.current;
  useEffect(() => () => peekClipRef.current?.(), []);

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

  return { stagesDoneRef, activity, idleLie, drowsy, glance, setGlance, doodle, setDoodle, penRef, doodleDrawnRef, glanceAtRect };
}
