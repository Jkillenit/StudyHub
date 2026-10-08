import { useEffect } from "react";
import { fieldDim, fieldEmit } from "../../shell/fieldEvents.js";

/** What fades out in focus mode (same list as the html[data-focus-dissolve] CSS): everything but the top row, Nova and the focus pill. */
const DISSOLVE = [
  ".sh-rail",
  ".sh-titlebar",
  ".sh-home-strip",
  ".sh-home-meta",
  ".sh-home-greeting",
  ".sh-home-line",
  ".sh-home-list > li:not(:has(.sh-home-row--top))",
  ".sh-home-empty",
  ".sh-home-link",
  '[data-nova-anchor="home.composer"]',
  ".sh-plan",
  ".sh-shell-body",
].join(",");
const MAX_RECTS = 12;
/** The fade back runs this long before the attribute goes (matches the CSS transition). */
const DISSOLVE_MS = 500;

/**
 * Focus mode dissolves the screen into the field: particles drift up off every visible block,
 * the blocks fade to almost nothing, and the field dims. Ending focus brings it all back.
 */
export function useNovaFocusDissolve(core, { focusUntil }) {
  const { reducedRef } = core;
  const on = focusUntil > 0;

  useEffect(() => {
    if (!on) return undefined;
    const root = document.documentElement;
    if (!reducedRef.current) {
      const rects = [...document.querySelectorAll(DISSOLVE)]
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
