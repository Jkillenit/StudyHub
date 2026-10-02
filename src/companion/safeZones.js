/** Things Nova must never sit on top of. */
const AVOID_SELECTOR = [
  "[data-sprite-avoid]",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  ".ProseMirror",
  ".drill-card",
  "video",
  "iframe",
  ".sh-novabar",
  ".sh-rail",
].join(",");

/** Everything she must not cover when she moves on her own: panels, text and anything clickable. */
const CONTENT_SELECTOR = [
  AVOID_SELECTOR,
  ".sh-plan-col",
  ".sh-home-col",
  ".sh-panel",
  ".sh-hub-block",
  "button",
  "a[href]",
  "[role='button']",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "li",
  "label",
  "img",
  "table",
].join(",");
/** Text and controls inside a panel, for checking where her legs would hang when she sits on its edge. */
const TEXT_SELECTOR = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "li",
  "label",
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "[class*='title']",
  "[class*='label']",
  "[class*='chip']",
].join(",");
/** Her own UI and her home window never count as content. */
const NOT_CONTENT = ".sc-layer, [data-nova-home], .sh-nova-lane";
/** Share of the frame her legs hang below the edge when seated (matches NovaStage SEAT_FRAC). */
const SEAT_LEG_FRAC = 0.3;

const TITLEBAR_H = 40;
const EDGE = 12;
const MARGIN_BAND = 96;

function visibleRect(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) return null;
  return r;
}

function overlaps(a, b, pad = 6) {
  return a.x < b.right + pad && a.x + a.w > b.left - pad && a.y < b.bottom + pad && a.y + a.h > b.top - pad;
}

export function viewportBounds(size) {
  const railRight = document.querySelector(".sh-rail")?.getBoundingClientRect().right ?? 0;
  return {
    minX: railRight + EDGE,
    minY: TITLEBAR_H + 4,
    maxX: Math.max(EDGE, window.innerWidth - size - EDGE),
    maxY: Math.max(TITLEBAR_H + 4, window.innerHeight - size - EDGE),
  };
}

export function clampPoint(p, size) {
  const b = viewportBounds(size);
  return { x: Math.min(b.maxX, Math.max(b.minX, p.x)), y: Math.min(b.maxY, Math.max(b.minY, p.y)) };
}

export function defaultHome(size) {
  return clampPoint({ x: window.innerWidth - size - 28, y: window.innerHeight - size - 44 }, size);
}

function avoidRects() {
  return [...document.querySelectorAll(AVOID_SELECTOR)].map(visibleRect).filter(Boolean);
}

/**
 * Content rects she must keep clear of. Anything starting at or below `feetLine` is skipped:
 * a standing body is entirely above its feet, so the panel she stands on can't be covered.
 */
function contentRects(feetLine = Infinity) {
  const out = [];
  for (const el of document.querySelectorAll(CONTENT_SELECTOR)) {
    if (el.closest(NOT_CONTENT)) continue;
    const r = visibleRect(el);
    if (!r || r.top >= feetLine - 2) continue;
    out.push(r);
  }
  return out;
}

/** Standing body: the middle strip of her box, from the head down to just above the feet. */
const bodyBox = (p, size) => ({ x: p.x + size * 0.3, y: p.y + size * 0.08, w: size * 0.4, h: size * 0.9 });

/** Would she cover text, a button or a panel standing at `p`? */
export function coversContent(p, size, { standing = true, rects = null } = {}) {
  const box = standing ? bodyBox(p, size) : { x: p.x, y: p.y, w: size, h: size };
  const list = rects || contentRects(standing ? p.y + size : Infinity);
  return list.some((r) => overlaps(box, r, 0));
}

/** Room to sit on the edge at `p`: no text or controls where her legs would hang. */
export function seatClear(p, size) {
  const legs = { x: p.x + size * 0.3, y: p.y + size, w: size * 0.4, h: size * SEAT_LEG_FRAC };
  for (const el of document.querySelectorAll(TEXT_SELECTOR)) {
    if (el.closest(NOT_CONTENT)) continue;
    const r = visibleRect(el);
    if (r && overlaps(legs, r, 2)) return false;
  }
  return true;
}

