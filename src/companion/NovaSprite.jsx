import { useEffect, useState } from "react";
import { keyedFramesSync, loadKeyedFrames } from "./novaFrames.js";

const MOOD_FRAME = {
  neutral: "idle",
  happy: "smile",
  excited: "wink",
  sad: "stern",
  stern: "stern",
  confused: "thinking",
  thinking: "thinking",
  point: "point",
  sleep: "sleep",
};

/**
 * Nova, a projected hologram. Same props contract as the old sprite (mood, glow 0-5, facing,
 * flying) plus `rampant`, `glitch` (a one-shot reaction) and a projection `tint`.
 */
export function NovaSprite({ mood = "neutral", glow = 1, facing = 1, flying = false, glitch = false, rampant = false, tint, size = 104 }) {
  const [frames, setFrames] = useState(keyedFramesSync);

  useEffect(() => {
    if (frames) return undefined;
    let alive = true;
    loadKeyedFrames().then((f) => {
      if (alive) setFrames(f);
    });
    return () => {
      alive = false;
    };
  }, [frames]);

  const frame = rampant ? "rampant" : MOOD_FRAME[mood] || "idle";
  const src = frames?.[frame];
  const g = Math.max(0, Math.min(5, glow));
  const mask = src ? { WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` } : null;

  return (
    <span
      className={[
        "nv-sprite",
        `nv-frame--${frame}`,
        flying ? "nv-moving" : "",
        glitch ? "nv-glitch" : "",
        rampant ? "nv-rampant" : "",
        tint?.id === "prism" && !rampant ? "nv-prism" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: size,
        height: size,
        "--nv-glow": (0.25 + g * 0.15).toFixed(2),
        "--nv-tint": rampant ? "hue-rotate(0deg)" : tint?.filter || "hue-rotate(0deg)",
      }}
      aria-hidden
    >
      <span className="nv-beam" />
      <span className="nv-base" />
      <span className="nv-frame" style={{ transform: `scaleX(${facing < 0 ? -1 : 1})` }}>
        {src ? (
          <>
            <img key={frame} className="nv-img" src={src} alt="" draggable={false} />
            <img className="nv-img nv-ghost nv-ghost--a" src={src} alt="" draggable={false} />
            <img className="nv-img nv-ghost nv-ghost--b" src={src} alt="" draggable={false} />
            <span className="nv-scan" style={mask} />
            <span className="nv-sweep" style={mask} />
          </>
        ) : null}
      </span>
    </span>
  );
}
