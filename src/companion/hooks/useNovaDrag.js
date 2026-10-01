import { useCallback, useEffect, useRef, useState } from "react";
import { line } from "../character.js";
import { AUTONOMOUS } from "../machine.js";
import { clampPoint, platformBelow } from "../safeZones.js";
import { dropTargetAt, overHome, rectOf } from "../layer/geometry.js";
import { DROP_LINES, MENU_LINE_MS, PICKUP_LINE_CHANCE, SPAM_CLICKS, SPAM_LOCK_MS, SPAM_WINDOW_MS, SWING_MAX, SWING_PER_PX } from "../layer/constants.js";

/** Moves the `.nv-drop` landing marker by hand (null hides it), so a drag doesn't re-render the layer on every move. */
function placeDropMark(el, at) {
  if (!el) return;
  if (!at) {
    el.hidden = true;
    return;
  }
  el.style.left = `${at.x}px`;
  el.style.top = `${at.y}px`;
  el.hidden = false;
}

/** Clicking and dragging Nova: the click menu, the spam guard, the held swing, and drops onto the home window or a task. */
export function useNovaDrag(core, { houseAt, leaveHome, closeHelp }) {
  const {
    modeRef,
    navRef,
    api,
    send,
    setBubble,
    say,
    setMood,
    refreshAnchor,
    feelIt,
    playGesture,
    cancel,
    sizeRef,
    sfx,
    dragRef,
    jumpTo,
    posRef,
    platRef,
    lastActivityRef,
    use3dRef,
    baseSizeRef,
    housedRef,
    nodeRef,
    reduced,
  } = core;
  const [dragging, setDragging] = useState(false);
  const dropMarkRef = useRef(null);
  /** What a drop would start (a Today task, exam or gauge), ringed while she's held over it. */
  const [dropTarget, setDropTarget] = useState(null);
  const [menuLine, setMenuLine] = useState(null);
  const clicksRef = useRef([]);
  const spamUntilRef = useRef(0);
  const suppressClickRef = useRef(false);

  const onScoutClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const m = modeRef.current;
    if (m === "tour" || m === "greet" || m === "quiz") return;
    if (m === "help") {
      closeHelp();
      return;
    }
    const now = Date.now();
    if (now < spamUntilRef.current) return;
    clicksRef.current = [...clicksRef.current.filter((t) => now - t < SPAM_WINDOW_MS), now];
    cancel();
    lastActivityRef.current = now;
    if (clicksRef.current.length >= SPAM_CLICKS) {
      clicksRef.current = [];
      spamUntilRef.current = now + SPAM_LOCK_MS;
      if (m === "menu") send("CLOSE");
      setMood("stern");
      if (use3dRef.current) playGesture("facepalm");
      refreshAnchor();
      feelIt("clickSpam");
      say(line("clickSpam"));
      return;
    }
    setBubble(null);
    const next = send("CLICK");
    sfx("open");
    setMood(m === "sleep" ? "confused" : "happy");
    if (next === "menu") {
      if (use3dRef.current && m !== "sleep") playGesture(Math.random() < 0.5 ? "wave" : "wink");
      setMenuLine(m === "sleep" ? null : line("clickHi"));
    }
    refreshAnchor();
  }, [cancel, send, closeHelp, refreshAnchor, sfx, say, playGesture, feelIt]);

  useEffect(() => {
    if (!menuLine) return undefined;
    const t = window.setTimeout(() => setMenuLine(null), MENU_LINE_MS);
    return () => window.clearTimeout(t);
  }, [menuLine]);

  /*
   * Held in 3D: she dangles from the grab point and swings on a damped spring driven by
   * the cursor's horizontal speed, then settles back upright after release.
   */
  const swingRef = useRef({ a: 0, v: 0, vx: 0, lastT: 0, raf: 0, held: false });
  const swingStep = useCallback(() => {
    const sw = swingRef.current;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sw.vx *= Math.exp(-dt * 6);
      const target = sw.held ? Math.max(-SWING_MAX, Math.min(SWING_MAX, sw.vx * SWING_PER_PX)) : 0;
      sw.v += (-(sw.a - target) * 70 - sw.v * 4.5) * dt;
      sw.a += sw.v * dt;
      const el = nodeRef.current?.querySelector(".sc-bob");
      if (!sw.held && Math.abs(sw.a) < 0.003 && Math.abs(sw.v) < 0.02) {
        sw.raf = 0;
        sw.a = 0;
        sw.v = 0;
        if (el) {
          el.style.transform = "";
          el.style.transformOrigin = "";
        }
        return;
      }
      if (el) el.style.transform = `rotate(${sw.a.toFixed(4)}rad)`;
      sw.raf = requestAnimationFrame(step);
    };
    sw.raf = requestAnimationFrame(step);
  }, []);
  const startSwing = useCallback(
    (ox, oy) => {
      const sw = swingRef.current;
      sw.held = true;
      sw.vx = 0;
      sw.lastT = 0;
      const el = nodeRef.current?.querySelector(".sc-bob");
      if (el) el.style.transformOrigin = `${Math.round(ox)}px ${Math.round(oy)}px`;
      if (!reduced && !sw.raf) swingStep();
    },
    [reduced, swingStep]
  );
  const releaseSwing = useCallback(() => {
    swingRef.current.held = false;
  }, []);
  useEffect(() => () => cancelAnimationFrame(swingRef.current.raf), []);

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      dragRef.current = {
        sx: e.clientX,
        sy: e.clientY,
        ox: e.clientX - posRef.current.x,
        oy: e.clientY - posRef.current.y,
        moved: false,
      };
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* capture is a nicety; dragging still works without it */
      }
    },
    [posRef]
  );

  const onPointerMove = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
        d.moved = true;
        cancel();
        setDragging(true);
        if (housedRef.current) {
          const k = baseSizeRef.current / sizeRef.current;
          d.ox *= k;
          d.oy *= k;
          leaveHome();
        }
        setBubble(null);
        if (use3dRef.current) {
          d.held = true;
          setMood("stern");
          platRef.current = null;
          startSwing(d.ox, d.oy);
        }
        if (Math.random() < PICKUP_LINE_CHANCE) {
          refreshAnchor();
          say(line("pickedUp"));
        }
      }
      const s = sizeRef.current;
      const p = clampPoint({ x: e.clientX - d.ox, y: e.clientY - d.oy }, s);
      const g = navRef.current.stageActive ? overHome(p, s, baseSizeRef.current) : null;
      const hit = g ? null : dropTargetAt(e.clientX, e.clientY);
      if (hit !== d.target) {
        d.target = hit;
        setDropTarget(hit ? rectOf(hit.getBoundingClientRect()) : null);
      }
      if (hit) {
        placeDropMark(dropMarkRef.current, null);
        jumpTo(p);
        return;
      }
      if (d.held) {
        const sw = swingRef.current;
        const now = performance.now();
        const dt = Math.max(1, now - (sw.lastT || now - 16));
        sw.vx = sw.vx * 0.6 + ((p.x - posRef.current.x) / dt) * 1000 * 0.4;
        sw.lastT = now;
      }
      if (g) placeDropMark(dropMarkRef.current, { x: g.cx, y: g.floorTop });
      else if (d.held) placeDropMark(dropMarkRef.current, { x: p.x + s / 2, y: platformBelow(p, s).top });
      else placeDropMark(dropMarkRef.current, null);
      jumpTo(p);
    },
    [cancel, jumpTo, posRef, startSwing, leaveHome, refreshAnchor, say]
  );

  const onPointerUp = useCallback(
    () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d?.moved) return;
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      setDragging(false);
      placeDropMark(dropMarkRef.current, null);
      setDropTarget(null);
      releaseSwing();
      const m = modeRef.current;
      const homeable = AUTONOMOUS.has(m) || m === "sleep" || m === "menu";
      if (homeable && m !== "menu") send("DROP");
      if (homeable && navRef.current.stageActive && overHome(posRef.current, sizeRef.current, baseSizeRef.current) && houseAt()) {
        refreshAnchor();
        return;
      }
      if (!homeable) {
        refreshAnchor();
        return;
      }
      /* Dropped on a task, exam or gauge: start it with the item's own button. */
      const kind = d.target?.isConnected ? d.target.dataset.novaDrop : null;
      if (kind) {
        const btn = d.target.matches("button") ? d.target : d.target.querySelector("button");
        btn?.click();
        setMood("happy");
        refreshAnchor();
        say(line(DROP_LINES[kind] || "dropTask"));
      }
      if (d.held) void api.current.fall({ dropped: true, quip: !kind });
      else api.current.returnAfterDrop();
    },
    [send, refreshAnchor, posRef, releaseSwing, houseAt, say]
  );

  return { dragging, dropMarkRef, dropTarget, menuLine, onScoutClick, onPointerDown, onPointerMove, onPointerUp };
}
