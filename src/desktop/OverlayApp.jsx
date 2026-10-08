/**
 * Desktop Nova overlay: one per display, full screen, transparent and click-through except for
 * her body and her speech bubble. Main owns all state; this page only draws it and reports
 * pointer input. Sprite frames come from the persona pack (public/personas/<id>/sprites).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-mono/500.css";
import shCss from "../studyhub-bootstrap.css?inline";
import { isReducedMotion } from "../shell/motion.js";

// Inlined: a plain shared import splits it into a chunk that loads before Bootstrap in the main window.
document.head.appendChild(Object.assign(document.createElement("style"), { textContent: shCss }));

const api = window.novaDesktop;
const GRAVITY = 2600;
const DRAG_PX = 5;
/** Hit box used when the sheet can't be sampled: her body is a narrow column in the frame. */
const BODY_W = 0.26;
/** She's thin and semi-transparent; count the cursor as on her within this many CSS px of an opaque pixel. */
const HIT_SLOP = 6;
const HIT_ALPHA = 24;

/** Mirrors electron/desktop/novaState.cjs posAt. */
function posAt(m, now) {
  const t = Math.max(0, (now - m.t0) / 1000);
  if (m.kind === "walk") {
    const d = m.x1 - m.x0;
    return { x: m.x0 + Math.sign(d) * Math.min(Math.abs(d), m.speed * t), y: m.y0 };
  }
  if (m.kind === "fall") return { x: m.x0, y: Math.min(m.y1, m.y0 + 0.5 * GRAVITY * t * t) };
  return { x: m.x0, y: m.y0 };
}

const metaCache = new Map();
function loadMeta(packId) {
  if (!metaCache.has(packId)) {
    metaCache.set(
      packId,
      fetch(`./personas/${packId}/sprites/frames.json`)
        .then((r) => r.json())
        .catch(() => null)
    );
  }
  return metaCache.get(packId);
}

