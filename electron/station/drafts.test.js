import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  isWritingWork,
  resolveDraftMode,
  isEligible,
  listEligible,
  hasEligibleDrafts,
  checkSpendCap,
  recordUsage,
  buildPrompt,
  loadStyleProfile,
  writeDraftFiles,
  saveDraftRow,
  prepOneDraft,
  DEFAULT_DRAFT_MODEL,
} = require("./drafts.cjs");

const NOW = new Date("2026-10-26T12:00:00-05:00");

function openFixture() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      course_code TEXT
    );
    CREATE TABLE assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      title TEXT NOT NULL,
      due_date TEXT,
      kind TEXT NOT NULL DEFAULT 'assignment',
      submitted INTEGER NOT NULL DEFAULT 0,
      score REAL,
      instructions TEXT,
      instructions_synced_at TEXT
    );
    CREATE TABLE station_drafts (
      id TEXT PRIMARY KEY,
      assignment_uuid TEXT NOT NULL,
      course_uuid TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      docx_path TEXT,
      md_path TEXT,
      model TEXT,
      tokens_in INTEGER,
      tokens_out INTEGER,
      check_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(assignment_uuid, mode)
    );
    CREATE TABLE station_ai_usage (
      day TEXT NOT NULL,
      model TEXT NOT NULL,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      est_cents INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(day, model)
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

function seedCourse(db, { uuid = "c1", name = "GBA 490", code = "GBA 490" } = {}) {
  return db.prepare("INSERT INTO courses (uuid, name, course_code) VALUES (?, ?, ?)").run(uuid, name, code)
    .lastInsertRowid;
}

function seedAssignment(db, courseId, overrides = {}) {
  const row = {
    uuid: overrides.uuid || "a1",
    course_id: courseId,
    title: overrides.title ?? "Case 4 write-up",
    due_date: overrides.due_date ?? "2026-10-28T23:59:00-05:00",
    kind: overrides.kind ?? "assignment",
    submitted: overrides.submitted ?? 0,
    score: Object.prototype.hasOwnProperty.call(overrides, "score") ? overrides.score : null,
    instructions: overrides.instructions ?? "Write a case analysis memo.",
  };
  db.prepare(
    `INSERT INTO assignments (uuid, course_id, title, due_date, kind, submitted, score, instructions)
     VALUES (@uuid, @course_id, @title, @due_date, @kind, @submitted, @score, @instructions)`,
  ).run(row);
  return row.uuid;
}

describe("isWritingWork", () => {
  it("matches writing keywords in title or instructions", () => {
    expect(isWritingWork("Case 4", "")).toBe(true);
    expect(isWritingWork("Homework 2", "Write a reflection on the reading")).toBe(true);
    expect(isWritingWork("Quiz 3", "multiple choice")).toBe(false);
    expect(isWritingWork("Discussion post", "")).toBe(true);
    expect(isWritingWork("Lab write up", "")).toBe(true);
  });
});

describe("resolveDraftMode", () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = openFixture();
  });
  afterEach(() => db?.close());

  it("defaults GBA 490 to outline when unset", () => {
    expect(resolveDraftMode(db, { uuid: "c1", course_code: "GBA 490", name: "Capstone" })).toBe(
      "outline",
    );
    expect(resolveDraftMode(db, { uuid: "c1", course_code: null, name: "GBA 490 Strategy" })).toBe(
      "outline",
    );
  });

  it("defaults other courses to off when unset", () => {
    expect(resolveDraftMode(db, { uuid: "c2", course_code: "OM 300", name: "Ops" })).toBe("off");
  });

  it("honors per-course setting", () => {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "station.draft_mode.c2",
      "rough_draft",
    );
    expect(resolveDraftMode(db, { uuid: "c2", course_code: "OM 300", name: "Ops" })).toBe(
      "rough_draft",
    );
    db.prepare("UPDATE settings SET value = ? WHERE key = ?").run("off", "station.draft_mode.c2");
    expect(resolveDraftMode(db, { uuid: "c2", course_code: "OM 300", name: "Ops" })).toBe("off");
  });
});

