import { useEffect, useRef } from "react";

/** Pen speeds in px/s: drawing, and moving between strokes with the pen up. */
const DRAW_SPEED = 240;
const LIFT_SPEED = 700;
/** Each bit of trail stays lit this long, then fades out over FADE_MS. */
const HOLD_MS = 2600;
const FADE_MS = 1800;
/** Cut short by input: everything fades out this fast. */
const ABORT_FADE_MS = 280;

function tokenColor(name) {
  const s = getComputedStyle(document.documentElement);
  return s.getPropertyValue(name).trim() || s.getPropertyValue("--sh-accent").trim();
}

/** Flatten strokes into segments with the time the pen reaches each one. */
function plan(strokes) {
  const segs = [];
  let t = 0;
  let prev = null;
  for (const s of strokes) {
    if (!s.length) continue;
    if (prev) t += (Math.hypot(s[0].x - prev.x, s[0].y - prev.y) / LIFT_SPEED) * 1000;
    for (let i = 1; i < s.length; i += 1) {
      const a = s[i - 1];
      const b = s[i];
      const ms = (Math.hypot(b.x - a.x, b.y - a.y) / DRAW_SPEED) * 1000;
      segs.push({ a, b, t0: t, t1: t + ms });
      t += ms;
    }
    prev = s[s.length - 1];
  }
  return { segs, total: t };
}

/**
 * Nova's glowing light trail. Draws `doodle.strokes` (screen px) at pen speed, writes the pen
 * position to `penRef` for her arm, and lets the trail fade a few seconds behind the pen.
 * `onDrawn` fires when the last stroke is down, `onGone` once it has faded away.
 */
export function DoodleTrail({ doodle, penRef, onDrawn, onGone }) {
  const canvasRef = useRef(null);
  const cbRef = useRef({ onDrawn, onGone });
  cbRef.current = { onDrawn, onGone };
  const abortRef = useRef(0);

  useEffect(() => {
    if (doodle?.abort && !abortRef.current) abortRef.current = performance.now();
  }, [doodle?.abort]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !doodle) return undefined;
    abortRef.current = doodle.abort ? performance.now() : 0;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const color = tokenColor(doodle.color === "crimson" ? "--sh-crimson-glow" : "--sh-accent");
    const { segs, total } = plan(doodle.strokes);
    const start = performance.now();
    let drawn = false;
    let raf = 0;
    const frame = (now) => {
      const t = now - start;
      const aborted = abortRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      let head = null;
      let lit = false;
      for (const s of segs) {
        if (s.t0 > t) break;
        const f = Math.min(1, (t - s.t0) / Math.max(1, s.t1 - s.t0));
        const end = { x: s.a.x + (s.b.x - s.a.x) * f, y: s.a.y + (s.b.y - s.a.y) * f };
        let alpha = 1 - Math.max(0, t - s.t1 - HOLD_MS) / FADE_MS;
        if (aborted) alpha = Math.min(alpha, 1 - (now - aborted) / ABORT_FADE_MS);
        if (f < 1) head = end;
        if (alpha <= 0) continue;
        lit = true;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2.4;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(s.a.x, s.a.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      if (head && !aborted) {
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 18;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (penRef) penRef.current = !aborted && t < total ? head || penRef.current : null;
      if (!drawn && (t >= total || aborted)) {
        drawn = true;
        cbRef.current.onDrawn?.();
      }
      if (drawn && !lit) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cbRef.current.onGone?.();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    if (penRef) penRef.current = doodle.strokes[0]?.[0] || null;
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (penRef) penRef.current = null;
    };
  }, [doodle?.id]);

  return <canvas ref={canvasRef} className="sc-doodle" aria-hidden />;
}
