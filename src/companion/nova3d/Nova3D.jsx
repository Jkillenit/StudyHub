import { useEffect, useRef } from "react";
import { NovaStage, webglAvailable } from "./NovaStage.js";

const GLITCH_MS = 520;

/**
 * React shell around NovaStage. Lazy-loaded (three.js + the model are a separate chunk).
 * Calls `onFail` when WebGL or the model can't load so the layer can fall back to the
 * portrait sprite. `gesture` is `{ name, id }`; each new id plays that clip once.
 */
export default function Nova3D({
  size,
  facing = 1,
  gait = null,
  speed = 90,
  mood = "neutral",
  talkUntil = 0,
  rampant = false,
  glow = 1,
  asleep = false,
  glitch = false,
  tint,
  visible = true,
  gesture = null,
  onReady,
  onFail,
}) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const cbRef = useRef({ onReady, onFail });
  cbRef.current = { onReady, onFail };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !webglAvailable()) {
      cbRef.current.onFail?.();
      return undefined;
    }
    let stage;
    try {
      stage = new NovaStage(canvas);
    } catch {
      cbRef.current.onFail?.();
      return undefined;
    }
    stageRef.current = stage;
    let alive = true;
    stage
      .load()
      .then(() => {
        if (alive) cbRef.current.onReady?.();
      })
      .catch(() => {
        if (alive) cbRef.current.onFail?.();
      });
    const onLost = (e) => {
      e.preventDefault();
      cbRef.current.onFail?.();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      stage.lookAt(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      alive = false;
      canvas.removeEventListener("webglcontextlost", onLost);
      window.removeEventListener("pointermove", onMove);
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    stageRef.current?.setSize(size);
  }, [size]);

  useEffect(() => {
    stageRef.current?.set({ facing, gait, speed, mood, talkUntil, rampant, glow, asleep, visible });
  }, [facing, gait, speed, mood, talkUntil, rampant, glow, asleep, visible]);

  useEffect(() => {
    if (glitch) stageRef.current?.set({ glitchUntil: performance.now() + GLITCH_MS });
  }, [glitch]);

  useEffect(() => {
    if (gesture?.name) void stageRef.current?.play(gesture.name);
  }, [gesture]);

  const g = Math.max(0, Math.min(5, glow));
  return (
    <span
      className={["nv-3d", rampant ? "nv-rampant" : "", tint?.id === "prism" && !rampant ? "nv-prism" : "", asleep ? "nv-3d--asleep" : ""]
        .filter(Boolean)
        .join(" ")}
      style={{
        "--nv-glow": (0.25 + g * 0.15).toFixed(2),
        "--nv-tint": rampant ? "hue-rotate(0deg)" : tint?.filter || "hue-rotate(0deg)",
      }}
      aria-hidden
    >
      <canvas ref={canvasRef} className="nv-3d-canvas" />
    </span>
  );
}
