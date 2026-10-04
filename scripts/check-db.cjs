// Upsert/prune self-check against a throwaway DB. better-sqlite3 is built for Electron, so run it
// with Electron: `npm run check:db`.
const path = require("path");
const os = require("os");
const fs = require("fs");
const assert = require("assert");
const { app } = require("electron");

app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "shdb-")));
const { getDb } = require("../electron/database.cjs");
const { saveFullCourse, getFullCourse } = require("../electron/dbHandlers.cjs");

try {
  const db = getDb();
  assert.strictEqual(db.prepare("SELECT 1"), db.prepare("SELECT 1"), "statement cache");
  const sessionCols = db.prepare("PRAGMA table_info(study_sessions)").all().map((c) => c.name);
  assert.ok(sessionCols.includes("exam_uuid"), "study_sessions.exam_uuid (migration 12)");

  const payload = {
    uuid: "c1",
    name: "Test",
    modules: [
      { uuid: "m1", title: "One", html: "<p>a</p>", content: [{ uuid: "ci1", term: "T", definition: "D" }, { uuid: "ci2", term: "U", definition: "E" }] },
      { uuid: "m2", title: "Two", html: "", content: [] },
    ],
    flashcards: [{ uuid: "f1", front: "Q", back: "A", moduleUuid: "m1" }, { uuid: "f2", front: "Q2", back: "A2" }],
    glossary: [{ uuid: "g1", term: "T", definition: "D", moduleUuid: "m1" }],
  };
  saveFullCourse(db, payload);
  const f1 = db.prepare("SELECT id FROM flashcards WHERE uuid = 'f1'").get().id;
  db.prepare("INSERT INTO mastery (flashcard_id, ease_factor, interval_days, repetitions) VALUES (?, 2.6, 3, 2)").run(f1);
  db.prepare("UPDATE modules SET updated_at = '2000-01-01' WHERE uuid = 'm1'").run();
  const m1Stamp = () => db.prepare("SELECT updated_at FROM modules WHERE uuid = 'm1'").get().updated_at;

  saveFullCourse(db, payload);
  assert.strictEqual(m1Stamp(), "2000-01-01", "unchanged module is not rewritten");

  saveFullCourse(db, {
    ...payload,
    modules: [{ ...payload.modules[0], title: "One!", content: [payload.modules[0].content[0]] }],
    flashcards: [payload.flashcards[0]],
  });
  const full = getFullCourse(db, "c1");
  assert.notStrictEqual(m1Stamp(), "2000-01-01", "changed module is rewritten");
  assert.deepStrictEqual(full.modules.map((m) => m.uuid), ["m1"]);
  assert.deepStrictEqual(full.modules[0].content.map((c) => c.uuid), ["ci1"]);
  assert.deepStrictEqual(full.flashcards.map((f) => f.uuid), ["f1"]);
  assert.strictEqual(full.flashcards[0].repetitions, 2, "mastery survives resave + prune");
  assert.strictEqual(full.glossary[0].module_uuid, "m1");

  saveFullCourse(db, { ...payload, modules: [], glossary: [...payload.glossary, { uuid: "g2", term: "T", definition: "D" }] });
  assert.strictEqual(getFullCourse(db, "c1").glossary.length, 1, "duplicate term under new uuid is skipped");

  db.close();
  process.stdout.write("check-db ok\n");
  app.exit(0);
} catch (err) {
  process.stderr.write(`${err.stack || err}\n`);
  app.exit(1);
}
