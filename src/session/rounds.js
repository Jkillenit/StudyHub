export const MARKS_PER_ROUND = 5;
const KEY = "session.rounds";

export function roundInfo(marks) {
  return { round: Math.floor(marks / MARKS_PER_ROUND) + 1, inRound: marks % MARKS_PER_ROUND };
}

export function addMark(marks) {
  const next = marks + 1;
  const info = roundInfo(next);
  return { marks: next, ...info, closedRound: info.inRound === 0 ? info.round - 1 : null };
}

let memoryMarks = 0; // browser build without the Electron bridge

async function readMarks() {
  const settings = window.studyHub?.db?.settings;
  if (!settings?.get) return memoryMarks;
  try {
    return Math.max(0, Number(JSON.parse((await settings.get(KEY)) || "0")) || 0);
  } catch {
    return 0;
  }
}

export async function loadRounds() {
  const marks = await readMarks();
  return { marks, ...roundInfo(marks) };
}

export async function recordMark() {
  const result = addMark(await readMarks());
  memoryMarks = result.marks;
  try {
    await window.studyHub?.db?.settings?.set?.({ key: KEY, value: JSON.stringify(result.marks) });
  } catch {
    /* the mark still shows this session */
  }
  return result;
}
