import { useSyncExternalStore } from "react";

/**
 * Nova's workspace on Today: which slot each panel sits in. Slots:
 *   left    the column under her home window (briefing only)
 *   center  the main column, full width
 *   dock    the row under it, panels side by side
 *   desk    filed away on her desk as a small card
 * Panels keep a fixed order inside a slot. Saved in localStorage (a UI pref, not course data).
 */

export const PANELS = ["briefing", "tonight", "standing", "week"];
export const PANEL_LABELS = { briefing: "Briefing", tonight: "Tonight", standing: "Standing", week: "This week" };
const ALLOWED = { briefing: ["left", "desk"], tonight: ["center", "dock", "desk"], standing: ["center", "dock", "desk"], week: ["center", "dock", "desk"] };

export const LAYOUTS = {
  briefing: { briefing: "left", tonight: "center", standing: "dock", week: "dock" },
  grades: { briefing: "left", tonight: "dock", standing: "center", week: "dock" },
  tidy: { briefing: "desk", tonight: "desk", standing: "desk", week: "desk" },
};

const KEY = "sh-nova-workspace";

export const canPlace = (id, slot) => !!ALLOWED[id]?.includes(slot);

/** Panel ids in `slot`, in their fixed order. */
export const inSlot = (layout, slot) => PANELS.filter((id) => layout[id] === slot);

/**
 * The moves that turn `from` into `to`, one panel at a time: panels leaving for the desk first
 * (clears room), then moves between slots, then panels coming off the desk.
 */
export function movesTo(from, to) {
  const moves = PANELS.filter((id) => to[id] && from[id] !== to[id]).map((id) => ({ id, from: from[id], slot: to[id] }));
  const rank = (m) => (m.slot === "desk" ? 0 : m.from === "desk" ? 2 : 1);
  return moves.sort((a, b) => rank(a) - rank(b));
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && PANELS.every((id) => canPlace(id, saved[id]))) return saved;
  } catch {
    /* fall through to the default */
  }
  return { ...LAYOUTS.briefing };
}

let state = { layout: typeof localStorage === "undefined" ? { ...LAYOUTS.briefing } : load(), before: null };
const listeners = new Set();

/** Panel rects just before the last change, so Today can animate panels from where they were. */
export const lastRects = new Map();

function measure() {
  lastRects.clear();
  if (typeof document === "undefined") return;
  for (const id of PANELS) {
    const el = document.querySelector(`[data-nova-anchor="panel.${id}"]`);
    if (el) lastRects.set(id, el.getBoundingClientRect());
  }
}

function commit(next) {
  measure();
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state.layout));
  } catch {
    /* storage full or unavailable: the layout still applies for this session */
  }
  for (const l of listeners) l();
}

export const workspace = {
  get: () => state,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Put one panel in a slot. False when the panel can't go there. */
  place(id, slot) {
    if (!canPlace(id, slot)) return false;
    if (state.layout[id] !== slot) commit({ ...state, layout: { ...state.layout, [id]: slot } });
    return true;
  },
  /** Remember the current layout so "Put it back" can restore it after Nova rearranges. */
  remember() {
    state = { ...state, before: { ...state.layout } };
    for (const l of listeners) l();
  },
  /** Apply a named layout at once (no Nova): the fallback when she's hidden or quiet. */
  apply(name) {
    const to = LAYOUTS[name];
    if (!to) return false;
    commit({ layout: { ...to }, before: { ...state.layout } });
    return true;
  },
  putBack() {
    if (state.before) commit({ layout: state.before, before: null });
  },
};

export function useWorkspace() {
  return useSyncExternalStore(workspace.subscribe, workspace.get);
}
