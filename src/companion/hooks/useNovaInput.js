import { useEffect, useRef, useState } from "react";
import { line } from "../character.js";
import { AUTONOMOUS } from "../machine.js";
import { clampPoint, groundPlatform, standOn } from "../safeZones.js";
import { BURST_MS, RETURN_AWAY_MS, TALK_MS_PER_CHAR } from "../layer/constants.js";

/**
 * Input and window glue: welcome back after time away, global input (idle clock, wake, back to
 * her spot, cursor shyness, summon hotkey), outside click, Escape/resize, and bubble/anchor/talk upkeep.
 */
export function useNovaInput(
  core,
  { visibleNow, mode, bubble, flying, size, tour, housedRef, stagesDoneRef, wokeByRef, closeHelp, startHelp, endTour, dockPoint }
) {
  const {
    stateRef,
    modeRef,
    api,
    send,
    force,
    update,
    setBubble,
    say,
    setMood,
    refreshAnchor,
    bubbleRef,
    later,
    busy,
    playGesture,
    setTalkUntil,
    cancel,
    flyTo,
    jumpTo,
    posRef,
    platRef,
    sizeRef,
    awayFromSpotRef,
    sfx,
    lastActivityRef,
    lastInputRef,
    lastTypingRef,
    dragRef,
    use3dRef,
    nodeRef,
  } = core;
  const [burst, setBurst] = useState(0);
  const lastDriftRef = useRef(0);

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
      later(() => {
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

  return { burst };
}
