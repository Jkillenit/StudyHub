import { memo, useEffect, useRef } from "react";
import { NovaStage, webglAvailable } from "./NovaStage.js";

const GLITCH_MS = 520;

/**
 * React shell around NovaStage. Lazy-loaded (three.js + the model are a separate chunk).
 * Calls `onFail` when WebGL or the model can't load so the layer can fall back to the
 * portrait sprite. `gesture` is `{ name, id, idle }`; each new id plays that gesture once
 * (idle ones give way when she starts talking). `attend` turns her to face the user; `held` means she is dangling from the cursor; `seat` ("playful" | "cold" | "cards") sits her on the platform edge; `lie` ("prop" | "back" | "belly" | "side") lays her down. `lean` ("left" | "right", the side the wall is on) holds her leaning on a panel side. `still` (reduced motion) turns off the leg swing and breathing; `energy` scales the leg swing pace.
 * `staticNoise` adds faint static (offline).
 * Idle life: `activity` ("draw" | "read" | "cards", or "pull" while syncing) shows her hologram props or points her arm at the
 * pen in `pen` (a ref of viewport px); `drowsy` droops her eyes; each new `glance` `{ x, y, ms }` turns her gaze.
 * `onHead` gets her head's box px ({ x, y }) as it moves, and null on unmount.
 */
export default memo(function Nova3D({
  size,
  facing = 1,
  gait = null,
  speed = 90,
  mood = "neutral",
  talkUntil = 0,
  rampant = false,
  glow = 1,
  asleep = false,
  attend = false,
  held = false,
  seat = null,
  lean = null,
  lie = null,
  still = false,
  energy = 1,
  glitch = false,
  tint,
  visible = true,
  gesture = null,
  activity = null,
  drowsy = false,
  staticNoise = false,
  pen = null,
  glance = null,
  onReady,
  onFail,
  onHead,
}) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const cbRef = useRef({ onReady, onFail, onHead });
  cbRef.current = { onReady, onFail, onHead };
  const penRef = useRef(pen);
  penRef.current = pen;

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
    stage.onHead = (p) => cbRef.current.onHead?.(p);
    stage.setPen(penRef.current);
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
    /* She moves by transform (no resize or scroll), so re-measure once per frame while the pointer moves. */
    let frame = 0;
    let px = 0;
    let py = 0;
    const onMove = (e) => {
      px = e.clientX;
      py = e.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = canvas.getBoundingClientRect();
        stage.lookAt(px - (rect.left + rect.width / 2), py - (rect.top + rect.height / 2));
      });
    };
    const onOut = (e) => {
      if (e.relatedTarget) return;
      cancelAnimationFrame(frame);
      frame = 0;
      stage.lookAway();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onOut);
    return () => {
      alive = false;
      canvas.removeEventListener("webglcontextlost", onLost);
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onOut);
      cbRef.current.onHead?.(null);
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    stageRef.current?.setSize(size);
  }, [size]);

  useEffect(() => {
    stageRef.current?.set({ facing, gait, speed, mood, talkUntil, rampant, glow, asleep, attend, held, seat, lean, lie, still, energy, visible, activity, drowsy, staticNoise });
  }, [facing, gait, speed, mood, talkUntil, rampant, glow, asleep, attend, held, seat, lean, lie, still, energy, visible, activity, drowsy, staticNoise]);

  useEffect(() => {
    stageRef.current?.setPen(pen);
  }, [pen]);

  useEffect(() => {
    if (glance) stageRef.current?.glanceAt(glance.x, glance.y, glance.ms);
  }, [glance]);

  useEffect(() => {
    if (glitch) stageRef.current?.set({ glitchUntil: performance.now() + GLITCH_MS });
  }, [glitch]);

  useEffect(() => {
    if (gesture?.name) void stageRef.current?.play(gesture.name, { idle: !!gesture.idle, at: gesture.at || null });
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
});