function isClear(p, size, avoid) {
  const box = { x: p.x, y: p.y, w: size, h: size };
  return !avoid.some((r) => overlaps(box, r));
}

function perchPoints(size) {
  const out = [];
  for (const el of document.querySelectorAll("[data-perch]")) {
    const r = visibleRect(el);
    if (!r || r.width < size * 1.5 || r.top < TITLEBAR_H + size) continue;
    const x = r.left + 12 + Math.random() * Math.max(0, r.width - size - 24);
    out.push({ x, y: r.top - size * 0.78, perch: true });
  }
  return out;
}

function marginPoint(size) {
  const b = viewportBounds(size);
  const side = Math.random();
  if (side < 0.4) return { x: b.minX + Math.random() * MARGIN_BAND * 0.6, y: b.minY + Math.random() * (b.maxY - b.minY) };
  if (side < 0.8) return { x: b.maxX - Math.random() * MARGIN_BAND * 0.6, y: b.minY + Math.random() * (b.maxY - b.minY) };
  return { x: b.minX + Math.random() * (b.maxX - b.minX), y: b.maxY - Math.random() * MARGIN_BAND * 0.5 };
}

/**
 * Pick somewhere to fly: a perch on a card edge about half the time, otherwise a
 * spot in the window margins. Never covers panels, text, buttons or inputs.
 */
export function pickWaypoint(size, from) {
  const avoid = contentRects();
  const perches = Math.random() < 0.55 ? perchPoints(size) : [];
  const candidates = [];
  for (const p of perches) candidates.push(p);
  for (let i = 0; i < 8; i += 1) candidates.push(marginPoint(size));
  const ok = candidates
    .map((p) => ({ ...clampPoint(p, size), perch: !!p.perch }))
    .filter((p) => isClear(p, size, avoid))
    .filter((p) => !from || Math.hypot(p.x - from.x, p.y - from.y) > 80);
  if (!ok.length) return null;
  return ok[Math.floor(Math.random() * ok.length)];
}

/** A clear spot next to an element, on the preferred side when there's room. */
export function pointBeside(rect, size, placement = "right") {
  const gap = 14;
  const order = [placement, "right", "left", "bottom", "top"];
  const avoid = avoidRects();
  for (const side of order) {
    let p;
    if (side === "right") p = { x: rect.right + gap, y: rect.top + rect.height / 2 - size / 2 };
    else if (side === "left") p = { x: rect.left - gap - size, y: rect.top + rect.height / 2 - size / 2 };
    else if (side === "bottom") p = { x: rect.left + Math.min(rect.width / 2, 120) - size / 2, y: rect.bottom + gap };
    else p = { x: rect.left + Math.min(rect.width / 2, 120) - size / 2, y: rect.top - gap - size };
    const b = viewportBounds(size);
    const inside = p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
    if (inside && isClear(p, size, avoid)) return { ...p, side };
  }
  const fallback = clampPoint({ x: rect.right + gap, y: rect.top }, size);
  return { ...fallback, side: "right" };
}

/* ---------- platforms: where the 3D body can stand ---------- */

const MIN_PLATFORM_W = 120;

/** The window's bottom edge; always there. `el: null` marks it. */
export function groundPlatform() {
  return { el: null, top: window.innerHeight - EDGE, left: EDGE, right: window.innerWidth - EDGE };
}

/** Ground plus the top edge of every visible `[data-perch]` card with headroom above it. */
export function platforms(size) {
  const out = [groundPlatform()];
  for (const el of document.querySelectorAll("[data-perch]")) {
    const p = livePlatform({ el }, size);
    if (p) out.push(p);
  }
  return out;
}

/** Current geometry of a platform, or null when it's gone, hidden or too cramped to stand on. */
export function livePlatform(plat, size) {
  if (!plat) return null;
  if (!plat.el) return groundPlatform();
  if (!plat.el.isConnected) return null;
  const r = visibleRect(plat.el);
  if (!r || r.width < MIN_PLATFORM_W || r.top < TITLEBAR_H + size * 0.92 || r.top > window.innerHeight - EDGE - 8) return null;
  return { el: plat.el, top: r.top, left: Math.max(EDGE, r.left + 6), right: Math.min(window.innerWidth - EDGE, r.right - 6) };
}

const feetX = (pos, size) => pos.x + size / 2;

