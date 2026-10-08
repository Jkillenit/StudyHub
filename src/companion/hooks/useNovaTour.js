import { useCallback, useEffect, useRef, useState } from "react";
import { line } from "../character.js";
import { clampPoint, pointBeside, standOnTarget, waitForTarget } from "../safeZones.js";
import { nextFrame, rectOf } from "../layer/geometry.js";
import { BUBBLE_W, ENGAGED_SPEED, TOURS } from "../layer/constants.js";

/** Guided tours: she walks step to step, spotlighting each target. */
export function useNovaTour(core, { setMarks, awardXp, setHelp, mode }) {
  const { stateRef, navRef, api, send, setBubble, say, setMood, update, cancel, flyTo, jumpTo, sizeRef, setFacing, setAnchor, pointAt, use3dRef, platRef } = core;
  const [tour, setTour] = useState(null);
  const tourRef = useRef(null);

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
  api.current.ensureRoute = ensureRoute;

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
      let on = null;
      if (el) {
        el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        await nextFrame();
        rect = el.getBoundingClientRect();
        on = use3dRef.current ? standOnTarget(el, s) : null;
        p = on || pointBeside(rect, s, step.placement);
      } else {
        p = { ...clampPoint({ x: window.innerWidth / 2 - s / 2, y: window.innerHeight / 2 - s }, s), side: "right" };
      }
      setTour((prev) => (prev ? { ...prev, rect: rect ? rectOf(rect) : null } : prev));
      await flyTo(p, { speed: ENGAGED_SPEED });
      if (tourRef.current !== t || t.token !== token) return;
      if (on) platRef.current = on.plat;

      if (rect) setFacing(p.x + s / 2 > rect.left + rect.width / 2 ? -1 : 1);
      setMood("point");
      if (el) pointAt(el.getBoundingClientRect());
      let h = p.side === "left" ? "left" : p.side === "right" ? "right" : p.x + s / 2 > window.innerWidth / 2 ? "left" : "right";
      const need = BUBBLE_W + 12;
      if (h === "right" && window.innerWidth - (p.x + s) < need && p.x >= need) h = "left";
      else if (h === "left" && p.x < need && window.innerWidth - (p.x + s) >= need) h = "right";
      setAnchor({ h, v: on ? (p.y > 200 ? "above" : "below") : p.y > window.innerHeight / 2 ? "above" : "below" });
      t.el = el;
      t.placement = step.placement;
      t.on = !!on;
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
          const on = t.on && use3dRef.current ? standOnTarget(t.el, sizeRef.current) : null;
          if (on) platRef.current = on.plat;
          jumpTo(on || pointBeside(t.el.getBoundingClientRect(), sizeRef.current, t.placement));
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

  return { tour, setTour, tourRef, ensureRoute, endTour, goStep, startTour };
}
