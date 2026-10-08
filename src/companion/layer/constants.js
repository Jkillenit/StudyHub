import firstRun from "../tours/first-run.json";
import courseTools from "../tours/course-tools.json";

export const TOURS = { [firstRun.id]: firstRun, [courseTools.id]: courseTools };
/** Height of the 3D body's box at 100% size. */
export const SIZE_3D = 180;
export const LAND_QUIP_COOLDOWN_MS = 45 * 1000;
export const WALK_OFF_MS = 1300;
export const BODY_LOAD_TIMEOUT_MS = 12 * 1000;
export const LATE_QUIP_COOLDOWN_MS = 20 * 60 * 1000;
export const DAY_HELLO_DELAY_MS = 2500;
/** Dangling swing: radians of tilt per px/s of cursor speed, and the tilt limit. */
export const SWING_PER_PX = 0.0007;
export const SWING_MAX = 0.75;
/** Away from the window at least this long and she waves when you come back. */
export const RETURN_AWAY_MS = 10 * 60 * 1000;
/** Chance she sits down after perching on a card, and the delay before she does. */
export const SIT_CHANCE = 0.6;
export const SIT_DELAY_MS = [900, 2400];
/** Modes where she turns to face the user. */
export const ATTEND_MODES = new Set(["menu", "help", "nudge", "greet", "quiz"]);
/** Typewriter pace in SpeechBubble (2 chars / 36ms), so her mouth stops with the text. */
export const TALK_MS_PER_CHAR = 18;

export const MOVE = {
  calm: { speed: 60, idle: [14000, 28000] },
  normal: { speed: 90, idle: [8000, 20000] },
  lively: { speed: 125, idle: [5000, 12000] },
};
export const ENGAGED_SPEED = 420;
export const BUBBLE_W = 290;
export const NUDGE_FIRST_MS = 90 * 1000;
export const NUDGE_COOLDOWN_MS = 10 * 60 * 1000;
export const NUDGE_MAX_PER_SESSION = 4;
export const NUDGE_SHOW_MS = 8000;
export const DIRECTOR_TICK_MS = 3000;
/** Onboarding: how long her reply to an answer stays up before the next question. */
export const ONBOARD_BEAT_MS = 1800;
/** A grade jump this many points is an episode she'll bring up later. */
export const EPISODE_GRADE_JUMP = 3;
export const RAMPANT_MUTTER_MS = [90 * 1000, 200 * 1000];
export const XP_POP_MS = 1500;
/** The built-in OM 300 course id; its deck lives in localStorage, not SQLite. */
export const BUILTIN_ID = "builtin";
export const BUILTIN_NAME = "OM 300";

/** Home window on Today: how big she may grow, how long she stays, and how many stops she makes before heading back. */
export const HOME_SCALE = [0.6, 2.6];
export const HOME_STAY_MS = [40 * 1000, 90 * 1000];
export const HOME_AWAY_STOPS = [2, 4];
export const HOME_RETURN_DELAY_MS = 600;
export const GROW_MS = 420;
/** Modes she can hold while standing big in her home window; anything else walks her out at normal size. */
export const HOME_MODES = new Set(["idle", "menu", "sleep", "nudge", "perch", "play"]);
/** Idle stages the portrait sprite can't do (no arms, no props). */
export const SPRITE_SKIP = new Set(["fidget", "prop"]);
export const READ_MS = [35 * 1000, 60 * 1000];
/** How long she leans on a panel side as an idle activity. */
export const LEAN_MS = [20000, 40000];
/** Resting: how often a wander turns into sitting on the nearest panel edge, and for how long. */
export const REST_CHANCE = 0.7;
export const REST_MS = [30 * 1000, 60 * 1000];
/** Sync portal: how long it lingers after the result, and when to give up on a sync that went quiet. */
export const SYNC_CLOSE_MS = 700;
export const SYNC_STALE_MS = 60 * 1000;
export const DROWSY_MS = 16 * 1000;
/** Clicks: this many inside the window counts as spam; then clicks are ignored for a beat. */
export const SPAM_CLICKS = 4;
export const SPAM_WINDOW_MS = 3000;
export const SPAM_LOCK_MS = 1500;
export const MENU_LINE_MS = 2600;
/** After a drop she stays put this long (so her line can land), then walks back to her spot. */
export const BACK_AFTER_DROP_MS = 1600;
export const PICKUP_LINE_CHANCE = 0.5;
export const DROP_LINES = { task: "dropTask", exam: "dropExam", gauge: "dropGauge" };
export const BURST_MS = 900;
/** Modes that can take her away from her spot on purpose. */
export const ENGAGED_MODES = new Set(["tour", "help", "quiz", "nudge", "greet", "brief"]);
