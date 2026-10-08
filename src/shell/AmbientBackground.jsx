import { useEffect, useRef } from "react";
import { useReducedMotion } from "./motion.js";
import { usePack } from "./pack.js";
import { AMBIENT_LINES, ambientAlpha, ambientY } from "./ambient.js";
import { ZombiesBackdrop } from "./ZombiesBackdrop.jsx";

/** 2D fallback when WebGL is unavailable: slow sine lines. */
function drawLines(canvas, reduced) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const color = getComputedStyle(document.documentElement).getPropertyValue("--sh-accent").trim();
  let w = 0;
  let h = 0;
  let t = 0;
  let raf = 0;
  const size = () => {
    const dpr = window.devicePixelRatio || 1;
    w = canvas.width = canvas.offsetWidth * dpr;
    h = canvas.height = canvas.offsetHeight * dpr;
    ctx.lineWidth = dpr;
  };
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = color;
    for (let i = 0; i < AMBIENT_LINES; i++) {
      ctx.globalAlpha = ambientAlpha(i, t);
      ctx.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const y = ambientY(i, AMBIENT_LINES, x, w, h, t);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };
  let last = 0;
  const frame = (now) => {
    if (last) t += Math.min(now - last, 100) / 1000;
    last = now;
    draw();
    raf = requestAnimationFrame(frame);
  };
  const onResize = () => {
    size();
    if (reduced) draw();
  };
  size();
  window.addEventListener("resize", onResize);
  if (reduced) draw();
  else frame();
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
  };
}

/** The particle field behind everything (src/shell/field.js), or sine lines without WebGL. */
export function AmbientBackground() {
  const ref = useRef(null);
  const fieldRef = useRef(null);
  const reduced = useReducedMotion();
  const pack = usePack();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    let alive = true;
    let cleanup = () => {};
    import("./field.js")
      .then(({ createField }) => {
        if (!alive) return;
        const field = createField(canvas, { reduced });
        fieldRef.current = field;
        cleanup = () => {
          field.dispose();
          fieldRef.current = null;
        };
      })
      .catch(() => {
        if (alive) cleanup = drawLines(canvas, reduced);
      });
    return () => {
      alive = false;
      cleanup();
    };
  }, [reduced]);

  useEffect(() => {
    fieldRef.current?.recolor();
  }, [pack]);

  return (
    <>
      {pack === "zombies" && <ZombiesBackdrop />}
      <canvas key={reduced ? "still" : "live"} ref={ref} className="sh-ambient" aria-hidden="true" />
    </>
  );
}
