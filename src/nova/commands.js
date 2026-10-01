/**
 * The command bar's brain, no AI: turns typed text into { id, ...slots } that CompanionLayer runs.
 *
 *   "quiz me on mis 430"                → { id: "quiz", course }
 *   "what's due tomorrow"               → { id: "due", days: [1, 1], when: "tomorrow" }
 *   "what do i need on the final for gba" → { id: "need", course, item: "final" }
 *   "focus 50"                          → { id: "focus", minutes: 50 }
 *   "put grades on the left"            → { id: "move", panel: "standing", slot: "left" }
 *   "open notes for marketing"          → { id: "open", course, tab: "notes" }
 *   "hi" / "thanks" / "i'm tired"       → { id: "talk", key }
 *
 * Courses match on code ("MIS 430"), number ("430") and name words ("marketing"). Small typos in
 * command words are forgiven (one edit). Unknown text returns null.
 */
import { shortCourse } from "../features/dashboard/courseLabel.js";
import { daysUntil } from "../features/today/priority.js";

export const FOCUS_DEFAULT = 25;
const FOCUS_RANGE = [5, 120];

/** Words commands key on; a typo within one edit of these (5+ letters) is read as the word. */
const VOCAB = ["quiz", "drill", "flashcards", "focus", "grades", "grade", "standing", "tomorrow", "tonight", "today", "week", "final", "midterm", "exam", "need", "next", "open", "calendar", "courses", "notes", "glossary", "content", "tidy", "briefing", "thanks", "tired", "annoying", "night", "sorry", "assignments", "homework", "deadline"];

function oneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1 || a === b) return a === b;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Lowercase, punctuation out, apostrophes dropped ("what's" → "whats"), typos fixed. */
export function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length >= 5 && !VOCAB.includes(w) ? VOCAB.find((v) => oneEdit(w, v)) || w : w))
    .join(" ");
}

const NAME_STOP = new Set(["intro", "introduction", "to", "of", "and", "the", "for", "in", "i", "ii", "iii", "principles", "fundamentals", "course", "section"]);

/** Course codes, numbers and name words to match typed text against. */
export function courseAliases(c) {
  const code = shortCourse(c.courseCode || c.code || c.name || "");
  const m = /^([A-Z]{2,5}) (\d{3,4}[A-Z]?)$/.exec(code);
  const name = normalize(c.name || "").split(" ").filter((w) => w.length >= 4 && !NAME_STOP.has(w) && !/^\d+$/.test(w));
  return {
    code: m ? `${m[1]} ${m[2]}`.toLowerCase() : null,
    dept: m ? m[1].toLowerCase() : null,
    number: m ? m[2].toLowerCase() : null,
    words: name,
  };
}

