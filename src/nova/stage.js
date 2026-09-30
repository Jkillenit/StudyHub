import { waitForAnchor } from "./anchors.js";

/**
 * The Stage: the one interface Nova uses to touch the workspace. Scenes, the briefing walk and
 * (later) the Director and command bar all go through it. CompanionLayer supplies `deps`, the
 * body and DOM work; the Stage adds anchors, ordering, and abort + cleanup.
 *
 * Actions only run inside `stage.run(scene)`. Each resolves true when it happened, false when
 * the anchor is missing or the run was aborted. Starting a new run aborts the current one.
 */

/** Emotes as a face (mood) and/or a body gesture, and how long to wait before the next step. */
export const EMOTES = {
  nod: { mood: "happy", ms: 900 },
  shrug: { mood: "confused", ms: 1200 },
  facepalm: { gesture: "facepalm", ms: 2600 },
  laugh: { mood: "excited", gesture: "taunt", ms: 2000 },
  celebrate: { mood: "excited", gesture: "wave", ms: 2200 },
  sigh: { mood: "sad", ms: 1400 },
  smug: { mood: "happy", gesture: "wink", ms: 1200 },
  think: { mood: "thinking", ms: 1500 },
};

export const HIGHLIGHT_STYLES = ["pulse", "glow", "underline", "warn", "danger"];

/** Time to hold a line before the next step: typing plus a beat to read it. */
export const sayMs = (text) => 700 + String(text).length * 40;

const WAIT_INPUT_MS = 30 * 1000;

export function createStage(deps) {
  const find = deps.find || ((name) => waitForAnchor(name, 1500));
  let current = null;
  const wakers = new Set();

  const cleanup = () => {
    deps.unfocus();
    deps.clearMarks();
    for (const wake of wakers) wake();
    wakers.clear();
  };

  /** Resolves after `ms`, or as soon as the run is aborted. */
  const sleep = (ms) =>
    new Promise((resolve) => {
      const done = () => {
        clearTimeout(t);
        wakers.delete(done);
        resolve();
      };
      const t = setTimeout(done, ms);
      wakers.add(done);
    });

  /** Wraps an action: no-op outside a run, false if the run ended while it was working. */
  const act =
    (fn) =>
    async (...args) => {
      const r = current;
      if (!r) return false;
      const res = await fn(...args);
      return current === r && res !== false;
    };

  /** Resolve an anchor name to its element, or null (skips the action). */
  const el = async (anchor) => (current ? find(anchor) : null);

  const stage = {
    /** Run a scene `(stage) => Promise`. Resolves true if it finished, false if it was aborted. */
    async run(scene) {
      stage.abort();
      const r = { aborted: false };
      current = r;
      try {
        await scene(stage);
      } finally {
        if (current === r) {
          current = null;
          cleanup();
        }
      }
      return !r.aborted;
    },

    /** Stop the running scene where it is and undo what it left on screen. */
    abort() {
      if (!current) return;
      current.aborted = true;
      current = null;
      deps.stop();
      cleanup();
    },

    get running() {
      return !!current;
    },

    find: (anchor) => el(anchor),

    walkTo: act(async (anchor) => {
      const e = await el(anchor);
      return e ? deps.walkTo(e) : false;
    }),

    lookAt: act(async (target) => {
      if (target === "user") return deps.lookAt(null);
      const e = await el(target);
      return e ? deps.lookAt(e) : false;
    }),

    pointAt: act(async (anchor) => {
      const e = await el(anchor);
      return e ? deps.pointAt(e) : false;
    }),

    highlight: act(async (anchor, style = "pulse") => {
      const e = await el(anchor);
      if (!e) return false;
      deps.mark(anchor, e, HIGHLIGHT_STYLES.includes(style) ? style : "pulse");
    }),

    clearHighlights: act(async () => deps.clearMarks()),

    pinNote: act(async (anchor, text) => {
      const e = await el(anchor);
      if (!e) return false;
      deps.mark(`note:${anchor}`, e, "note", String(text));
    }),

    scrollTo: act(async (anchor, style = "pulse") => {
      const e = await el(anchor);
      if (!e) return false;
      await deps.scrollTo(e);
      deps.mark(anchor, e, style);
    }),

    openTab: act(async (route) => deps.openTab(route)),

    focusPanel: act(async (anchor) => {
      const e = await el(anchor);
      return e ? deps.focus(e) : false;
    }),

    unfocus: act(async () => deps.unfocus()),

    /** A line key from the character library, or literal text when there's no such key. */
    say: act(async (keyOrText, vars = {}) => {
      const text = deps.line(keyOrText, vars) || keyOrText;
      deps.say(text);
      await sleep(sayMs(text));
    }),

    emote: act(async (name) => {
      const e = EMOTES[name];
      if (!e) return false;
      if (e.mood) deps.mood(e.mood);
      if (e.gesture) deps.gesture(e.gesture);
      await sleep(e.ms);
    }),

    /** Pause for `ms`, or 'input': any input aborts the scene, so this waits until then (or a timeout). */
    wait: act(async (what, timeout = WAIT_INPUT_MS) => {
      await sleep(typeof what === "number" ? what : timeout);
    }),
  };
  return stage;
}

/** Ask Nova to perform a scene `(stage) => Promise`. CompanionLayer listens and runs it on its Stage. */
export const playScene = (scene) => window.dispatchEvent(new CustomEvent("studyhub-companion-scene", { detail: { scene } }));
