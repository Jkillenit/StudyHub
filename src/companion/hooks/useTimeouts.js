import { useEffect, useRef } from "react";

/** Tracked setTimeout: `later` ids are forgotten when they fire; `clearAll` cancels the rest. */
export function createTimeouts() {
  const ids = new Set();
  return {
    later(fn, ms) {
      const id = globalThis.setTimeout(() => {
        ids.delete(id);
        fn();
      }, ms);
      ids.add(id);
      return id;
    },
    clear(id) {
      globalThis.clearTimeout(id);
      ids.delete(id);
    },
    clearAll() {
      for (const id of ids) globalThis.clearTimeout(id);
      ids.clear();
    },
  };
}

/** `later(fn, ms)` for fire-and-forget timeouts that must not outlive the component. */
export function useTimeouts() {
  const ref = useRef(null);
  if (!ref.current) ref.current = createTimeouts();
  useEffect(() => () => ref.current.clearAll(), []);
  return ref.current.later;
}