describe("eligibility matrix", () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = openFixture();
  });
  afterEach(() => db?.close());

  it("includes a GBA 490 case due within 72h", () => {
    const cid = seedCourse(db);
    seedAssignment(db, cid);
    const list = listEligible(db, NOW);
    expect(list).toHaveLength(1);
    expect(list[0].mode).toBe("outline");
    expect(hasEligibleDrafts(db, NOW)).toBe(true);
  });

  it("excludes quiz/exam kinds and non-writing titles", () => {
    const cid = seedCourse(db);
    seedAssignment(db, cid, { uuid: "q1", title: "Quiz 2", kind: "quiz" });
    seedAssignment(db, cid, {
      uuid: "h1",
      title: "Problem set 3",
      instructions: "solve the problems",
    });
    expect(listEligible(db, NOW)).toHaveLength(0);
  });

  it("excludes submitted, scored, past 72h, mode off, and existing draft", () => {
    const cid = seedCourse(db, { uuid: "c-off", name: "OM 300", code: "OM 300" });
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "station.draft_mode.c-off",
      "outline",
    );
    seedAssignment(db, cid, { uuid: "sub", title: "Essay 1", submitted: 1 });
    seedAssignment(db, cid, { uuid: "scored", title: "Essay 2", score: 90 });
    seedAssignment(db, cid, {
      uuid: "far",
      title: "Essay 3",
      due_date: "2026-11-10T23:59:00-05:00",
    });
    expect(listEligible(db, NOW).map((x) => x.uuid)).toEqual([]);

    const gba = seedCourse(db, { uuid: "gba", name: "GBA 490", code: "GBA 490" });
    seedAssignment(db, gba, { uuid: "dup", title: "Case 5 paper" });
    db.prepare(
      `INSERT INTO station_drafts (id, assignment_uuid, course_uuid, mode) VALUES ('d1','dup','gba','outline')`,
    ).run();
    expect(listEligible(db, NOW)).toHaveLength(0);

    // mode off on GBA
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "station.draft_mode.gba",
      "off",
    );
    db.prepare("DELETE FROM station_drafts").run();
    expect(listEligible(db, NOW)).toHaveLength(0);
  });

  it("isEligible mirrors list filters", () => {
    expect(
      isEligible(
        {
          title: "Case memo",
          kind: "assignment",
          due_date: "2026-10-27T12:00:00-05:00",
          submitted: 0,
          score: null,
          instructions: "",
        },
        { now: NOW, mode: "outline", hasDraft: false },
      ),
    ).toBe(true);
    expect(
      isEligible(
        {
          title: "Case memo",
          kind: "assignment",
          due_date: "2026-10-27T12:00:00-05:00",
          submitted: 0,
          score: null,
          instructions: "",
        },
        { now: NOW, mode: "off", hasDraft: false },
      ),
    ).toBe(false);
  });
});

describe("spend cap", () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = openFixture();
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "station.ai_cap_cents_per_day",
      "150",
    );
  });
  afterEach(() => db?.close());

  it("allows under cap and blocks at or over cap", () => {
    expect(checkSpendCap(db, NOW)).toMatchObject({ ok: true, todayCents: 0, capCents: 150 });
    recordUsage(db, {
      now: NOW,
      model: DEFAULT_DRAFT_MODEL,
      tokensIn: 1000,
      tokensOut: 1000,
      estCents: 150,
    });
    const blocked = checkSpendCap(db, NOW);
    expect(blocked.ok).toBe(false);
    expect(blocked.todayCents).toBeGreaterThanOrEqual(150);
  });
});

