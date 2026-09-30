import { useCallback, useEffect, useRef, useState } from "react";

const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

const TELEPORT_MIN = 240;
const TP_OUT_MS = 200;
const TP_IN_MS = 300;

/**
 * Moves the sprite by writing a transform straight to the DOM node. A requestAnimationFrame
 * loop runs only during a glide, so an idle companion costs nothing per frame. Long moves
 * are teleports: the `.sc-fx` wrapper dissolves out, the node jumps, then it re-forms.
 * `flyTo` resolves true on arrival, false if another move interrupted it.
 */
export function useCompanionMotion(nodeRef, { reduced = false, onTeleport } = {}) {
  const posRef = useRef({ x: -200, y: -200 });
  const flightRef = useRef(null);
  const rafRef = useRef(0);
  const onTeleportRef = useRef(onTeleport);
  onTeleportRef.current = onTeleport;
  const [flying, setFlying] = useState(false);
  const [facing, setFacing] = useState(1);

  const apply = useCallback(
    (p) => {
      const n = nodeRef.current;
      if (n) n.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
    },
    [nodeRef]
  );

  const fx = useCallback(() => nodeRef.current?.querySelector(".sc-fx") || null, [nodeRef]);

  const cancel = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const f = flightRef.current;
    flightRef.current = null;
    if (f) {
      f.timers?.forEach((t) => window.clearTimeout(t));
      fx()?.classList.remove("sc-tp-out", "sc-tp-in");
      setFlying(false);
      f.resolve(false);
    }
  }, [fx]);

  const jumpTo = useCallback(
    (p) => {
      cancel();
      posRef.current = { x: p.x, y: p.y };
      apply(posRef.current);
    },
    [cancel, apply]
  );

  const teleport = useCallback(
    (target) =>
      new Promise((resolve) => {
        const flight = { resolve, timers: [] };
        flightRef.current = flight;
        setFlying(true);
        fx()?.classList.add("sc-tp-out");
        onTeleportRef.current?.("out");
        flight.timers.push(
          window.setTimeout(() => {
            if (flightRef.current !== flight) return;
            posRef.current = { x: target.x, y: target.y };
            apply(posRef.current);
            const el = fx();
            el?.classList.remove("sc-tp-out");
            el?.classList.add("sc-tp-in");
            onTeleportRef.current?.("in");
            flight.timers.push(
              window.setTimeout(() => {
                if (flightRef.current !== flight) return;
                fx()?.classList.remove("sc-tp-in");
                flightRef.current = null;
                setFlying(false);
                resolve(true);
              }, TP_IN_MS)
            );
          }, TP_OUT_MS)
        );
      }),
    [apply, fx]
  );

  const flyTo = useCallback(
    (target, { speed = 90, teleport: allowTeleport = true } = {}) => {
      cancel();
      const from = { ...posRef.current };
      const dx = target.x - from.x;
      const dy = target.y - from.y;
      const dist = Math.hypot(dx, dy);
      if (reduced || dist < 3) {
        posRef.current = { x: target.x, y: target.y };
        apply(posRef.current);
        return Promise.resolve(true);
      }
      if (Math.abs(dx) > 4) setFacing(dx >= 0 ? 1 : -1);
      if (allowTeleport && dist > TELEPORT_MIN) return teleport(target);
      const bend = (Math.random() - 0.5) * 0.3 * dist;
      const c = {
        x: (from.x + target.x) / 2 + (-dy / dist) * bend,
        y: (from.y + target.y) / 2 + (dx / dist) * bend,
      };
      const duration = Math.min(4500, Math.max(260, (dist / speed) * 1000));
      setFlying(true);
      return new Promise((resolve) => {
        const flight = { from, c, to: { x: target.x, y: target.y }, start: performance.now(), duration, resolve };
        flightRef.current = flight;
        const step = (now) => {
          if (flightRef.current !== flight) return;
          const t = Math.min(1, (now - flight.start) / flight.duration);
          const e = ease(t);
          const u = 1 - e;
          posRef.current = {
            x: u * u * flight.from.x + 2 * u * e * flight.c.x + e * e * flight.to.x,
            y: u * u * flight.from.y + 2 * u * e * flight.c.y + e * e * flight.to.y,
          };
          apply(posRef.current);
          if (t < 1) {
            rafRef.current = requestAnimationFrame(step);
          } else {
            rafRef.current = 0;
            flightRef.current = null;
            setFlying(false);
            resolve(true);
          }
        };
        rafRef.current = requestAnimationFrame(step);
      });
    },
    [cancel, apply, reduced, teleport]
  );

  useEffect(() => cancel, [cancel]);

  return { posRef, flyTo, jumpTo, cancel, flying, facing, setFacing };
}