/** The platform her feet are on right now (within `tol` px), if any. */
export function platformAt(pos, size, tol = 4) {
  const cx = feetX(pos, size);
  const feet = pos.y + size;
  return platforms(size).find((p) => cx >= p.left && cx <= p.right && Math.abs(p.top - feet) <= tol) || null;
}

/** The first platform under her feet (what she'd land on falling from here). */
export function platformBelow(pos, size, exclude = null) {
  const cx = feetX(pos, size);
  const feet = pos.y + size;
  return (
    platforms(size)
      .filter((p) => p.el !== exclude || !p.el)
      .filter((p) => cx >= p.left && cx <= p.right && p.top >= feet - 2)
      .sort((a, b) => a.top - b.top)[0] || groundPlatform()
  );
}

/** Box position with her feet on `plat`, centered at `cx` (clamped onto the platform). */
export function standOn(plat, cx, size) {
  const x = Math.min(plat.right, Math.max(plat.left, cx)) - size / 2;
  return clampPoint({ x, y: plat.top - size }, size);
}

/**
 * Where to go next when idle: usually a stroll along the current platform, sometimes a
 * teleport up onto a card (or back down to the floor). `walk` says whether it's a stroll.
 * Every candidate is checked against panels, text and buttons, and a stroll's whole path
 * has to be clear too.
 */
export function pickStroll(size, pos, current, { sameOnly = false } = {}) {
  const here = livePlatform(current, size) || platformAt(pos, size) || groundPlatform();
  const cx = feetX(pos, size);
  const tries = [];
  if (sameOnly || Math.random() < 0.65) {
    for (let i = 0; i < 6; i += 1) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const x = cx + dir * (60 + Math.random() * 300);
      if (x >= here.left && x <= here.right) tries.push({ plat: here, cx: x, walk: true });
    }
  }
  if (!sameOnly) {
    const others = platforms(size).filter((p) => p.el !== here.el);
    for (const p of others) tries.push({ plat: p, cx: p.left + Math.random() * (p.right - p.left), walk: false });
  }
  const byLine = new Map();
  const rectsAt = (feetLine) => {
    const key = Math.round(feetLine);
    if (!byLine.has(key)) byLine.set(key, contentRects(feetLine));
    return byLine.get(key);
  };
  const pathClear = (p) => {
    const rects = rectsAt(p.y + size);
    if (!p.walk) return !coversContent(p, size, { rects });
    const steps = Math.max(1, Math.ceil(Math.abs(p.x - pos.x) / (size * 0.3)));
    for (let i = 1; i <= steps; i += 1) {
      if (coversContent({ x: pos.x + ((p.x - pos.x) * i) / steps, y: p.y }, size, { rects })) return false;
    }
    return true;
  };
  const ok = tries
    .map((t) => ({ ...standOn(t.plat, t.cx, size), plat: t.plat, walk: t.walk }))
    .filter((p) => Math.abs(p.x - pos.x) > 30 || !p.walk)
    .filter(pathClear);
  if (!ok.length) return null;
  const strolls = ok.filter((p) => p.walk);
  if (strolls.length && (sameOnly || Math.random() < 0.65)) return strolls[Math.floor(Math.random() * strolls.length)];
  return ok[Math.floor(Math.random() * ok.length)];
}

/**
 * The nearest panel edge she can sit on to rest: headroom above (livePlatform), nothing covered
 * where she'd stand, and no text or controls where her legs hang. Returns a stand point with
 * its `plat` and whether it's a level `walk` from here, or null.
 */
export function pickRestEdge(size, pos) {
  const cx = feetX(pos, size);
  const feet = pos.y + size;
  const spots = [];
  for (const plat of platforms(size)) {
    if (!plat.el) continue;
    const x = Math.min(plat.right - size * 0.3, Math.max(plat.left + size * 0.3, cx));
    const p = standOn(plat, x, size);
    spots.push({ ...p, plat, walk: Math.abs(plat.top - feet) < 6, dist: Math.hypot(p.x - pos.x, p.y - pos.y) });
  }
  spots.sort((a, b) => a.dist - b.dist);
  for (const s of spots) {
    if (!coversContent(s, size) && seatClear(s, size)) return s;
  }
  return null;
}

