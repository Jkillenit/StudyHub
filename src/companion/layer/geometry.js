import { BUILTIN_ID, BUILTIN_NAME, HOME_SCALE } from "./constants.js";

export const builtinCourse = (flashcards) => ({ id: BUILTIN_ID, uuid: BUILTIN_ID, name: BUILTIN_NAME, flashcards });

export const rand = ([a, b]) => a + Math.random() * (b - a);
export const randInt = ([a, b]) => Math.floor(a + Math.random() * (b - a + 1));
export const rectOf = (r) => ({ left: r.left, top: r.top, width: r.width, height: r.height });
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export const subscribeVisibility = (cb) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
export const pageShown = () => !document.hidden;

/** The Today home window's geometry and the size she takes inside it, or null when it isn't on screen. */
export function homeGeometry(baseSize) {
  const el = document.querySelector("[data-nova-home]");
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 40 || rect.bottom < 0 || rect.top > window.innerHeight) return null;
  const floorTop = (el.querySelector("[data-nova-floor]") || el).getBoundingClientRect().top;
  const room = Math.min((floorTop - rect.top - 8) * 0.92, rect.width * 1.1);
  const size = Math.round(Math.max(baseSize * HOME_SCALE[0], Math.min(baseSize * HOME_SCALE[1], room)));
  return { el, rect, floorTop, cx: rect.left + rect.width / 2, size };
}

export const homeSpot = (g, size) => ({ x: g.cx - size / 2, y: g.floorTop - size });

/** Home geometry when a box at `p` (size `s`) has its center over the home window. */
export function overHome(p, s, baseSize) {
  const g = homeGeometry(baseSize);
  if (!g) return null;
  const cx = p.x + s / 2;
  const cy = p.y + s / 2;
  const r = g.rect;
  return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom ? g : null;
}

/** The Today task, exam or gauge under a screen point, or null. */
export function dropTargetAt(x, y) {
  for (const el of document.elementsFromPoint(x, y)) {
    const t = el.closest?.("[data-nova-drop]");
    if (t) return t;
  }
  return null;
}

/** Lets the home window dim its core while she stands in it. */
export function markStage(on) {
  const el = document.querySelector("[data-nova-home]");
  if (!el) return;
  if (on) el.dataset.housed = "true";
  else delete el.dataset.housed;
}
