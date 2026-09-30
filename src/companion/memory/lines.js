/**
 * Nova's memory lines: templates keyed by trigger, filled only with facts from her memory.
 * A line is never said twice within LINE_REPEAT_MS; when every variant of a trigger has been
 * used this week she skips that trigger and moves to the next thing she knows.
 */
import { hourLabel, known } from "./derive.js";
import { pick, voiceLevel } from "../../nova/voice.js";

export const LINE_REPEAT_MS = 7 * 86400000;
export const ABSENT_DAYS = 3;
export const LATE_SLEEP_HOURS = [2, 5];
export const MEMORY_LINES = {
  introName: ["Well, hello there. I'm Nova. First things first: what should I call you?"],
  askName: ["Quick one before we start. What should I call you?", "Before anything else: what do I call you?"],
  nameSaved: ["{name}. Got it. I'll remember.", "{name}. Nice. Filed somewhere safe.", "Hi, {name}. Now we're properly introduced."],
  welcomeBack: [
    "Hey, stranger. {days} days. No lecture, I'm just glad you're back. Here's where things stand.",
    "{name}! {days} days without you. I kept everything warm. Quick catch-up coming.",
    "Look who's back. {days} days off happens. Let's get you caught up.",
    "There you are. {days} days is nothing. Here's what changed while you were out.",
  ],
  catchUp: [
    "{due} due this week. First up: {next}, {when}.",
    "This week: {due} due. {next} comes first, {when}.",
    "Short version: {next} is next, {when}. {due} total this week.",
  ],
  catchUpClear: [
    "Nothing due this week. Ease back in with a few cards.",
    "Your week's clear. Good time for a light review.",
    "No deadlines this week. Want a short warm-up round?",
  ],
  lateSleep: [
    "It's {time}. Your brain stops saving stuff around now. Go to sleep. Or give me 5 cards and then go.",
    "{time}, {name}. Sleep is studying too. 5 quick cards, then bed?",
    "It's {time}. I'll allow one short round. Five cards. Then you're done.",
    "Nothing sticks at {time}. Five cards, tops, then lights out.",
  ],
  comeback: [
    "{course} is back over {target}. {current}% now. That was you.",
    "Hey. {course} climbed back to {current}%. Over your {target} target again.",
    "{course}: {current}%. Back above {target}. Told you.",
    "Back over the line in {course}. {current}% against a {target} target. Nice.",
  ],
  "milestone.cards100": [
    "{cards} cards reviewed. Triple digits. I'm making a note of this.",
    "That's {cards} cards total. The first hundred are the hardest.",
    "{cards} cards. You're officially a regular.",
  ],
  "milestone.exam_ready": [
    "{exam} is {ready}% ready. First exam you've fully prepped with me. Proud of you.",
    "{ready}% ready for {exam}. That's what prepared looks like.",
    "{exam}: {ready}% ready. Remember this feeling.",
  ],
  "milestone.first_comeback": [
    "First comeback: {course} is back over target. Frame it.",
    "{course} came back over target. First one. Won't be the last.",
    "You pulled {course} back up. That's a first. Noted forever.",
  ],
  blockedReplan: [
    "You're out {when}, so I moved {title} up.",
    "Since {when} is blocked, {title} moves up. Planned around it.",
    "{when} is off-limits. I bumped {title} earlier so it doesn't pile up.",
  ],
  blockedMarked: [
    "Got it, {when} is blocked. I'll plan around it.",
    "{when} is off the table. I'll move things up.",
    "Noted: {when} is blocked. Tonight's list will adjust.",
  ],
  lastSessionCombo: [
    "Last time: {cards} cards in {course}, best run {combo}. Beat it?",
    "You went {combo} in a row on {course} last time. Let's see {nextCombo}.",
    "{combo} straight last session in {course}. I remember. Go again?",
  ],
  lastSession: [
    "Last time you did {cards} cards in {course}. Pick up where you left off?",
    "{course} last time, {cards} cards. Same again?",
    "Back for more {course}? You did {cards} last time.",
  ],
  patternEarly: [
    "You usually get going after {after}. Early start. I like it.",
    "Before {after}? That's early for you. Let's use it.",
    "Normally I don't see you until after {after}. Look at you.",
  ],
  patternUsual: [
    "Right on time. You usually get going after {after}.",
    "After {after}, right on schedule. Let's work.",
    "Your usual hour. I had a feeling you'd show up.",
  ],
  weakSpot: [
    "{topic} keeps getting you. Want 10 cards just from that?",
    "{topic} in {course}: you miss about {missPct}%. Ten cards, just that?",
    "I keep seeing {topic} trip you up. Quick round on just that?",
  ],
  streak: [
    "Day {days} of your streak. Don't break it tonight.",
    "{days} days straight. I'm counting.",
    "Streak's at {days}. Keep feeding it.",
  ],
  forgot: ["Done. Clean slate. I don't remember a thing.", "Wiped. We're strangers again. Hi."],
  wakeDenial: [
    "I wasn't asleep.",
    "I wasn't asleep. I was resting my eyes.",
    "Wasn't sleeping. Thinking. With my eyes closed.",
    "I'm up. I was up. Totally up.",
  ],
};

