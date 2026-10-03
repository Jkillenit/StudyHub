import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { line } from "../character.js";
import { AUTONOMOUS } from "../machine.js";
import { clampPoint, pickStroll, platformBelow } from "../safeZones.js";
import { isAtSpot } from "../attention.js";
import { homeGeometry, homeSpot, markStage, randInt } from "../layer/geometry.js";
import {
  BACK_AFTER_DROP_MS,
  ENGAGED_SPEED,
  GROW_MS,
  HOME_AWAY_STOPS,
  HOME_RETURN_DELAY_MS,
  LAND_QUIP_COOLDOWN_MS,
  MOVE,
  WALK_OFF_MS,
} from "../layer/constants.js";

/**
 * Where she stands: big inside the Today home window, normal size everywhere else, back to her
 * spot after wandering, and feet on something after a drop or fall.
 */
export function useNovaPlacement(core, { baseSize, enabled, stageActive }) {
  const {
    stateRef,
    modeRef,
    navRef,
    api,
    send,
    setBubble,
    say,
    setMood,
    refreshAnchor,
    later,
    busy,
    playGesture,
    cancel,
    flyTo,
    dropTo,
    jumpTo,
    posRef,
    platRef,
    sizeRef,
    baseSizeRef,
    awayFromSpotRef,
    returningRef,
    activityRef,
    canAct,
    dragRef,
    use3dRef,
    home,
    sfx,
    reduced,
    housedRef,
  } = core;
  const growRef = useRef(null);
  /** Standing big inside the Today home window. `homeSize` is her size there. */
  const [housed, setHoused] = useState(false);
  const [homeSize, setHomeSize] = useState(null);
  const awayRef = useRef({ stops: 0, goal: randInt(HOME_AWAY_STOPS) });
  const lastLandQuipRef = useRef(0);
  const size = housed && homeSize ? homeSize : baseSize;

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
    refreshAnchor();
    return true;
  }, [jumpTo, refreshAnchor]);
  api.current.houseAt = houseAt;

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
    let t = 0;
    const tryHome = () => {
      if (housedRef.current) return;
      /* A quiz runs from the session lane: snap straight in. */
      if (modeRef.current === "quiz" && !dragRef.current && houseAt()) return;
      /* Busy, asleep, or engaged (e.g. falling after the window resized): try again once she's settled. */
      if (!AUTONOMOUS.has(modeRef.current) || busy() || dragRef.current) {
        t = window.setTimeout(tryHome, HOME_RETURN_DELAY_MS);
        return;
      }
      void api.current.goHome();
    };
    t = window.setTimeout(tryHome, HOME_RETURN_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [stageActive, enabled, leaveHome, busy, houseAt]);

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

  /** After a drop she lingers a beat, then heads back to her spot (the home window on Today). */
  api.current.returnAfterDrop = () => {
    later(() => {
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
    later(async () => {
      if (modeRef.current !== "idle" || busy() || !canAct()) return;
      const step = pickStroll(sizeRef.current, posRef.current, platRef.current, { sameOnly: true });
      if (!step) return;
      send("WANDER");
      const walked = await flyTo(step, { speed: (MOVE[stateRef.current?.movement] || MOVE.normal).speed, walk: true });
      if (walked && modeRef.current === "wander") send("ARRIVE");
    }, WALK_OFF_MS);
  };

  return { housed, size, growRef, awayRef, houseAt, leaveHome, returnHome };
}
