/**
 * Nova's behavior states. Every mode change goes through `transition` so impossible
 * jumps (say, wandering off mid-quiz) simply don't happen.
 */
const ENGAGE = { TOUR: "tour", HELP: "help", QUIZ: "quiz", HIDE: "hidden" };
/* The spoken Today briefing: she walks to what she's talking about. */
const BRIEF = { BRIEF: "brief" };

const TABLE = {
  idle: { WANDER: "wander", PERCH: "perch", PLAY: "play", CLICK: "menu", NUDGE: "nudge", SLEEP: "sleep", GREET: "greet", DROP: "idle", ...BRIEF, ...ENGAGE },
  wander: { ARRIVE: "idle", PERCH: "perch", CLICK: "menu", NUDGE: "nudge", SLEEP: "sleep", GREET: "greet", DROP: "idle", ...BRIEF, ...ENGAGE },
  perch: { DONE: "idle", WANDER: "wander", PLAY: "play", CLICK: "menu", NUDGE: "nudge", SLEEP: "sleep", DROP: "idle", ...BRIEF, ...ENGAGE },
  /* Idle life: doodling, reading, shuffling cards, dozing off, peeking out from behind a panel. */
  play: { DONE: "idle", WANDER: "wander", SLEEP: "sleep", CLICK: "menu", NUDGE: "nudge", GREET: "greet", DROP: "idle", ...BRIEF, ...ENGAGE },
  sleep: { WAKE: "idle", CLICK: "menu", DROP: "idle", ...BRIEF, ...ENGAGE },
  menu: { CLOSE: "idle", CLICK: "idle", ...ENGAGE },
  greet: { CLOSE: "idle", ...ENGAGE },
  nudge: { CLOSE: "idle", CLICK: "menu", ...ENGAGE },
  brief: { END: "idle", CLICK: "menu", ...ENGAGE },
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

/** Modes where Nova acts on her own (wanders, perches, plays, sleeps, nudges). */
export const AUTONOMOUS = new Set(["idle", "wander", "perch", "play"]);
