import { useEffect, useRef, useState } from "react";
import { line } from "../character.js";
import { isRampant } from "../companionStore.js";
import { BORED_AFTER_MS, clockLabel, dayPart, idleGap, pickIdleGesture } from "../idleDirector.js";
import { WAKE_DENIAL_CHANCE } from "../idleStages.js";
import { AUTONOMOUS } from "../machine.js";
import { coversContent, livePlatform, pickRestEdge, pickStroll, pickWaypoint, platformAt, seatClear } from "../safeZones.js";
import { nextCheckMs } from "../attention.js";
import { rand } from "../layer/geometry.js";
import { HOME_STAY_MS, LATE_QUIP_COOLDOWN_MS, MOVE, REST_CHANCE, REST_MS, SIT_CHANCE, SIT_DELAY_MS } from "../layer/constants.js";

/** Autonomy: she wanders, perches and sits on her own, plays idle gestures, startles awake, and keeps her feet on something. */
export function useNovaAutonomy(core, { mode, enabled, movement, quiet, use3d, bodyReady, ticking, syncRef, lastTierRef, housedRef, leaveHome, awayRef }) {
  const {
    stateRef,
    modeRef,
    navRef,
    api,
    send,
    say,
    setMood,
    refreshAnchor,
    bubbleRef,
    later,
    memory,
    busy,
    playGesture,
    lastGestureAtRef,
    flyTo,
    jumpTo,
    posRef,
    platRef,
    sizeRef,
    awayFromSpotRef,
    lastInputRef,
    lastStudyRef,
    lastActivityRef,
    canAct,
    dragRef,
    use3dRef,
    activityRef,
    reduced,
  } = core;
  const lastLateQuipRef = useRef(0);
  const [seat, setSeat] = useState(null);
  const seatRef = useRef(null);
  seatRef.current = seat;
  /** The input that woke her, so the "I wasn't asleep" line only follows a mouse or touch. */
  const wokeByRef = useRef(null);
  /** A deliberate sit (resting on a panel edge) holds until this time. */
  const sitHoldRef = useRef(0);

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

  /*
   * 3D idle life: every 20-45s (scaled by movement) she yawns, looks around, gets bored or
   * stretches. Checked on a steady tick so it survives idle/wander/perch hops.
   */
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
        later(() => {
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
    later(async () => {
      if (!AUTONOMOUS.has(modeRef.current) || bubbleRef.current || stateRef.current?.quiet) return;
      const pick = await memory.lineFor("wakeDenial", {});
      if (!pick || bubbleRef.current) return;
      memory.markSaid(pick);
      setMood("stern");
      refreshAnchor();
      say(pick.text);
    }, 1100);
  }, [mode, bodyReady, playGesture, memory, refreshAnchor, say]);
  /*
   * 3D: keep her feet on something. She rides her platform when it scrolls, and falls to
   * whatever is below when it disappears (or when an engaged move left her mid-air).
   */
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

  return { seat, setSeat, wokeByRef };
}
