import { useEffect, useRef } from "react";
import { useReducedMotion } from "./motion.js";

const W = 1600;
const H = 1000;
const EMBERS = 34;

const f = (n) => n.toFixed(1);

function contour(cx, cy, r, seed) {
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const rr = r * (1 + 0.12 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 5 + seed * 2));
    pts.push(`${f(cx + Math.cos(a) * rr * 1.4)} ${f(cy + Math.sin(a) * rr)}`);
  }
  return `M${pts.join(" L")}Z`;
}

const CONTOURS = [
  ...[60, 100, 140, 180, 220].map((r, i) => contour(1250, 230, r, 1 + i * 0.35)),
  ...[50, 90, 130, 170].map((r, i) => contour(230, 790, r, 4 + i * 0.4)),
];

const TRENCHES = [
  "M0 880 L140 820 L170 860 L320 790 L350 830 L520 760 L560 800 L690 690",
  "M790 400 L830 300 L890 320 L950 200 L1010 220 L1070 90 L1110 0",
  "M920 560 L1040 590 L1060 550 L1240 600 L1260 560 L1420 610 L1440 570 L1600 640",
];

const PATHS = [
  "M0 300 Q300 250 560 330 T1100 350 T1600 290",
  "M200 1000 Q420 820 690 650",
  "M915 470 Q1180 430 1380 230 T1600 70",
];

const DIGS = [
  { x: 170, y: 130, s: 160, n: 4, label: "EX-01" },
  { x: 1080, y: 660, s: 200, n: 5, label: "EX-02" },
  { x: 560, y: 110, s: 120, n: 3, label: "EX-03" },
  { x: 1360, y: 760, s: 110, n: 2, label: "EX-04" },
  { x: 380, y: 590, s: 130, n: 3, label: "EX-05" },
];

const DIG_C = { x: 800, y: 520 };

const DIAL = Array.from({ length: 36 }, (_, i) => {
  const a = (i / 36) * Math.PI * 2;
  const r2 = i % 3 === 0 ? 138 : 128;
  return `M${f(DIG_C.x + Math.cos(a) * 120)} ${f(DIG_C.y + Math.sin(a) * 120)} L${f(DIG_C.x + Math.cos(a) * r2)} ${f(DIG_C.y + Math.sin(a) * r2)}`;
}).join(" ");

const COLS = "ABCDEFGH";

function DigSiteMap() {
  return (
    <svg className="sh-zb-map" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" fill="none" stroke="currentColor" strokeWidth="1">
      <g className="sh-zb-faint">
        {CONTOURS.map((d, i) => <path key={i} d={d} />)}
      </g>

      <g className="sh-zb-faint">
        {Array.from({ length: 7 }, (_, cx) => Array.from({ length: 4 }, (_, cy) => {
          const x = 200 + cx * 200;
          const y = 200 + cy * 200;
          return <path key={`${cx}-${cy}`} d={`M${x - 6} ${y} H${x + 6} M${x} ${y - 6} V${y + 6}`} />;
        }))}
      </g>

      <g>
        {Array.from({ length: W / 50 + 1 }, (_, i) => (
          <path key={`t${i}`} d={`M${i * 50} 40 V${i % 4 === 0 ? 54 : 46}`} />
        ))}
        {Array.from({ length: H / 50 + 1 }, (_, i) => (
          <path key={`l${i}`} d={`M40 ${i * 50} H${i % 4 === 0 ? 54 : 46}`} />
        ))}
      </g>
      <g className="sh-zb-label" stroke="none" fill="currentColor">
        {Array.from({ length: 8 }, (_, i) => (
          <text key={`c${i}`} x={i * 200 + 6} y="68">{COLS[i]}</text>
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <text key={`r${i}`} x="60" y={i * 200 + 4}>{String(i).padStart(2, "0")}</text>
        ))}
      </g>

      {TRENCHES.map((d, i) => (
        <g key={i}>
          <path d={d} strokeWidth="12" strokeLinejoin="miter" />
          <path d={d} className="sh-zb-knock" strokeWidth="10" strokeLinejoin="miter" />
        </g>
      ))}

      <g strokeDasharray="4 7">
        {PATHS.map((d, i) => <path key={i} d={d} />)}
      </g>

      {DIGS.map((d) => {
        const step = d.s / d.n;
        const inner = Array.from({ length: d.n - 1 }, (_, i) => {
          const o = step * (i + 1);
          return `M${d.x + o} ${d.y} V${d.y + d.s} M${d.x} ${d.y + o} H${d.x + d.s}`;
        }).join(" ");
        return (
          <g key={d.label}>
            <rect x={d.x} y={d.y} width={d.s} height={d.s} />
            <path className="sh-zb-faint" d={inner} />
            <text className="sh-zb-label" x={d.x} y={d.y - 8} stroke="none" fill="currentColor">{d.label}</text>
          </g>
        );
      })}

      <g>
        <circle cx={DIG_C.x} cy={DIG_C.y} r="120" />
        <circle cx={DIG_C.x} cy={DIG_C.y} r="86" strokeDasharray="2 5" />
        <circle cx={DIG_C.x} cy={DIG_C.y} r="40" />
        <circle cx={DIG_C.x} cy={DIG_C.y} r="8" />
        <path d={DIAL} />
        <path d={`M${DIG_C.x} ${DIG_C.y - 150} V${DIG_C.y - 180} M${DIG_C.x} ${DIG_C.y + 150} V${DIG_C.y + 180} M${DIG_C.x - 150} ${DIG_C.y} H${DIG_C.x - 180} M${DIG_C.x + 150} ${DIG_C.y} H${DIG_C.x + 180}`} />
        <text className="sh-zb-label" x={DIG_C.x + 134} y={DIG_C.y - 134} stroke="none" fill="currentColor">SITE 115</text>
      </g>

      <g className="sh-zb-label" stroke="none" fill="currentColor">
        <text x="1300" y="236">+12.4</text>
        <text x="250" y="796">+8.1</text>
        <text x="1500" y="900">N</text>
      </g>
      <path d="M1504 860 L1496 880 L1504 874 L1512 880 Z M1504 860 V830" />
    </svg>
  );
}

