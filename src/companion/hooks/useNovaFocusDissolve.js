import { useEffect } from "react";
import { fieldDim, fieldEmit } from "../../shell/fieldEvents.js";

const MAX_RECTS = 12;
/** The fade back runs this long before the attribute goes (matches the CSS transition). */
const DISSOLVE_MS = 500;

/**
 * Focus mode dissolves Today into the field: particles drift up off every visible `[data-dissolve]`
 * block, the CSS fades those blocks to almost nothing (only while Today is on screen), and the
 * field dims. Ending focus brings it all back.
 */
export function useNovaFocusDissolve(core, { focusUntil }) {
  const { reducedRef } = core;
  const on = focusUntil > 0;

  useEffect(() => {
    if (!on) return undefined;
    const root = document.documentElement;
    if (!reducedRef.current && document.querySelector(".sh-home")) {
      const rects = [...document.querySelectorAll("[data-dissolve]")]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight)
        .slice(0, MAX_RECTS);
      for (const r of rects) {
        fieldEmit(r, { x: r.left + r.width / 2 + (Math.random() - 0.5) * 120, y: Math.max(0, r.top - 40 - Math.random() * 80) }, 40);
      }
    }
    root.dataset.focusDissolve = "on";
    fieldDim(0.5);
    return () => {
      root.dataset.focusDissolve = "out";
      fieldDim(0);
      window.setTimeout(() => {
        if (root.dataset.focusDissolve === "out") delete root.dataset.focusDissolve;
      }, DISSOLVE_MS);
    };
  }, [on, reducedRef]);
}
