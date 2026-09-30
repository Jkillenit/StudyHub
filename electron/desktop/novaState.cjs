/**
 * Desktop Nova's single source of truth: where she is, what she's doing, and why she's hidden.
 * Motion is sent as segments (walk from x0 to x1 at speed, fall from y0 to y1) that the overlay
 * interpolates, so the main process only wakes up when a decision is due.
 *
 * D1 terrain: the top edge of each display's taskbar (bottom of the work area).
 */
const { screen, powerMonitor } = require("electron");

const GRAVITY = 2600;
const DRAG_HANG = 0.9;
const DOZE_AFTER_S = 120;
const WAKE_UNDER_S = 5;
const APP_WALK_MAX_MS = 2500;
const DELAYS = { calm: [30, 60], normal: [15, 35], lively: [8, 20] };
const GESTURES = ["yawn", "look", "stretch", "wave"];

/** Position of a motion segment at `now` (epoch ms). Mirrored in src/desktop/OverlayApp.jsx. */
function posAt(m, now) {
  const t = Math.max(0, (now - m.t0) / 1000);
  if (m.kind === "walk") {
    const d = m.x1 - m.x0;
    return { x: m.x0 + Math.sign(d) * Math.min(Math.abs(d), m.speed * t), y: m.y0 };
  }
  if (m.kind === "fall") return { x: m.x0, y: Math.min(m.y1, m.y0 + 0.5 * GRAVITY * t * t) };
  return { x: m.x0, y: m.y0 };
}

function fallMs(y0, y1) {
  return Math.sqrt((2 * Math.max(0, y1 - y0)) / GRAVITY) * 1000;
}

/**
 * @param deps.overlays createOverlays() result
 * @param deps.frames sprites/frames.json
 * @param deps.pack persona pack.json
 * @param deps.settings () => desktop settings
 * @param deps.companion () => { quiet, movement }
 * @param deps.onHiddenChange ({ hidden, reasons }) => void
 * @param deps.onVisible () => void   called each time she comes back into view
 */
