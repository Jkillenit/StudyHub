import { MEDAL_MIN, earnedMedals } from "./shield.js";

const MAX_SHOWN = 3;
const NUKE_ACCURACY = 0.8;

const POWER_UPS = {
  "max-ammo": { label: "MAX AMMO", short: "MAX" },
  "insta-kill": { label: "INSTA-KILL", short: "KILL" },
  carpenter: { label: "CARPENTER", short: "FIX" },
  "double-points": { label: "DOUBLE POINTS", short: "2X" },
  nuke: { label: "NUKE", short: "NUKE" },
};

const MEDAL_TO_POWER_UP = { perfect: "insta-kill", unbroken: "carpenter", streak: "double-points" };
const ORDER = Object.keys(POWER_UPS);

/** Zombies pack drops: same thresholds as the medals; a closed round always drops MAX AMMO. */
export function earnedPowerUps({ answered, correct, best, wentDown, closedRound }) {
  const ids = new Set(earnedMedals({ answered, correct, best, wentDown }).map((m) => MEDAL_TO_POWER_UP[m.id]));
  if (closedRound) ids.add("max-ammo");
  if (wentDown && answered >= MEDAL_MIN && correct / answered >= NUKE_ACCURACY) ids.add("nuke");
  return ORDER.filter((id) => ids.has(id))
    .slice(0, MAX_SHOWN)
    .map((id) => ({ id, ...POWER_UPS[id] }));
}
