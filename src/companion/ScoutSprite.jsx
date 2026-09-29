import { useEffect, useId, useState } from "react";

const ANTENNA_POSE = {
  neutral: [-8, 8],
  happy: [-14, 14],
  excited: [-20, 20],
  sad: [-52, 52],
  confused: [-8, 38],
  thinking: [-4, 4],
  point: [-16, 10],
  sleep: [-60, 60],
};

function Eyes({ mood }) {
  if (mood === "happy" || mood === "excited") {
    return (
      <g className="sc-eyes">
        <path d="M25 36 Q28.5 31 32 36" />
        <path d="M36 36 Q39.5 31 43 36" />
      </g>
    );
  }
  if (mood === "sleep") {
    return (
      <g className="sc-eyes">
        <path d="M25.5 35.5 Q28.5 38 31.5 35.5" />
        <path d="M36.5 35.5 Q39.5 38 42.5 35.5" />
      </g>
    );
  }
  const lookUp = mood === "thinking" ? -1.6 : 0;
  const squint = mood === "confused";
  return (
    <g className="sc-eyes sc-eyes--open">
      <ellipse cx="28.5" cy={35 + lookUp} rx="3.6" ry={squint ? 2.6 : mood === "sad" ? 4 : 4.8} />
      <ellipse cx="39.5" cy={35 + lookUp} rx="3.6" ry={mood === "sad" ? 4 : 4.8} />
      <circle className="sc-eye-shine" cx="29.8" cy={33.2 + lookUp} r="1.3" />
      <circle className="sc-eye-shine" cx="40.8" cy={33.2 + lookUp} r="1.3" />
      {mood === "sad" ? (
        <g className="sc-brows">
          <path d="M25 30 L31 31.6" />
          <path d="M43 30 L37 31.6" />
        </g>
      ) : null}
      {squint ? (
        <g className="sc-brows">
          <path d="M25 31.5 L31.5 32.5" />
        </g>
      ) : null}
    </g>
  );
}

const MOUTHS = {
  neutral: "M31.5 42.5 Q34 44.6 36.5 42.5",
  happy: "M30.5 41.8 Q34 47 37.5 41.8",
  excited: "M30 41.5 Q34 48 38 41.5 Z",
  sad: "M31 44.6 Q34 42 37 44.6",
  confused: "M31 43.6 L37 42.4",
  thinking: "M33 43 Q35 44.2 37 43",
  point: "M31 42.4 Q34 45.5 37 42.4",
};

function Accessory({ id }) {
  if (id === "glasses") {
    return (
      <g className="sc-acc sc-acc--glasses">
        <circle cx="28.5" cy="35" r="5" />
        <circle cx="39.5" cy="35" r="5" />
        <path d="M33.5 35 L34.5 35" />
      </g>
    );
  }
  if (id === "cap") {
    return (
      <g className="sc-acc sc-acc--cap">
        <path className="sc-acc-fill" d="M21 20 L34 14.5 L47 20 L34 25.5 Z" />
        <path className="sc-acc-fill" d="M27 22.5 L27 26 Q34 29 41 26 L41 22.5" />
        <path className="sc-acc-tassel" d="M47 20 L47 27" />
        <circle className="sc-acc-tassel-end" cx="47" cy="28" r="1.3" />
      </g>
    );
  }
  if (id === "headlamp") {
    return (
      <g className="sc-acc sc-acc--headlamp">
        <path d="M19.5 29 Q34 21.5 48.5 29" />
        <circle className="sc-acc-lamp" cx="34" cy="25" r="2.8" />
      </g>
    );
  }
  return null;
}

/**
 * Scout, drawn in SVG from theme tokens. Props match the companion spec so the art can be
 * swapped without touching behavior: mood, glow (0-5), facing (1 right / -1 left), flying.
 */
export function ScoutSprite({ mood = "neutral", glow = 1, facing = 1, flying = false, accessory = "none", size = 56 }) {
  const gid = useId().replace(/:/g, "");
  const [blink, setBlink] = useState(false);
  const [left, right] = ANTENNA_POSE[mood] || ANTENNA_POSE.neutral;
  const g = Math.max(0, Math.min(5, glow));

  useEffect(() => {
    if (mood === "sleep" || mood === "happy" || mood === "excited") return undefined;
    let t;
    let off;
    const schedule = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        off = window.setTimeout(() => {
          setBlink(false);
          schedule();
        }, 130);
      }, 3000 + Math.random() * 3000);
    };
    schedule();
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(off);
    };
  }, [mood]);

  return (
    <svg
      className={`sc-sprite sc-mood--${mood}${flying ? " sc-flying" : ""}${blink ? " sc-blink" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ transform: `scaleX(${facing < 0 ? -1 : 1})` }}
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id={`${gid}-glow`}>
          <stop offset="0%" style={{ stopColor: "var(--sh-green)", stopOpacity: 0.9 }} />
          <stop offset="100%" style={{ stopColor: "var(--sh-green)", stopOpacity: 0 }} />
        </radialGradient>
      </defs>

      <circle className="sc-halo" cx="17" cy="46" r="17" fill={`url(#${gid}-glow)`} style={{ opacity: 0.1 + g * 0.16 }} />
      <ellipse className="sc-lantern" cx="17.5" cy="45.5" rx="8.5" ry="7.5" style={{ fillOpacity: 0.3 + g * 0.14 }} />

      <g className="sc-wings">
        <g transform="rotate(-32 24 24)">
          <ellipse className="sc-wing sc-wing--l" cx="24" cy="17" rx="6.5" ry="11" />
        </g>
        <g transform="rotate(32 44 24)">
          <ellipse className="sc-wing sc-wing--r" cx="44" cy="17" rx="6.5" ry="11" />
        </g>
      </g>

      <g className="sc-ant" style={{ transform: `rotate(${left}deg)`, transformOrigin: "29px 23px" }}>
        <path d="M29 23 Q26 15 23.5 9.5" />
        <circle cx="23.5" cy="9" r="2.4" />
      </g>
      <g className="sc-ant" style={{ transform: `rotate(${right}deg)`, transformOrigin: "39px 23px" }}>
        <path d="M39 23 Q42 15 44.5 9.5" />
        <circle cx="44.5" cy="9" r="2.4" />
      </g>

      <ellipse className="sc-body" cx="34" cy="38" rx="16" ry="17" />
      <ellipse className="sc-belly" cx="34" cy="44" rx="10" ry="8.5" />
      <path className="sc-strap" d="M44.5 27 Q49.5 38 45 49" />
      <rect className="sc-buckle" x="46.2" y="36.5" width="3.2" height="2.6" rx="0.6" />

      <Eyes mood={mood} />
      <ellipse className="sc-cheek" cx="24.3" cy="41.5" rx="2.6" ry="1.6" />
      <ellipse className="sc-cheek" cx="43.7" cy="41.5" rx="2.6" ry="1.6" />
      {mood === "sleep" ? (
        <ellipse className="sc-mouth-o" cx="34" cy="43.4" rx="1.4" ry="1.1" />
      ) : (
        <path className={`sc-mouth${mood === "excited" ? " sc-mouth--open" : ""}`} d={MOUTHS[mood] || MOUTHS.neutral} />
      )}
      <Accessory id={accessory} />
    </svg>
  );
}
