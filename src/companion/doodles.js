/**
 * Nova's doodles: light-trail drawings on the background grid while the student is idle.
 * Pure: shapes are lists of strokes (point lists) in their own units; `layoutDoodle` fits one
 * into a screen rect. Personal doodles only use facts she knows (never muted ones).
 */
import { known } from "./memory/derive.js";
import { dayKey } from "../features/today/blocked.js";

/* ---------- single-stroke font on a 4 x 6 grid (y down) ---------- */

const O = [[1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 1, 6, 0, 5, 0, 1, 1, 0]];
const P = [[0, 6, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3]];

/** Each glyph is a list of flat [x0, y0, x1, y1, ...] strokes. */
export const GLYPHS = {
  A: [[0, 6, 2, 0, 4, 6], [1, 3.5, 3, 3.5]],
  B: [[0, 6, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3], [3, 3, 4, 4, 4, 5, 3, 6, 0, 6]],
  C: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5]],
  D: [[0, 0, 0, 6, 2.5, 6, 4, 4.5, 4, 1.5, 2.5, 0, 0, 0]],
  E: [[4, 0, 0, 0, 0, 6, 4, 6], [0, 3, 3, 3]],
  F: [[4, 0, 0, 0, 0, 6], [0, 3, 3, 3]],
  G: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5, 4, 3.5, 2, 3.5]],
  H: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]],
  I: [[1, 0, 3, 0], [2, 0, 2, 6], [1, 6, 3, 6]],
  J: [[4, 0, 4, 5, 3, 6, 1, 6, 0, 5]],
  K: [[0, 0, 0, 6], [4, 0, 0, 3.5], [1.3, 2.7, 4, 6]],
  L: [[0, 0, 0, 6, 4, 6]],
  M: [[0, 6, 0, 0, 2, 3, 4, 0, 4, 6]],
  N: [[0, 6, 0, 0, 4, 6, 4, 0]],
  O,
  P,
  Q: [...O, [2.5, 4.5, 4, 6]],
  R: [...P, [2, 3, 4, 6]],
  S: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 2, 1, 3, 3, 3, 4, 4, 4, 5, 3, 6, 1, 6, 0, 5]],
  T: [[0, 0, 4, 0], [2, 0, 2, 6]],
  U: [[0, 0, 0, 5, 1, 6, 3, 6, 4, 5, 4, 0]],
  V: [[0, 0, 2, 6, 4, 0]],
  W: [[0, 0, 1, 6, 2, 3, 3, 6, 4, 0]],
  X: [[0, 0, 4, 6], [4, 0, 0, 6]],
  Y: [[0, 0, 2, 3, 4, 0], [2, 3, 2, 6]],
  Z: [[0, 0, 4, 0, 0, 6, 4, 6]],
  0: [...O, [3.5, 0.8, 0.5, 5.2]],
  1: [[1, 1, 2, 0, 2, 6], [1, 6, 3, 6]],
  2: [[0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 0, 6, 4, 6]],
  3: [[0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 3, 3, 1.5, 3], [3, 3, 4, 4, 4, 5, 3, 6, 1, 6, 0, 5]],
  4: [[3, 6, 3, 0, 0, 4, 4, 4]],
  5: [[4, 0, 0, 0, 0, 3, 3, 3, 4, 4, 4, 5, 3, 6, 0, 6]],
  6: [[3.5, 0, 1, 0, 0, 1.5, 0, 5, 1, 6, 3, 6, 4, 5, 4, 4, 3, 3, 0, 3]],
  7: [[0, 0, 4, 0, 1.5, 6]],
  8: [[1, 3, 0, 2, 0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 3, 3, 1, 3, 0, 4, 0, 5, 1, 6, 3, 6, 4, 5, 4, 4, 3, 3]],
  9: [[4, 3, 1, 3, 0, 2, 0, 1, 1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 0.5, 6]],
  "+": [[2, 1.5, 2, 4.5], [0.5, 3, 3.5, 3]],
  "-": [[0.5, 3, 3.5, 3]],
};
const ADVANCE = 5.5;
const SPACE = 3.5;

const pairs = (flat, dx = 0, dy = 0) => {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i] + dx, flat[i + 1] + dy]);
  return out;
};

/** Strokes for a line of text (unknown characters are skipped). */
export function textStrokes(text) {
  const strokes = [];
  let x = 0;
  for (const ch of String(text).toUpperCase()) {
    if (ch === " ") {
      x += SPACE;
      continue;
    }
    const g = GLYPHS[ch];
    if (!g) continue;
    for (const s of g) strokes.push(pairs(s, x));
    x += ADVANCE;
  }
  return strokes;
}

/* ---------- shapes ---------- */

const circle = (cx, cy, r, n = 20, start = -Math.PI / 2) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });

function star() {
  const pts = Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    return [1 + Math.cos(a), 1 + Math.sin(a)];
  });
  return [[0, 2, 4, 1, 3, 0].map((i) => pts[i])];
}