function createNova({ overlays, frames, pack, packId, settings, companion, onHiddenChange, onVisible }) {
  const hideReasons = new Set();
  let displayId = screen.getPrimaryDisplay().id;
  let motion = { kind: "stand", x0: 0, y0: 0, t0: Date.now() };
  let pose = "stand";
  let clip = pack.states.stand;
  let clipT0 = Date.now();
  let facing = 1;
  let bubble = null;
  let fps = 15;
  let reducedMotion = false;
  let dragging = false;
  let dozing = false;
  let timer = null;
  let bubbleTimer = null;
  let onBubbleEnd = null;

  const clipName = (state) => pack.states[state] || pack.states.stand;
  const clipMs = (name) => ((frames.clips[name]?.frames || 15) / frames.fps) * 1000;
  const bodyHeight = () => pack.heights[settings().size] || pack.heights.md;
  const frameSize = () => Math.round(bodyHeight() * (frames.frameScale || 1.14));
  const display = () => screen.getAllDisplays().find((d) => d.id === displayId) || screen.getPrimaryDisplay();
  const ground = (d = display()) => d.workArea.y + d.workArea.height;
  const clampX = (x, d = display()) => {
    const m = frameSize() * 0.3;
    return Math.min(d.workArea.x + d.workArea.width - m, Math.max(d.workArea.x + m, x));
  };
  const hidden = () => hideReasons.size > 0;
  const pos = () => posAt(motion, Date.now());

  function stateFor(id) {
    const d = screen.getAllDisplays().find((x) => x.id === id);
    const base = { visible: false, packId };
    if (!d || id !== displayId || hidden()) return base;
    return {
      visible: true,
      packId,
      origin: { x: d.bounds.x, y: d.bounds.y },
      frameSize: frameSize(),
      fps,
      clip,
      clipT0,
      facing,
      motion,
      bubble: bubble && { ...bubble, data: undefined },
    };
  }

  function broadcast() {
    for (const id of overlays.displayIds()) overlays.send(id, stateFor(id));
  }

  function schedule(ms, fn) {
    clearTimeout(timer);
    timer = hidden() ? null : setTimeout(fn, ms);
  }

  function setClip(name) {
    if (name === clip) return;
    clip = name;
    clipT0 = Date.now();
  }

  /** Resting clip for the current pose; talking while standing uses the talk clip. */
  function restClip() {
    return clipName(bubble && pose === "stand" && motion.kind === "stand" ? "talk" : pose);
  }

  function stand(state = "stand", at = pos()) {
    pose = state;
    motion = { kind: "stand", x0: at.x, y0: at.y, t0: Date.now() };
    setClip(restClip());
    broadcast();
  }

  function playOnce(state, then) {
    if (reducedMotion && state !== "land") return then();
    setClip(clipName(state));
    clipT0 = Date.now();
    broadcast();
    schedule(clipMs(clipName(state)), then);
  }

  function walkTo(x, then) {
    const from = pos();
    const target = clampX(x);
    if (reducedMotion || Math.abs(target - from.x) < 4) {
      stand("stand", { x: target, y: ground() });
      return then();
    }
    const speed = (frames.walkSpeed || 90) * (frameSize() / (frames.frameH || 240));
    facing = target > from.x ? 1 : -1;
    pose = "stand";
    motion = { kind: "walk", x0: from.x, y0: ground(), x1: target, speed, t0: Date.now() };
    setClip(clipName("walk"));
    broadcast();
    schedule((Math.abs(target - from.x) / speed) * 1000, () => {
      stand("stand", { x: target, y: ground() });
      then();
    });
  }

  function fallTo(x, y0, then) {
    const d = display();
    const tx = clampX(x, d);
    const y1 = ground(d);
    if (y1 - y0 < 6) {
      stand("stand", { x: tx, y: y1 });
      return then();
    }
    motion = { kind: "fall", x0: tx, y0, y1, t0: Date.now() };
    setClip(clipName("fall"));
    broadcast();
    schedule(fallMs(y0, y1), () => {
      stand("stand", { x: tx, y: y1 });
      playOnce("land", () => {
        stand();
        then();
      });
    });
  }

  function delay() {
    const [a, b] = DELAYS[companion().movement] || DELAYS.normal;
    return (a + Math.random() * (b - a)) * 1000;
  }

  /** Idle brain: one decision, then sleep until the next. */
  function next() {
    if (hidden() || dragging) return;
    const idle = powerMonitor.getSystemIdleTime();
    if (dozing) {
      if (idle < WAKE_UNDER_S) {
        dozing = false;
        stand();
        return playOnce("yawn", () => {
          stand();
          schedule(delay(), next);
        });
      }
      return schedule(5000, next);
    }
    if (idle > DOZE_AFTER_S) {
      dozing = true;
      stand("doze");
      return schedule(5000, next);
    }
    const { quiet } = companion();
    const r = Math.random();
    if (quiet) {
      stand(r < 0.5 ? "sit" : "stand");
      return schedule(delay() * 2, next);
    }
    const d = display();
    const others = screen.getAllDisplays().filter((x) => x.id !== displayId);
    if (r < 0.45) {
      const span = d.workArea.width;
      const x = d.workArea.x + span * (0.1 + Math.random() * 0.8);
      return walkTo(x, () => schedule(delay(), next));
    }
    if (r < 0.65) {
      stand(Math.random() < 0.6 ? "sitHappy" : "sit");
      return schedule(delay(), next);
    }
    if (r < 0.82) {
      return playOnce(GESTURES[Math.floor(Math.random() * GESTURES.length)], () => {
        stand();
        schedule(delay(), next);
      });
    }
    if (r < 0.87 && others.length && !reducedMotion) {
      const to = others[Math.floor(Math.random() * others.length)];
      displayId = to.id;
      return fallTo(to.workArea.x + to.workArea.width * (0.2 + Math.random() * 0.6), to.bounds.y + to.bounds.height * 0.4, () =>
        schedule(delay(), next)
      );
    }
    stand();
    return schedule(delay(), next);
  }

  function endBubble(runCallback) {
    clearTimeout(bubbleTimer);
    const posed = !!bubble?.pose;
    bubble = null;
    const cb = onBubbleEnd;
    onBubbleEnd = null;
    const at = pos();
    if (!dragging && !hidden() && at.y < ground() - 6) fallTo(at.x, at.y, () => schedule(delay(), next));
    else if (!dragging && !hidden() && posed) {
      stand();
      schedule(delay(), next);
    } else {
      setClip(restClip());
      broadcast();
    }
    if (runCallback) cb?.();
  }

  function setHidden(reason, on) {
    const was = hidden();
    if (on) hideReasons.add(reason);
    else hideReasons.delete(reason);
    const now = hidden();
    if (was === now) return;
    if (now) {
      clearTimeout(timer);
      timer = null;
      clearTimeout(bubbleTimer);
      bubble = null;
      broadcast();
      overlays.hide();
    } else {
      overlays.show();
      stand("stand", { x: pos().x, y: ground() });
      onVisible?.();
      schedule(delay(), next);
    }
    onHiddenChange?.({ hidden: now, reasons: [...hideReasons] });
  }

  return {
    posAt,
    broadcast,
    hidden,
    reasons: () => [...hideReasons],
    setHidden,
    stateFor,

    /** Entrance: she drops in from the top of the primary display. */
    arrive(then = () => {}) {
      const d = screen.getPrimaryDisplay();
      displayId = d.id;
      const x = d.workArea.x + d.workArea.width * 0.75;
      motion = { kind: "stand", x0: x, y0: d.bounds.y, t0: Date.now() };
      if (hidden()) {
        stand("stand", { x: clampX(x, d), y: ground(d) });
        return then();
      }
      fallTo(x, d.bounds.y + 20, () => {
        then();
        schedule(delay(), next);
      });
    },

    /** Re-seat her after displays change (unplugged monitor, taskbar moved, DPI change). */
    reflow() {
      const d = display();
      displayId = d.id;
      stand(pose, { x: clampX(pos().x, d), y: ground(d) });
    },

    setFps(v) {
      fps = v;
      broadcast();
    },
    setReducedMotion(v) {
      reducedMotion = !!v;
    },
    stop() {
      clearTimeout(timer);
      clearTimeout(bubbleTimer);
      timer = null;
    },

    /** b.pose holds a pose for the bubble's lifetime; b.at {x, y} puts her feet there (she falls to the taskbar after). */
    showBubble(b, ms, onEnd) {
      clearTimeout(bubbleTimer);
      bubble = b;
      onBubbleEnd = onEnd || null;
      if (!dragging && b.at && !reducedMotion) {
        const d = screen.getDisplayNearestPoint({ x: Math.round(b.at.x), y: Math.round(b.at.y) });
        displayId = d.id;
        motion = { kind: "stand", x0: clampX(b.at.x, d), y0: Math.min(b.at.y, ground(d)), t0: Date.now() };
      }
      if (!dragging && b.pose) {
        clearTimeout(timer);
        const p = pos();
        motion = { kind: "stand", x0: p.x, y0: p.y, t0: Date.now() };
        pose = b.pose;
      }
      setClip(restClip());
      broadcast();
      bubbleTimer = setTimeout(() => endBubble(true), ms);
    },
    clearBubble() {
      endBubble(false);
    },
    bubble: () => bubble,

    wave() {
      playOnce("wave", () => {
        stand();
        schedule(delay(), next);
      });
    },

    drag(phase, x, y) {
      if (phase === "start") {
        dragging = true;
        dozing = false;
        clearTimeout(timer);
        pose = "stand";
      }
      if (!dragging) return;
      const d = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
      displayId = d.id;
      const hang = { x, y: y + bodyHeight() * DRAG_HANG };
      if (phase === "end") {
        dragging = false;
        fallTo(hang.x, Math.min(hang.y, ground(d)), () => schedule(delay(), next));
        return;
      }
      motion = { kind: "stand", x0: hang.x, y0: hang.y, t0: Date.now() };
      setClip(clipName("held"));
      broadcast();
    },

    /** The app window got focus: walk toward it, then hand over to the in-app Nova. */
    enterApp(bounds) {
      if (hidden()) return setHidden("app", true);
      const target = screen.getDisplayMatching(bounds);
      if (target.id !== displayId || reducedMotion || dragging) return setHidden("app", true);
      const here = pos().x;
      const edge = here < bounds.x ? bounds.x : here > bounds.x + bounds.width ? bounds.x + bounds.width : here;
      const speed = (frames.walkSpeed || 90) * (frameSize() / (frames.frameH || 240));
      const reachable = here + Math.sign(edge - here) * Math.min(Math.abs(edge - here), (speed * APP_WALK_MAX_MS) / 1000);
      walkTo(reachable, () => setHidden("app", true));
    },

    /** The app window was minimized or hidden: she steps back out where it was. */
    leaveApp(bounds) {
      if (!hideReasons.has("app")) return;
      const d = bounds ? screen.getDisplayMatching(bounds) : display();
      displayId = d.id;
      const x = bounds ? bounds.x + bounds.width / 2 : pos().x;
      pose = "stand";
      motion = { kind: "stand", x0: clampX(x, d), y0: ground(d), t0: Date.now() };
      setHidden("app", false);
    },
  };
}

module.exports = { createNova, posAt, fallMs, GRAVITY };