/** The course the text names, or null (also null when two courses tie). */
export function matchCourse(text, courses = []) {
  const t = ` ${normalize(text)} `;
  const scored = courses
    .map((c) => {
      const a = courseAliases(c);
      let score = 0;
      if (a.code && (t.includes(` ${a.code} `) || t.includes(` ${a.code.replace(" ", "")} `))) score += 3;
      else if (a.number && t.includes(` ${a.number} `)) score += 2.5;
      else if (a.dept && t.includes(` ${a.dept} `)) score += 2;
      score += a.words.filter((w) => t.includes(` ${w} `) || t.includes(` ${w.slice(0, 5)}`)).length;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length || (scored[1] && scored[1].score === scored[0].score)) return null;
  return scored[0].c;
}

const PANEL_WORDS = [
  [/\b(briefing|summary)\b/, "briefing"],
  [/\b(tonight|tasks?|todo|to do|list)\b/, "tonight"],
  [/\b(grades?|standing|gauges?)\b/, "standing"],
  [/\b(week|calendar strip|weekly)\b/, "week"],
];
const SLOT_WORDS = { left: "left", center: "center", middle: "center", main: "center", dock: "dock", bottom: "dock", desk: "desk", away: "desk" };

const TABS = { notes: "notes", glossary: "glossary", terms: "glossary", grades: "grades", content: "content", files: "content", deck: "deck", flashcards: "deck", cards: "deck" };
const VIEWS = { calendar: "calendar", courses: "courses", today: "today", home: "today", dashboard: "today" };

/** Small talk: [pattern, key]. First match wins. */
export const TALK = [
  [/^(hi|hey|hello|yo|sup|hiya|howdy)\b/, "hi"],
  [/\b(thanks|thank you|thx|ty)\b/, "thanks"],
  [/\b(sorry|my bad|apologi[sz]e)\b/, "sorry"],
  [/\b(tired|exhausted|sleepy|burnt out|burned out)\b/, "tired"],
  [/\b(annoying|shut up|go away|stop talking)\b/, "annoying"],
  [/\b(good ?night|gn|going to bed|bedtime)\b/, "goodnight"],
  [/\b(how are you|hows it going|how are things|whats up)\b/, "howAreYou"],
  [/\b(who are you|what are you|your name)\b/, "whoAreYou"],
  [/\b(love you|ily|youre the best|best ai)\b/, "love"],
  [/\b(stressed|anxious|overwhelmed|panicking|freaking out)\b/, "stressed"],
  [/\b(bored|boring)\b/, "bored"],
];

/** { id, ...slots } for typed text, or null. `courses`: [{ id, name, courseCode }]. */
export function parseCommand(text, { courses = [] } = {}) {
  const t = normalize(text);
  if (!t) return null;
  const course = matchCourse(t, courses);

  const focus = /\b(focus|pomodoro|lock in)\b(?:\s+(?:for\s+)?(\d{1,3}))?/.exec(t);
  if (focus) {
    const n = Number(focus[2]) || FOCUS_DEFAULT;
    return { id: "focus", minutes: Math.min(FOCUS_RANGE[1], Math.max(FOCUS_RANGE[0], n)) };
  }

  if (/\b(need|needed|what if)\b/.test(t) && /\b(final|midterm|exam|test)\b/.test(t)) {
    const item = /\bmidterm\b/.test(t) ? "midterm" : /\bfinal\b/.test(t) ? "final" : "exam";
    return { id: "need", course, item };
  }

  const move = /\b(?:put|move|send|drag)\b(.*?)\b(?:on|to|in|into|onto)\s+(?:the\s+)?(left|center|middle|main|dock|bottom|desk|away)\b/.exec(t);
  if (move) {
    const panel = PANEL_WORDS.find(([re]) => re.test(move[1]))?.[1];
    if (panel) return { id: "move", panel, slot: SLOT_WORDS[move[2]] };
  }
  if (/\b(put (it|everything) back|undo|restore)\b/.test(t)) return { id: "layout", name: "back" };
  if (/\b(tidy|clean up|clear (the )?(screen|desk)|declutter)\b/.test(t)) return { id: "layout", name: "tidy" };
  const layout = /\b(briefing|grades) (layout|view|mode)\b/.exec(t);
  if (layout) return { id: "layout", name: layout[1] };

  if (/\b(due|deadlines?|homework|assignments?)\b/.test(t)) {
    if (/\b(today|tonight)\b/.test(t)) return { id: "due", days: [0, 0], when: "today" };
    if (/\btomorrow\b/.test(t)) return { id: "due", days: [1, 1], when: "tomorrow" };
    return { id: "due", days: [0, 6], when: "this week", course };
  }
  if (/\b(whats next|what next|next up|what should i (do|work on|study)|where do i start|priority|priorities)\b/.test(t) || t === "next") {
    return { id: "next" };
  }
  if (/\b(quiz|drill|test me|flashcards?|cards|practice)\b/.test(t)) return { id: "quiz", course };

  const open = /\b(open|go to|goto|show( me)?|take me to|bring up|pull up)\b/.test(t);
  const tabWord = Object.keys(TABS).find((w) => new RegExp(`\\b${w}\\b`).test(t));
  if (open || (course && tabWord)) {
    if (course) return { id: "open", course, tab: tabWord ? TABS[tabWord] : null };
    const view = Object.keys(VIEWS).find((w) => new RegExp(`\\b${w}\\b`).test(t));
    if (view) return { id: "view", view: VIEWS[view] };
  }
  if (/\b(grades?|standing|gpa|how am i doing|my scores?)\b/.test(t)) return { id: "grades", course };
  if (course) return { id: "open", course, tab: null };

  for (const [re, key] of TALK) if (re.test(t)) return { id: "talk", key };
  return null;
}

/** Open assignments due `days[0]..days[1]` days from now, soonest first: [{ title, course, days }]. */
export function dueBetween(todayData, [from, to], now = new Date(), courseUuid = null) {
  const out = [];
  for (const c of todayData?.courses || []) {
    if (courseUuid && c.uuid !== courseUuid) continue;
    for (const a of c.assignments || []) {
      if (a.completed || a.score != null) continue;
      const days = daysUntil(a.dueDate, now.toISOString());
      if (days != null && days >= from && days <= to) out.push({ title: a.title, course: courseName(c), days, dueDate: a.dueDate });
    }
  }
  return out.sort((x, y) => String(x.dueDate).localeCompare(String(y.dueDate)));
}

/** "What's next": she goes to Tonight's top item and says it (context: briefingContext). */
export const NEXT_SCENE = {
  steps: [
    { do: "openTab", route: "hub" },
    {
      if: "task",
      then: [
        { do: "openPanel", panel: "tonight" },
        { do: "walkTo", anchor: "tonight.item.1" },
        { do: "pointAt", anchor: "tonight.item.1" },
        { do: "highlight", anchor: "tonight.item.1", style: "glow" },
        { do: "say", line: "briefing.task" },
      ],
      else: [{ do: "say", line: "briefing.clear" }],
    },
    { do: "lookAt", target: "user" },
  ],
};

/** Quick chips under the input: label + what they run. */
export const CHIPS = [
  { label: "What's next", text: "what's next" },
  { label: "Quiz me", text: "quiz me" },
  { label: "Focus 25", text: "focus 25" },
  { label: "Grades", text: "grades" },
  { label: "What do I need on the final", text: "what do i need on the final" },
  { label: "Tidy up", text: "tidy up" },
];

const PANEL_NAMES = { briefing: "Briefing", tonight: "Tonight", standing: "Standing", week: "Week" };
const courseName = (c) => (c ? shortCourse(c.courseCode || c.name) || c.name : null);

/** What a parsed command will do, for the preview row ("▸ Quiz me on MIS 430"). */
export function describeCommand(cmd) {
  if (!cmd) return null;
  const on = (c, pre = " on ") => (c ? `${pre}${courseName(c)}` : "");
  switch (cmd.id) {
    case "focus":
      return `Focus for ${cmd.minutes} minutes`;
    case "need":
      return cmd.course ? `What you need on the ${cmd.item} in ${courseName(cmd.course)}` : `What you need on the ${cmd.item}`;
    case "move":
      return `Move ${PANEL_NAMES[cmd.panel]} to the ${cmd.slot}`;
    case "layout":
      return { back: "Put the layout back", tidy: "Tidy up the desk", briefing: "Briefing layout", grades: "Grades layout" }[cmd.name];
    case "due":
      return `What's due ${cmd.when}${on(cmd.course, " in ")}`;
    case "next":
      return "What to do next";
    case "quiz":
      return `Quiz me${on(cmd.course)}`;
    case "open":
      return `Open ${courseName(cmd.course)}${cmd.tab ? ` (${cmd.tab})` : ""}`;
    case "view":
      return `Go to ${cmd.view[0].toUpperCase()}${cmd.view.slice(1)}`;
    case "grades":
      return cmd.course ? `${courseName(cmd.course)} grades` : "Grades layout";
    default:
      return null;
  }
}