function spiral() {
  const n = 64;
  return [
    Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      const a = t * Math.PI * 6;
      return [1 + Math.cos(a) * t, 1 + Math.sin(a) * t];
    }),
  ];
}

function sun() {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return [
      [1 + Math.cos(a) * 0.62, 1 + Math.sin(a) * 0.62],
      [1 + Math.cos(a) * 0.95, 1 + Math.sin(a) * 0.95],
    ];
  });
  return [circle(1, 1, 0.45, 24), ...rays];
}

function stickFigure() {
  return [
    circle(1, 0.35, 0.3, 16),
    [
      [1, 0.65],
      [1, 1.5],
    ],
    [
      [0.45, 1.05],
      [1, 0.9],
      [1.55, 0.6],
    ],
    [
      [0.6, 2.1],
      [1, 1.5],
      [1.4, 2.1],
    ],
  ];
}

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

/** A quick game against herself: the grid, alternating X and O, and a strike through a win. */
function ticTacToe(random) {
  const strokes = [
    [
      [1, 0],
      [1, 3],
    ],
    [
      [2, 0],
      [2, 3],
    ],
    [
      [0, 1],
      [3, 1],
    ],
    [
      [0, 2],
      [3, 2],
    ],
  ];
  const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const board = Array(9).fill(null);
  for (let m = 0; m < 9; m += 1) {
    const cell = cells[m];
    const mark = m % 2 === 0 ? "X" : "O";
    board[cell] = mark;
    const c = cell % 3;
    const r = Math.floor(cell / 3);
    if (mark === "X") {
      strokes.push(
        [
          [c + 0.22, r + 0.22],
          [c + 0.78, r + 0.78],
        ],
        [
          [c + 0.78, r + 0.22],
          [c + 0.22, r + 0.78],
        ]
      );
    } else {
      strokes.push(circle(c + 0.5, r + 0.5, 0.3, 14));
    }
    const win = WIN_LINES.find((l) => l.every((k) => board[k] === mark));
    if (win) {
      const at = (k) => [(k % 3) + 0.5, Math.floor(k / 3) + 0.5];
      strokes.push([at(win[0]), at(win[2])]);
      break;
    }
  }
  return strokes;
}

/** Letter grade with an arrow pointing up beside it. */
function gradeArrow(letter) {
  return [
    ...textStrokes(letter),
    [
      [5.8, 6],
      [5.8, 0.4],
    ],
    [
      [4.8, 1.6],
      [5.8, 0.3],
      [6.8, 1.6],
    ],
  ];
}

/** Tally marks in groups of five. */
function tallies(count) {
  const strokes = [];
  let x = 0;
  for (let i = 0; i < count; i += 1) {
    const inGroup = i % 5;
    if (inGroup === 4) {
      strokes.push([
        [x - 2.6, 2.4],
        [x - 0.2, 0.4],
      ]);
      x += 0.9;
      continue;
    }
    strokes.push([
      [x, 0],
      [x, 3],
    ]);
    x += 0.65;
  }
  return strokes;
}

/** The course code on a little card. */
function courseCard(code) {
  const text = textStrokes(code);
  const w = Math.max(4, String(code).length * ADVANCE - 1.5);
  return [
    [
      [-1.2, -1.2],
      [w + 1.2, -1.2],
      [w + 1.2, 7.2],
      [-1.2, 7.2],
      [-1.2, -1.2],
    ],
    ...text,
  ];
}

/** A block "A" with serif feet. */
function crimsonA() {
  return [
    [
      [0, 6],
      [2, 0],
      [4, 6],
    ],
    [
      [1, 3.6],
      [3, 3.6],
    ],
    [
      [-0.8, 6],
      [0.9, 6],
    ],
    [
      [3.1, 6],
      [4.8, 6],
    ],
  ];
}

/** A tent with a flag on top, for a marked drill weekend. */
function tentFlag() {
  return [
    [
      [0, 4],
      [2, 1],
      [4, 4],
    ],
    [
      [-0.4, 4],
      [4.4, 4],
    ],
    [
      [1.4, 4],
      [2, 2.7],
      [2.6, 4],
    ],
    [
      [2, 1],
      [2, -0.9],
    ],
    [
      [2, -0.9],
      [3.3, -0.45],
      [2, 0],
    ],
  ];
}

export const GENERIC_DOODLES = ["star", "spiral", "sun", "stick", "tictactoe"];

/* ---------- personal picks ---------- */

/** Letter on the usual 90/80/70/60 scale. */
export function letterFor(pct) {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return null;
}

/** The grade they're chasing: the course furthest below target, else the highest target. */
export function chasedLetter(memory) {
  const standings = Object.keys(memory || {})
    .filter((k) => k.startsWith("standing:"))
    .map((k) => known(memory, k))
    .filter((v) => v && Number.isFinite(v.target));
  if (!standings.length) return null;
  const below = standings.filter((v) => v.below).sort((a, b) => b.target - b.current - (a.target - a.current));
  const pick = below[0] || [...standings].sort((a, b) => b.target - a.target)[0];
  return letterFor(pick.target);
}

