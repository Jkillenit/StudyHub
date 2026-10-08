import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fieldState } from "../../shell/fieldEvents.js";
import { LINK_FADE_MS, LINK_HOLD_MS, LINK_MAX_MS, THINK_MIN_MS } from "../layer/constants.js";

const ROW = '[data-nova-anchor^="home.row"]';
/** The stream is re-aimed only when a line end moves this far, so her idle sway doesn't re-send it every frame. */
const STREAM_STEP_PX = 4;

/**
 * What the particle field shows of her: "thinking" while a message is pending (`api.current.think`),
 * "pointing" while the link line runs from her head to a Today row she's talking about
 * (`api.current.linkTo`), "idle" otherwise. The line holds while she speaks (up to LINK_MAX_MS), then fades.
 */
export function useNovaField(core, { bodyRef, visibleNow, speaking }) {
  const { api, later, nodeRef, reducedRef } = core;
  /** `{ id, out }` while the line shows; `out` once it's fading. */
  const [link, setLink] = useState(null);
  const lineRef = useRef(null);
  const linkElRef = useRef(null);
  const linkIdRef = useRef(0);
  const linkStartRef = useRef(0);
  const pendingRef = useRef(0);
  /** The line's ends while it streams particles, else null. */
  const pointsRef = useRef(null);
  const sentRef = useRef(null);
  const visibleRef = useRef(visibleNow);
  visibleRef.current = visibleNow;

  const sync = useCallback(() => {
    const on = visibleRef.current;
    const pts = on ? pointsRef.current : null;
    const state = pts ? "pointing" : on && pendingRef.current > 0 ? "thinking" : "idle";
    const key = pts ? [pts.from.x, pts.from.y, pts.to.x, pts.to.y].map((v) => Math.round(v / STREAM_STEP_PX)).join() : state;
    if (key === sentRef.current) return;
    sentRef.current = key;
    if (pts) fieldState("pointing", pts.from, pts.to);
    else fieldState(state);
  }, []);

  api.current.think = (work) => {
    pendingRef.current += 1;
    sync();
    const min = new Promise((r) => later(r, reducedRef.current ? 0 : THINK_MIN_MS));
    void Promise.all([Promise.resolve(work).catch(() => {}), min]).then(() => {
      pendingRef.current -= 1;
      sync();
    });
    return work;
  };

  api.current.linkTo = (el) => {
    if (!visibleRef.current || !el?.matches?.(ROW)) return;
    linkElRef.current = el;
    linkIdRef.current += 1;
    linkStartRef.current = performance.now();
    setLink({ id: linkIdRef.current, out: false });
  };

  const linkId = link?.id || 0;
  const linkOut = !!link?.out;

  /* Keep the line on her head and the row while either moves. */
  useLayoutEffect(() => {
    if (!linkId) return undefined;
    let raf = 0;
    const frame = () => {
      const el = linkElRef.current;
      const node = nodeRef.current;
      if (!el?.isConnected || !node) {
        pointsRef.current = null;
        sync();
        setLink(null);
        return;
      }
      const box = node.getBoundingClientRect();
      const head = bodyRef.current?.headPx;
      const from = head ? { x: box.left + head.x, y: box.top + head.y } : { x: box.left + box.width / 2, y: box.top };
      const r = el.getBoundingClientRect();
      const to = { x: r.left, y: r.top + r.height / 2 };
      const line = lineRef.current;
      if (line) {
        line.setAttribute("x1", from.x);
        line.setAttribute("y1", from.y);
        line.setAttribute("x2", to.x);
        line.setAttribute("y2", to.y);
      }
      pointsRef.current = linkOut ? null : { from, to };
      sync();
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      pointsRef.current = null;
      sync();
    };
  }, [linkId, linkOut, nodeRef, bodyRef, sync]);

  useEffect(() => {
    if (!linkId) return undefined;
    if (linkOut) {
      const t = window.setTimeout(() => setLink(null), LINK_FADE_MS);
      return () => window.clearTimeout(t);
    }
    const end = () => setLink((l) => (l?.id !== linkId ? l : reducedRef.current ? null : { ...l, out: true }));
    const cap = window.setTimeout(end, Math.max(0, linkStartRef.current + LINK_MAX_MS - performance.now()));
    const hold = speaking ? 0 : window.setTimeout(end, LINK_HOLD_MS);
    return () => {
      window.clearTimeout(cap);
      window.clearTimeout(hold);
    };
  }, [linkId, linkOut, speaking, reducedRef]);

  useEffect(() => {
    if (!visibleNow) setLink(null);
    sync();
  }, [visibleNow, sync]);

  useEffect(
    () => () => {
      visibleRef.current = false;
      sync();
    },
    [sync]
  );

  return { link, lineRef };
}
