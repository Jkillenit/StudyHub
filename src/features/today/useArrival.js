import { useCallback, useEffect, useRef, useState } from "react";
import { loadJson, saveJson } from "../../lib/storage.js";
import { localDateString } from "../../study/sm2.js";
import { useReducedMotion } from "../../shell/motion.js";

const KEY = "studyHub.v2.ui.arrivalDay";
export const ARRIVAL_MS = 2500;
export const STAGGER_MS = 70;

/** Setup already introduced her: skip today's arrival greeting. */
export const markArrivedToday = () => saveJson(KEY, localDateString());

/**
 * The once-a-day arrival: true for about 2.5s on the first Today open of the day, never with
 * reduced motion. Any click or key skips straight to the settled screen. Nova greets once
 * (and says `greeting` when given), reduced motion or not.
 */
export function useArrival(ready, greeting) {
  const reduced = useReducedMotion();
  const [arriving, setArriving] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!ready || startedRef.current) return;
    startedRef.current = true;
    const today = localDateString();
    if (loadJson(KEY, null) === today) return;
    saveJson(KEY, today);
    window.dispatchEvent(new CustomEvent("studyhub-companion-greet", { detail: greeting ? { text: greeting } : undefined }));
    if (!reduced) setArriving(true);
  }, [ready, reduced, greeting]);

  const skip = useCallback(() => setArriving(false), []);

  useEffect(() => {
    if (!arriving) return undefined;
    const t = window.setTimeout(skip, ARRIVAL_MS);
    window.addEventListener("pointerdown", skip, true);
    window.addEventListener("keydown", skip, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", skip, true);
      window.removeEventListener("keydown", skip, true);
    };
  }, [arriving, skip]);

  return { arriving: arriving && !reduced, skip };
}

/** Counts from 0 to `value` while `active`; otherwise returns `value` as-is. */
export function useCountUp(value, active, duration = 1100) {
  const [shown, setShown] = useState(active ? 0 : value);
  useEffect(() => {
    if (!active || value == null) {
      setShown(value);
      return undefined;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(value * (1 - (1 - t) ** 3));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, active, duration]);
  return shown;
}

/** Reveals `length` characters over time while `active`; returns how many to show. */
export function useTyping(length, active, msPerChar = 16, delay = 300) {
  const [count, setCount] = useState(active ? 0 : length);
  useEffect(() => {
    if (!active) {
      setCount(length);
      return undefined;
    }
    setCount(0);
    let raf = 0;
    const start = performance.now() + delay;
    const step = (now) => {
      const n = Math.max(0, Math.floor((now - start) / msPerChar));
      setCount(Math.min(length, n));
      if (n < length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [length, active, msPerChar, delay]);
  return count;
}