/* ---------- idle life: open grid space to doodle on, a panel edge to peek from ---------- */

const PANEL_SELECTOR = ".sh-panel, .sh-hub-block, [data-perch]";

/**
 * Open grid space beside her, at arm's reach around chest height, for a `w` x `h` doodle.
 * Never over panels, text or controls (her home window counts as open). Prefers the side
 * she faces. Returns { rect, side } or null.
 */
export function findDoodleSpot(pos, size, { w, h, prefer = 1 }) {
  const rects = contentRects();
  const chestY = pos.y + size * 0.32;
  const reach = size * 0.12;
  const minY = TITLEBAR_H + 8;
  const sides = prefer < 0 ? [-1, 1] : [1, -1];
  for (const side of sides) {
    for (const lift of [0, -0.25, 0.25]) {
      const left = side > 0 ? pos.x + size * 0.62 + reach : pos.x + size * 0.38 - reach - w;
      const top = chestY - h / 2 + lift * h;
      if (left < EDGE || top < minY || left + w > window.innerWidth - EDGE || top + h > window.innerHeight - EDGE) continue;
      const box = { x: left, y: top, w, h };
      if (rects.some((r) => overlaps(box, r, 10))) continue;
      return { rect: { left, top, width: w, height: h }, side };
    }
  }
  return null;
}

/**
 * A panel she can hide behind: one that covers most of her height where she stands, with
 * the near edge along her current platform. She stands just inside the edge and peeks out
 * toward open space (`outward`). Returns { x, y, el, outward } or null.
 */
export function findPeekSpot(pos, size, current, { maxDist = 420 } = {}) {
  const plat = livePlatform(current, size) || platformAt(pos, size) || groundPlatform();
  const feet = pos.y + size;
  const top = pos.y + size * 0.12;
  const bottom = feet - size * 0.05;
  const cx = pos.x + size / 2;
  const options = [];
  for (const el of document.querySelectorAll(PANEL_SELECTOR)) {
    if (el.closest(NOT_CONTENT)) continue;
    const r = visibleRect(el);
    if (!r || r.width < size * 0.6) continue;
    if (Math.min(r.bottom, bottom) - Math.max(r.top, top) < (bottom - top) * 0.6) continue;
    const outward = cx < r.left ? -1 : cx > r.right ? 1 : 0;
    if (!outward) continue;
    const edge = outward < 0 ? r.left : r.right;
    const x = edge - outward * size * 0.1;
    if (x < plat.left || x > plat.right || Math.abs(x - cx) < 40 || Math.abs(x - cx) > maxDist) continue;
    options.push({ el, x: x - size / 2, y: feet - size, outward });
  }
  if (!options.length) return null;
  const all = [...document.querySelectorAll(CONTENT_SELECTOR)];
  for (const o of options.sort(() => Math.random() - 0.5)) {
    const rects = all
      .filter((el) => el !== o.el && !o.el.contains(el) && !el.contains(o.el) && !el.closest(NOT_CONTENT))
      .map(visibleRect)
      .filter((r) => r && r.top < feet - 2);
    const steps = Math.max(1, Math.ceil(Math.abs(o.x - pos.x) / (size * 0.3)));
    let clear = true;
    for (let i = 1; i <= steps && clear; i += 1) {
      if (coversContent({ x: pos.x + ((o.x - pos.x) * i) / steps, y: o.y }, size, { rects })) clear = false;
    }
    if (clear) return o;
  }
  return null;
}

export function findTarget(id) {
  if (!id) return null;
  const el = document.querySelector(`[data-tour-id="${id}"]`);
  if (!el) return null;
  return visibleRect(el) ? el : null;
}

/** Resolve once `[data-tour-id=id]` is on screen, or null after `timeout` ms. */
export function waitForTarget(id, timeout = 3000) {
  return waitFor(() => findTarget(id), timeout);
}

/** Resolve with `find()`'s first truthy result, polling every 100ms, or null after `timeout` ms. */
export function waitFor(find, timeout = 3000) {
  return new Promise((resolve) => {
    const started = performance.now();
    const tick = () => {
      const el = find();
      if (el) return resolve(el);
      if (performance.now() - started > timeout) return resolve(null);
      window.setTimeout(tick, 100);
    };
    tick();
  });
}
