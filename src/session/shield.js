export const SHIELD_MAX = 100;
export const SHIELD_HIT = 35;
export const HEALTH_MAX = 10;
export const RECHARGE_STREAK = 3;
export const MEDAL_MIN = 5;

export function initShield() {
  return { shield: SHIELD_MAX, health: HEALTH_MAX, sinceHit: RECHARGE_STREAK, wentDown: false, downCount: 0, lostChunks: 0, last: null };
}

/** Shields absorb misses; health drops only while they are down (last === "health" re-queues the card). */
export function applyAnswer(state, correct) {
  if (correct) {
    const sinceHit = state.sinceHit + 1;
    if (state.shield < SHIELD_MAX && sinceHit >= RECHARGE_STREAK) return { ...state, sinceHit, shield: SHIELD_MAX, last: "recharge" };
    return { ...state, sinceHit, last: null };
  }
  if (state.shield > 0) {
    const shield = Math.max(0, state.shield - SHIELD_HIT);
    if (shield === 0) return { ...state, shield, sinceHit: 0, wentDown: true, downCount: state.downCount + 1, last: "down" };
    return { ...state, shield, sinceHit: 0, last: "hit" };
  }
  if (state.health === 0) return { ...state, sinceHit: 0, last: null };
  return { ...state, sinceHit: 0, health: state.health - 1, lostChunks: state.lostChunks + 1, last: "health" };
}

export function shieldStatus(state) {
  if (state.shield === 0) return "SHIELDS DOWN";
  if (state.shield < SHIELD_MAX) return `HIT · RECHARGE IN ${RECHARGE_STREAK - state.sinceHit}`;
  return "STABLE";
}

export function isDepleted(state) {
  return state.health === 0;
}

export function earnedMedals({ answered, correct, best, wentDown }) {
  if (answered < MEDAL_MIN) return [];
  const out = [];
  if (!wentDown) out.push({ id: "unbroken", label: "Unbroken", detail: "Shields never went down" });
  if (correct === answered) out.push({ id: "perfect", label: "Perfect", detail: `${answered} for ${answered}` });
  if (best >= 5) out.push({ id: "streak", label: "Streak", detail: `${best} clean in a row`, badge: `${best}×` });
  return out;
}
