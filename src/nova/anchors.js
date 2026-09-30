/**
 * Anchors: names for the things Nova can walk to, point at, highlight or pull forward.
 * Mark an element with `data-nova-anchor="<name>"`; the Stage looks it up by name.
 *
 * Naming: dot-separated, most general part first, ids as-is, list positions 1-based.
 *   panel.<id>             a whole panel      panel.tonight, panel.standing, panel.week, panel.briefing
 *   tonight.item.<n>       nth Tonight row    tonight.item.1
 *   overdue                the overdue strip
 *   course.<uuid>.gauge    a Standing gauge
 */

import { waitFor } from "../companion/safeZones.js";

const selector = (name) => `[data-nova-anchor="${CSS.escape(name)}"]`;

/** The anchored element, or null when it isn't in the page. */
export function findAnchor(name) {
  return name ? document.querySelector(selector(name)) : null;
}

/** Resolve with the anchored element once it's in the page (say, after a route change), or null after `timeout` ms. */
export function waitForAnchor(name, timeout = 3000) {
  return waitFor(() => findAnchor(name), timeout);
}

/** Anchor names starting with `prefix` and ending with `suffix`, in page order. */
export function anchorNames(prefix = "", suffix = "") {
  return [...document.querySelectorAll("[data-nova-anchor]")]
    .map((el) => el.dataset.novaAnchor)
    .filter((n) => n.startsWith(prefix) && n.endsWith(suffix));
}

/** True when a rect is big enough to aim at and at least partly inside the window. */
export function onScreen(rect) {
  return !!rect && rect.width >= 4 && rect.bottom > 0 && rect.top < window.innerHeight;
}