function spawn(e, w, h, dpr, anywhere) {
  e.x = Math.random() * w;
  e.y = anywhere ? Math.random() * h : h + Math.random() * h * 0.1;
  e.r = (0.6 + Math.random() * 1.2) * dpr;
  e.vy = (8 + Math.random() * 14) * dpr;
  e.sway = (6 + Math.random() * 14) * dpr;
  e.phase = Math.random() * Math.PI * 2;
  e.hot = Math.random() < 0.3;
}

function Embers({ reduced }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;
    const css = getComputedStyle(document.documentElement);
    const warm = css.getPropertyValue("--sh-accent-2").trim();
    const hot = css.getPropertyValue("--sh-accent").trim();
    const embers = Array.from({ length: EMBERS }, () => ({}));
    let w = 0;
    let h = 0;
    let dpr = 1;
    let t = 0;
    let raf = 0;
    let last = 0;

    const size = () => {
      dpr = window.devicePixelRatio || 1;
      w = canvas.width = canvas.offsetWidth * dpr;
      h = canvas.height = canvas.offsetHeight * dpr;
      embers.forEach((e) => spawn(e, w, h, dpr, true));
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const e of embers) {
        const x = e.x + Math.sin(t * 0.6 + e.phase) * e.sway;
        const a = 0.55 * Math.max(0, Math.min(1, e.y / h)) * (0.75 + 0.25 * Math.sin(t * 3 + e.phase));
        ctx.fillStyle = e.hot ? hot : warm;
        ctx.globalAlpha = a * 0.18;
        ctx.beginPath();
        ctx.arc(x, e.y, e.r * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const frame = (now) => {
      const dt = last ? Math.min(now - last, 100) / 1000 : 0;
      last = now;
      t += dt;
      for (const e of embers) {
        e.y -= e.vy * dt;
        if (e.y < -10 * dpr) spawn(e, w, h, dpr, false);
      }
      draw();
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (!reduced && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const onResize = () => {
      size();
      draw();
    };

    size();
    draw();
    start();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", start);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", start);
    };
  }, [reduced]);

  return <canvas ref={ref} className="sh-zb-embers" />;
}

/** Zombies pack art: dig-site map, drifting fog and rising embers, all behind the app. */
export function ZombiesBackdrop() {
  const reduced = useReducedMotion();
  return (
    <div className="sh-zb" aria-hidden="true">
      <DigSiteMap />
      <div className="sh-zb-fog sh-zb-fog-1" />
      <div className="sh-zb-fog sh-zb-fog-2" />
      <div className="sh-zb-fog sh-zb-fog-3" />
      <Embers reduced={reduced} />
    </div>
  );
}
