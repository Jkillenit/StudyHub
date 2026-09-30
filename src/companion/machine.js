/**
 * Nova's behavior states. Every mode change goes through `transition` so impossible
 * jumps (say, wandering off mid-quiz) simply don't happen.
 */
const ENGAGE = { TOUR: "tour", HELP: "help", QUIZ: "quiz", HIDE: "hidden" };

const TABLE = {
  idle: { WANDER: "wander", PERCH: "perch", CLICK: "menu", NUDGE: "nudge", SLEEP: "sleep", GREET: "greet", DROP: "idle", ...ENGAGE },
  wander: { ARRIVE: "idle", PERCH: "perch", CLICK: "menu", NUDGE: "nudge", SLEEP: "sleep", GREET: "greet", DROP: "idle", ...ENGAGE },
  perch: { DONE: "idle", WANDER: "wander", CLICK: "menu", NUDGE: "nudge", SLEEP: "sleep", DROP: "idle", ...ENGAGE },
  sleep: { WAKE: "idle", CLICK: "menu", DROP: "idle", ...ENGAGE },
  menu: { CLOSE: "idle", CLICK: "idle", ...ENGAGE },
  greet: { CLOSE: "idle", ...ENGAGE },
  nudge: { CLOSE: "idle", CLICK: "menu", ...ENGAGE },
  tour: { END: "idle", HIDE: "hidden" },
  help: { CLOSE: "idle", CLICK: "idle", ...ENGAGE },
  quiz: { END: "idle", HIDE: "hidden" },
  hidden: { SHOW: "idle" },
};

export const MODES = Object.keys(TABLE);

/** Next mode for an event, or the current mode when the event doesn't apply. */
export function transition(mode, event) {
  return TABLE[mode]?.[event] || mode;
}

/** Modes where Nova acts on her own (wanders, perches, sleeps, nudges). */
export const AUTONOMOUS = new Set(["idle", "wander", "perch"]);
