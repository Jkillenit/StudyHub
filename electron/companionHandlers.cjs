const { ipcMain } = require("electron");
const { getDb } = require("./database.cjs");
const { newUuid } = require("./dbHandlers.cjs");

let registered = false;

const KEY_RE = /^[a-z_][a-z0-9_.:-]{0,119}$/i;
const SOURCES = new Set(["derived", "told", "observed", "system"]);
/** Topics need this many reviews in the window before she calls one weak or strong. */
const TOPIC_MIN_REVIEWS = 8;
const TOPIC_WINDOW_DAYS = 30;

function parse(value) {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function memoryRows(db) {
  return db
    .prepare("SELECT key, value, source, muted, updated_at FROM companion_memory ORDER BY key")
    .all()
    .map((r) => ({ key: r.key, value: parse(r.value), source: r.source, muted: !!r.muted, updatedAt: r.updated_at }));
}

/**
 * One write. A muted derived/observed fact stays muted and keeps no value; anything the student
 * tells her directly ('told') unmutes it.
 */
function setMemory(db, { key, value, source = "derived" }) {
  if (!KEY_RE.test(String(key || ""))) return { success: false };
  const src = SOURCES.has(source) ? source : "derived";
  const existing = db.prepare("SELECT muted FROM companion_memory WHERE key = ?").get(key);
  if (existing?.muted && src !== "told") return { success: true, muted: true };
  const json = value === undefined ? null : JSON.stringify(value);
  if (json && json.length > 20000) return { success: false };
  db.prepare(`
    INSERT INTO companion_memory (uuid, key, value, source, muted, updated_at)
    VALUES (@uuid, @key, @value, @source, 0, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, source = excluded.source, muted = 0, updated_at = excluded.updated_at
  `).run({ uuid: newUuid("mem"), key, value: json, source: src });
  return { success: true };
}

/** Sessions, streak days and per-module review stats since `since` (ISO), for deriving facts. */
function studyFacts(db, since) {
  const from = since || "0000";
  const sessions = db
    .prepare(`
      SELECT s.kind, s.started_at, s.ended_at, s.cards_reviewed, s.correct, s.incorrect, s.best_combo,
             c.uuid AS course_uuid, c.name AS course_name, c.course_code
      FROM study_sessions s LEFT JOIN courses c ON c.id = s.course_id
      WHERE s.started_at >= ?
      ORDER BY s.started_at DESC LIMIT 400
    `)
    .all(from);
  const days = db
    .prepare(`
      SELECT DISTINCT date(started_at, 'localtime') AS day FROM study_sessions
      WHERE started_at >= ? ORDER BY day ASC
    `)
    .all(from)
    .map((r) => r.day);
  const totals = db
    .prepare("SELECT COUNT(*) AS sessions, COALESCE(SUM(cards_reviewed), 0) AS cards FROM study_sessions WHERE started_at >= ?")
    .get(from);
  const windowStart = new Date(Date.now() - TOPIC_WINDOW_DAYS * 86400000).toISOString().slice(0, 19).replace("T", " ");
  const reviewFrom = from > windowStart ? from.slice(0, 19).replace("T", " ") : windowStart;
  const topics = db
    .prepare(`
      SELECT m.uuid AS module_uuid, m.title, c.uuid AS course_uuid, c.name AS course_name, c.course_code,
             COUNT(*) AS reviews, SUM(CASE WHEN r.grade < 3 THEN 1 ELSE 0 END) AS misses
      FROM card_reviews r
      JOIN flashcards f ON f.id = r.flashcard_id
      JOIN modules m ON m.id = f.module_id
      JOIN courses c ON c.id = f.course_id
      WHERE r.reviewed_at >= ?
      GROUP BY m.id HAVING reviews >= ?
    `)
    .all(reviewFrom, TOPIC_MIN_REVIEWS);
  return { sessions, days, totals, topics };
}

function registerCompanionHandlers() {
  if (registered) return;
  registered = true;
  const db = getDb();

  ipcMain.handle("db:companion:memory:getAll", () => memoryRows(db));

  ipcMain.handle("db:companion:memory:set", (_, entry) => setMemory(db, entry || {}));

  ipcMain.handle("db:companion:memory:setMany", (_, entries) => {
    const list = Array.isArray(entries) ? entries.slice(0, 200) : [];
    db.transaction(() => list.forEach((e) => setMemory(db, e || {})))();
    return { success: true };
  });

  /** Deleting a fact mutes it: the value is dropped and she stops tracking it until unmuted. */
  ipcMain.handle("db:companion:memory:mute", (_, { key, muted }) => {
    if (!KEY_RE.test(String(key || ""))) return { success: false };
    if (!muted) {
      db.prepare("DELETE FROM companion_memory WHERE key = ? AND muted = 1").run(key);
      return { success: true };
    }
    db.prepare(`
      INSERT INTO companion_memory (uuid, key, value, source, muted, updated_at)
      VALUES (?, ?, NULL, 'system', 1, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = NULL, muted = 1, updated_at = datetime('now')
    `).run(newUuid("mem"), key);
    return { success: true };
  });

  /** Forget everything: wipes her memory and line history; she only learns from activity after now. */
  ipcMain.handle("db:companion:memory:forget", () => {
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("DELETE FROM companion_memory").run();
      db.prepare("DELETE FROM companion_said").run();
      setMemory(db, { key: "_since", value: now, source: "system" });
    })();
    return { success: true, since: now };
  });

  ipcMain.handle("db:companion:said:recent", (_, since) =>
    db.prepare("SELECT line_id, said_at FROM companion_said WHERE said_at >= ?").all(String(since || "0000"))
  );

  ipcMain.handle("db:companion:said:mark", (_, lineId) => {
    const id = String(lineId || "").slice(0, 120);
    if (!id) return { success: false };
    db.prepare(`
      INSERT INTO companion_said (line_id, said_at) VALUES (?, ?)
      ON CONFLICT(line_id) DO UPDATE SET said_at = excluded.said_at
    `).run(id, new Date().toISOString());
    db.prepare("DELETE FROM companion_said WHERE said_at < ?").run(new Date(Date.now() - 30 * 86400000).toISOString());
    return { success: true };
  });

  ipcMain.handle("db:companion:studyFacts", (_, args) => studyFacts(db, args?.since ? String(args.since) : null));
}

module.exports = { registerCompanionHandlers, studyFacts };