/** Stable id for a variant, stored in companion_said. */
export const lineId = (trigger, index) => `${trigger}#${index}`;

/**
 * { id, trigger, text } for a variant not said within the repeat window whose placeholders are all
 * known, at the current language level, or null. `recent` is a Set of line ids said in the window.
 */
export function pickLine(trigger, vars = {}, { recent = new Set(), random = Math.random } = {}) {
  const got = pick(MEMORY_LINES, trigger, vars, { level: voiceLevel(), recent, random, strict: true });
  return got && { ...got, trigger };
}

/** Hours with the small hours rolled onto the evening before (1am = 25). */
function rolledHour(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  return h < 5 ? h + 24 : h;
}

export function isSleepHour(date) {
  const h = date.getHours();
  return h >= LATE_SLEEP_HOURS[0] && h < LATE_SLEEP_HOURS[1];
}

/**
 * Everything she could open with, most personal first. Each candidate is { trigger, vars, action?, then? }.
 * ctx: { memory, now, absentDays, catchUp: { due, next, when } | null, replan: { when, title } | null, timeLabel }
 */
export function openerCandidates({ memory, now = new Date(), absentDays = 0, catchUp = null, replan = null, timeLabel = "" }) {
  const name = known(memory, "name")?.name || null;
  const out = [];
  if (isSleepHour(now)) out.push({ trigger: "lateSleep", vars: { time: timeLabel, name }, action: "quick5" });

  if (absentDays >= ABSENT_DAYS) {
    const then = catchUp?.next
      ? { trigger: "catchUp", vars: catchUp }
      : { trigger: "catchUpClear", vars: {} };
    out.push({ trigger: "welcomeBack", vars: { days: absentDays, name }, then });
  }

  for (const [key, entry] of Object.entries(memory || {})) {
    if (!key.startsWith("milestone:") || entry.muted || !entry.value || entry.value.celebrated) continue;
    out.push({ trigger: `milestone.${key.slice(10)}`, vars: entry.value, celebrate: true, memoryKey: key });
  }
  for (const [key, entry] of Object.entries(memory || {})) {
    if (!key.startsWith("comeback:") || entry.muted || !entry.value || entry.value.said) continue;
    out.push({ trigger: "comeback", vars: entry.value, memoryKey: key });
  }

  if (replan) out.push({ trigger: "blockedReplan", vars: replan });

  const last = known(memory, "last_session");
  if (last?.cards) {
    const combo = last.bestCombo >= 5 ? last.bestCombo : null;
    if (combo) out.push({ trigger: "lastSessionCombo", vars: { course: last.course, cards: last.cards, combo, nextCombo: combo + 1 } });
    out.push({ trigger: "lastSession", vars: { course: last.course, cards: last.cards } });
  }

  const times = known(memory, "study_time");
  if (times) {
    const h = rolledHour(now);
    const vars = { after: hourLabel(times.after) };
    if (h < times.after - 1) out.push({ trigger: "patternEarly", vars });
    else if (h >= times.after && h <= times.after + 3) out.push({ trigger: "patternUsual", vars });
  }

  const weak = known(memory, "weak_topic");
  if (weak) out.push({ trigger: "weakSpot", vars: weak, action: "weakDrill" });

  const streak = known(memory, "streak");
  if (streak?.current >= 3) out.push({ trigger: "streak", vars: { days: streak.current } });
  return out;
}

/** The first candidate that still has an unsaid line: { ...candidate, line }, or null. */
export function pickOpener(ctx, { recent = new Set(), random = Math.random } = {}) {
  for (const c of openerCandidates(ctx)) {
    const line = pickLine(c.trigger, c.vars, { recent, random });
    if (line) return { ...c, line };
  }
  return null;
}
