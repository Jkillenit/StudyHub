import { useEffect, useRef } from "react";
import { useReducedMotion } from "./motion.js";
import { usePack } from "./pack.js";
import { AMBIENT_LINES, ambientAlpha, ambientY } from "./ambient.js";

export function AmbientBackground() {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const pack = usePack();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;
    const css = getComputedStyle(document.documentElement);
    const colors = ["--sh-accent", "--sh-accent-2"].map((v) => css.getPropertyValue(v).trim());
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
      for (let i = 0; i < AMBIENT_LINES; i++) {
        ctx.strokeStyle = colors[i % 2];
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
  }, [reduced, pack]);

  return <canvas ref={ref} className="sh-ambient" aria-hidden="true" />;
}