function OverlayApp() {
  const [state, setState] = useState(null);
  const [meta, setMeta] = useState(null);
  const spriteRef = useRef(null);
  const bubbleRef = useRef(null);
  const propRef = useRef(null);
  const view = useRef({ state: null, meta: null, img: null, clip: null, box: null, hit: false });
  const sampler = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    const off = api.onState((s) => setState(s));
    api.ready();
    const sendPrefs = () => api.prefs({ reducedMotion: isReducedMotion() });
    sendPrefs();
    window.addEventListener("storage", sendPrefs);
    return () => {
      off();
      window.removeEventListener("storage", sendPrefs);
    };
  }, []);

  useEffect(() => {
    if (!state?.packId) return;
    let alive = true;
    loadMeta(state.packId).then((m) => alive && setMeta(m));
    return () => {
      alive = false;
    };
  }, [state?.packId]);

  /* Frame loop: runs only while she's on this display, at the fps main asks for (lower on battery). */
  useLayoutEffect(() => {
    view.current.state = state;
    view.current.meta = meta;
    if (!state?.visible || !meta) {
      view.current.box = null;
      return undefined;
    }
    let timer = 0;
    const frame = () => {
      draw();
      timer = setTimeout(frame, 1000 / Math.max(1, state.fps || 15));
    };
    frame();
    return () => clearTimeout(timer);
  }, [state, meta]);

  function draw() {
    const { state: s, meta: m } = view.current;
    const el = spriteRef.current;
    const clip = m?.clips[s?.clip] || m?.clips.idle;
    if (!el || !clip) return;
    const F = s.frameSize;
    const now = Date.now();
    const p = posAt(s.motion, now);
    const lx = p.x - s.origin.x;
    const ly = p.y - s.origin.y;
    const raw = Math.floor(((now - s.clipT0) / 1000) * m.fps);
    const idx = clip.loop ? ((raw % clip.frames) + clip.frames) % clip.frames : Math.min(Math.max(raw, 0), clip.frames - 1);
    const col = idx % clip.cols;
    const row = Math.floor(idx / clip.cols);
    const rows = Math.ceil(clip.frames / clip.cols);
    const left = lx - F / 2;
    const top = ly - F * clip.anchorY;

    if (view.current.clip !== s.clip) {
      view.current.clip = s.clip;
      const url = `./personas/${s.packId}/sprites/${clip.file}`;
      el.style.backgroundImage = `url("${url}")`;
      const img = new Image();
      img.src = url;
      view.current.img = img;
    }
    el.style.width = `${F}px`;
    el.style.height = `${F}px`;
    el.style.backgroundSize = `${clip.cols * F}px ${rows * F}px`;
    el.style.backgroundPosition = `${-col * F}px ${-row * F}px`;
    el.style.transform = `translate(${left}px, ${top}px) scaleX(${s.facing < 0 ? -1 : 1})`;
    view.current.box = { left, top, F, col, row, facing: s.facing, frameW: m.frameW };

    /* Props sit at her hands: an envelope held to one side, a sign across her chest. */
    const pr = propRef.current;
    if (pr) {
      const sign = s.bubble?.prop?.kind === "sign";
      pr.style.width = `${Math.round(F * (sign ? 0.8 : 0.2))}px`;
      if (!sign) pr.style.height = `${Math.round(F * 0.14)}px`;
      const px = lx - pr.offsetWidth / 2 + (sign ? 0 : s.facing * F * 0.1);
      const py = top + F * (sign ? 0.5 : 0.52) - pr.offsetHeight / 2;
      pr.style.transform = `translate(${px}px, ${py}px)`;
    }

    const b = bubbleRef.current;
    if (b) {
      const w = b.offsetWidth;
      const bx = Math.min(window.innerWidth - w - 8, Math.max(8, lx - w / 2));
      const by = Math.max(8, top + F * 0.06 - b.offsetHeight);
      b.style.transform = `translate(${bx}px, ${by}px)`;
    }
  }

  /** True when (x, y) is on an opaque pixel of her current frame (or inside her body column). */
  function overSprite(x, y) {
    const box = view.current.box;
    if (!box) return false;
    const u = (x - box.left) / box.F;
    const v = (y - box.top) / box.F;
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    const img = view.current.img;
    if (img?.complete && img.naturalWidth) {
      try {
        const scale = box.frameW / box.F;
        const n = Math.max(1, Math.round(HIT_SLOP * 2 * scale));
        if (!sampler.current || sampler.current.canvas.width !== n) {
          const c = document.createElement("canvas");
          c.width = n;
          c.height = n;
          sampler.current = c.getContext("2d", { willReadFrequently: true });
        }
        const ctx = sampler.current;
        const su = box.facing < 0 ? 1 - u : u;
        ctx.clearRect(0, 0, n, n);
        ctx.drawImage(img, (box.col + su) * box.frameW - n / 2, (box.row + v) * box.frameW - n / 2, n, n, 0, 0, n, n);
        const data = ctx.getImageData(0, 0, n, n).data;
        for (let i = 3; i < data.length; i += 4) if (data[i] > HIT_ALPHA) return true;
        return false;
      } catch {
        /* tainted canvas: fall back to the body column */
      }
    }
    return Math.abs(u - 0.5) < BODY_W / 2;
  }

  useEffect(() => {
    const onMove = (e) => {
      if (drag.current) return;
      const inBubble = !!bubbleRef.current?.contains(document.elementFromPoint(e.clientX, e.clientY));
      const over = inBubble || overSprite(e.clientX, e.clientY);
      if (over !== view.current.hit) {
        view.current.hit = over;
        api.hit(over);
      }
    };
    const onLeave = () => {
      if (drag.current || !view.current.hit) return;
      view.current.hit = false;
      api.hit(false);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.screenX, y: e.screenY, moved: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = { x: e.screenX, y: e.screenY };
    if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) > DRAG_PX) {
      d.moved = true;
      api.dragStart(p);
    }
    if (d.moved) api.dragMove(p);
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) api.dragEnd({ x: e.screenX, y: e.screenY });
    else api.click({});
    view.current.hit = false;
  };
  const onContextMenu = (e) => {
    e.preventDefault();
    api.menu();
  };

  const bubble = state?.visible ? state.bubble : null;
  return (
    <>
      <div
        ref={spriteRef}
        className="dn-sprite"
        hidden={!state?.visible || !meta}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
        aria-label="Nova"
      />
      {bubble?.prop && meta ? (
        <div ref={propRef} className={`dn-prop dn-prop--${bubble.prop.kind === "sign" ? "sign" : "envelope"}`} aria-hidden="true">
          {bubble.prop.kind === "sign" ? bubble.prop.text : null}
        </div>
      ) : null}
      {bubble ? (
        <div ref={bubbleRef} className="dn-bubble" role="status" key={bubble.id}>
          <p className="dn-bubble-text">{bubble.text}</p>
          {bubble.buttons?.length ? (
            <div className="dn-bubble-actions">
              {bubble.buttons.map((b) => (
                <button key={b.id} type="button" className="dn-bubble-btn mono" onClick={() => api.click({ button: b.id })}>
                  {b.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

createRoot(document.getElementById("root")).render(<OverlayApp />);