describe("prompt + files + prepOneDraft", () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  /** @type {string} */
  let tmp;
  beforeEach(() => {
    db = openFixture();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "station-drafts-"));
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "station.ai_cap_cents_per_day",
      "150",
    );
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "station.draft_model",
      DEFAULT_DRAFT_MODEL,
    );
  });
  afterEach(() => {
    db?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("loadStyleProfile concatenates style folder files", () => {
    const styleDir = path.join(tmp, "style");
    fs.mkdirSync(styleDir);
    fs.writeFileSync(path.join(styleDir, "rules.txt"), "plain words\n");
    fs.writeFileSync(path.join(styleDir, "sample.md"), "I liked the case.\n");
    expect(loadStyleProfile(styleDir)).toContain("plain words");
    expect(loadStyleProfile(styleDir)).toContain("I liked the case.");
  });

  it("buildPrompt includes mode instructions and assignment context", () => {
    const prompt = buildPrompt({
      mode: "outline",
      styleText: "no dashes",
      title: "Case 4",
      course: "GBA 490",
      instructions: "Analyze the case",
      attachmentText: "Exhibit 1 numbers",
      syllabusExcerpt: "Cases are 20%",
    });
    expect(prompt.system).toContain("no dashes");
    expect(prompt.userContent).toContain("Case 4");
    expect(prompt.userContent).toContain("Analyze the case");
    expect(prompt.userContent).toContain("Exhibit 1");
    expect(prompt.userContent.toLowerCase()).toMatch(/outline|section/);
  });

  it("writeDraftFiles lands md+docx under Nova Drafts/<Course>/", async () => {
    const docs = path.join(tmp, "Documents");
    const result = await writeDraftFiles({
      documentsDir: docs,
      course: "GBA 490",
      title: "Case 4",
      dueDate: "2026-10-28T23:59:00-05:00",
      markdown: "# Draft\n\nHello",
    });
    expect(result.mdPath).toContain(path.join("Nova Drafts", "GBA 490"));
    expect(result.docxPath.endsWith(".docx")).toBe(true);
    expect(fs.existsSync(result.mdPath)).toBe(true);
    expect(fs.existsSync(result.docxPath)).toBe(true);
    expect(path.basename(result.docxPath)).toMatch(/^2026-10-28 Case 4\.docx$/);
  });

  it("prepOneDraft routes draft_outline, lints, writes files and row", async () => {
    const cid = seedCourse(db);
    seedAssignment(db, cid, { uuid: "a-prep", title: "Case 4 paper" });
    const route = vi.fn(async (task, opts) => {
      expect(task).toBe("draft_outline");
      expect(opts.cacheSystem).toBe(true);
      expect(opts.system).toBeTruthy();
      expect(opts.userContent).toContain("Case 4");
      return {
        ok: true,
        text: "Section 1 — overview\nUse long-term data",
        tokensIn: 100,
        tokensOut: 50,
        model: DEFAULT_DRAFT_MODEL,
      };
    });
    const styleDir = path.join(tmp, "style");
    fs.mkdirSync(styleDir);
    fs.writeFileSync(path.join(styleDir, "rules.txt"), "plain everyday words");

    const result = await prepOneDraft({
      db,
      now: NOW,
      assignmentUuid: "a-prep",
      documentsDir: path.join(tmp, "Documents"),
      styleDir,
      route,
    });

    expect(result.status).toBe("ready");
    expect(route).toHaveBeenCalledTimes(1);
    expect(result.markdown).toContain("[CHECK]");
    expect(result.markdown).toContain("—");
    expect(fs.existsSync(result.mdPath)).toBe(true);
    expect(fs.existsSync(result.docxPath)).toBe(true);
    const row = db.prepare("SELECT * FROM station_drafts WHERE assignment_uuid = ?").get("a-prep");
    expect(row.mode).toBe("outline");
    expect(row.check_count).toBeGreaterThan(0);
    expect(row.model).toBe(DEFAULT_DRAFT_MODEL);
    const usage = db.prepare("SELECT * FROM station_ai_usage").all();
    expect(usage.length).toBe(1);
    expect(usage[0].tokens_in).toBe(100);
  });

  it("prepOneDraft maps deferred cap from route to needs_you", async () => {
    const cid = seedCourse(db);
    seedAssignment(db, cid, { uuid: "a-cap", title: "Case 9 essay" });
    const route = vi.fn(async () => ({ ok: false, deferred: true, reason: "cap" }));
    const result = await prepOneDraft({
      db,
      now: NOW,
      assignmentUuid: "a-cap",
      documentsDir: path.join(tmp, "Documents"),
      styleDir: path.join(tmp, "style"),
      route,
    });
    expect(route).toHaveBeenCalledTimes(1);
    expect(route.mock.calls[0][0]).toBe("draft_outline");
    expect(route.mock.calls[0][1].cacheSystem).toBe(true);
    expect(result.status).toBe("needs_you");
    expect(result.summary).toMatch(/AI cap/i);
    expect(db.prepare("SELECT COUNT(*) AS n FROM station_drafts").get().n).toBe(0);
  });

  it("prepOneDraft uses draft_rough for rough_draft mode", async () => {
    const cid = seedCourse(db, { uuid: "om", name: "OM 300", code: "OM 300" });
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "station.draft_mode.om",
      "rough_draft",
    );
    seedAssignment(db, cid, { uuid: "a-rough", title: "Reflection memo" });
    const route = vi.fn(async () => ({
      ok: true,
      text: "DRAFT — REVIEW BEFORE USE\n\nI think the case works.",
      tokensIn: 10,
      tokensOut: 10,
      model: "local",
    }));
    const result = await prepOneDraft({
      db,
      now: NOW,
      assignmentUuid: "a-rough",
      documentsDir: path.join(tmp, "Documents"),
      styleDir: path.join(tmp, "style"),
      route,
    });
    expect(route.mock.calls[0][0]).toBe("draft_rough");
    expect(result.status).toBe("ready");
    expect(result.mode).toBe("rough_draft");
  });

  it("saveDraftRow upserts by assignment+mode", () => {
    saveDraftRow(db, {
      id: "d1",
      assignmentUuid: "a1",
      courseUuid: "c1",
      mode: "outline",
      mdPath: "/a.md",
      docxPath: "/a.docx",
      model: "m",
      tokensIn: 1,
      tokensOut: 2,
      checkCount: 3,
    });
    saveDraftRow(db, {
      id: "d2",
      assignmentUuid: "a1",
      courseUuid: "c1",
      mode: "outline",
      mdPath: "/b.md",
      docxPath: "/b.docx",
      model: "m2",
      tokensIn: 9,
      tokensOut: 8,
      checkCount: 1,
    });
    const rows = db.prepare("SELECT * FROM station_drafts").all();
    expect(rows).toHaveLength(1);
    expect(rows[0].md_path).toBe("/b.md");
    expect(rows[0].check_count).toBe(1);
  });
});