function drillSoon(memory, now, span = 7) {
  const today = dayKey(now);
  const limit = dayKey(new Date(new Date(now).getTime() + span * 86400000));
  return Object.keys(memory || {}).some((k) => {
    if (!k.startsWith("blocked:")) return false;
    const day = k.slice(8);
    return day >= today && day < limit && known(memory, k)?.reason === "drill";
  });
}

const COURSE_MAX_CHARS = 8;

/** Personal doodles she could draw right now, from what she knows. */
export function personalOptions(memory, now = new Date()) {
  const out = [];
  if (known(memory, `gameday:${dayKey(now)}`)) out.push({ id: "gameday", weight: 5 });
  const letter = chasedLetter(memory);
  if (letter) out.push({ id: "grade", letter, weight: 2 });
  const streak = known(memory, "streak");
  if (streak?.current >= 2) out.push({ id: "streak", count: Math.min(15, streak.current), weight: 2 });
  const top = known(memory, "top_course");
  const code = String(top?.course || "").trim();
  if (code && code.length <= COURSE_MAX_CHARS) out.push({ id: "course", text: code, weight: 1.5 });
  if (drillSoon(memory, now)) out.push({ id: "drill", weight: 2 });
  return out;
}

export const PERSONAL_CHANCE = 0.6;
export const GAMEDAY_CHANCE = 0.7;

function weighted(list, random) {
  const total = list.reduce((s, o) => s + o.weight, 0);
  let r = random() * total;
  for (const o of list) {
    r -= o.weight;
    if (r <= 0) return o;
  }
  return list[list.length - 1];
}

/** What to draw: `{ id, ...details }`. Avoids repeating `last` back to back. */
export function pickDoodle({ memory, now = new Date(), random = Math.random, last = null } = {}) {
  const personal = personalOptions(memory, now).filter((o) => o.id !== last);
  const game = personal.find((o) => o.id === "gameday");
  if (game && random() < GAMEDAY_CHANCE) return game;
  if (personal.length && random() < PERSONAL_CHANCE) return weighted(personal, random);
  const generic = GENERIC_DOODLES.filter((id) => id !== last);
  return { id: generic[Math.floor(random() * generic.length)] };
}

/** Strokes and color for a pick. Color is a token role: "accent" or "crimson". */
export function buildDoodle(pick, random = Math.random) {
  let strokes;
  switch (pick.id) {
    case "star":
      strokes = star();
      break;
    case "spiral":
      strokes = spiral();
      break;
    case "sun":
      strokes = sun();
      break;
    case "stick":
      strokes = stickFigure();
      break;
    case "tictactoe":
      strokes = ticTacToe(random);
      break;
    case "grade":
      strokes = gradeArrow(pick.letter);
      break;
    case "streak":
      strokes = tallies(pick.count);
      break;
    case "course":
      strokes = courseCard(pick.text);
      break;
    case "gameday":
      strokes = crimsonA();
      break;
    case "drill":
      strokes = tentFlag();
      break;
    default:
      strokes = star();
  }
  return { id: pick.id, strokes, color: pick.id === "gameday" ? "crimson" : "accent" };
}

function bounds(strokes) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes) {
    for (const [x, y] of s) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, w: Math.max(1e-6, x1 - x0), h: Math.max(1e-6, y1 - y0) };
}

/** Width / height of a doodle. */
export function doodleAspect(doodle) {
  const b = bounds(doodle.strokes);
  return b.w / b.h;
}

/** Box size for a doodle next to a body of `size` px: about the same area whatever the shape. */
export function doodleBox(doodle, size) {
  const side = Math.max(80, Math.min(190, size * 0.72));
  const a = Math.max(0.5, Math.min(3, doodleAspect(doodle)));
  return { w: Math.round(side * Math.sqrt(a)), h: Math.round(side / Math.sqrt(a)) };
}

/** Fit the strokes into `rect` (screen px), centered, aspect kept. Returns [[{ x, y }]]. */
export function layoutDoodle(doodle, rect, pad = 8) {
  const b = bounds(doodle.strokes);
  const w = Math.max(1, rect.width - pad * 2);
  const h = Math.max(1, rect.height - pad * 2);
  const k = Math.min(w / b.w, h / b.h);
  const ox = rect.left + pad + (w - b.w * k) / 2;
  const oy = rect.top + pad + (h - b.h * k) / 2;
  return doodle.strokes.map((s) => s.map(([x, y]) => ({ x: ox + (x - b.x0) * k, y: oy + (y - b.y0) * k })));
}

/** Total pen length in px (drawing only, not the lifts between strokes). */
export function inkLength(strokes) {
  let len = 0;
  for (const s of strokes) for (let i = 1; i < s.length; i += 1) len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  return len;
}
