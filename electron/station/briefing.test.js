import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const { validateBriefing } = require("./contracts.cjs");
const { buildBriefing, readFacts } = require("./briefing.cjs");

const NOW = new Date("2026-10-26T12:00:00-05:00");

function openFixture() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'user',
      course_code TEXT
    );
    CREATE TABLE assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      title TEXT NOT NULL,
      due_date TEXT,
      kind TEXT NOT NULL DEFAULT 'assignment',
      completed INTEGER DEFAULT 0,
      submitted INTEGER NOT NULL DEFAULT 0,
      score REAL,
      points_possible REAL,
      updated_at TEXT
    );
    CREATE TABLE announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      title TEXT NOT NULL,
      posted_at TEXT,
      read INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE bb_grade_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      bb_id TEXT NOT NULL,
      name TEXT NOT NULL,
      score REAL,
      points_possible REAL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(course_id, bb_id)
    );
    CREATE TABLE bb_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      bb_id TEXT NOT NULL,
      title TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(course_id, bb_id)
    );
    CREATE TABLE station_drafts (
      id TEXT PRIMARY KEY,
      assignment_uuid TEXT NOT NULL,
      course_uuid TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
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
    CREATE TABLE station_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      params TEXT NOT NULL DEFAULT '{}',
      progress INTEGER NOT NULL DEFAULT 0,
      summary TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

function seedCourse(db, { uuid = "c1", name = "OM 300", code = "OM 300" } = {}) {
  const r = db.prepare("INSERT INTO courses (uuid, name, course_code) VALUES (?, ?, ?)").run(uuid, name, code);
  return r.lastInsertRowid;
}

describe("buildBriefing", () => {
  it("returns an object that passes validateBriefing", () => {
    const briefing = buildBriefing(
      {
        kind: "morning",
        session: { blackboard: "ok", lastSyncAt: "2026-10-26T06:40:00-05:00" },
        newGrades: [],
        dueSoon: [],
        draftsReady: [],
        announcements: [],
        jobs: { ran: 0, failed: 0, failures: [] },
        aiSpend: { todayCents: 0, capCents: 150 },
      },
      NOW
    );
    expect(validateBriefing(briefing)).toEqual({ ok: true });
    expect(briefing.headline.length).toBeLessThanOrEqual(90);
  });

  it("puts sign_in first when the Blackboard session is expired", () => {
    const briefing = buildBriefing(
      {
        kind: "run",
        session: { blackboard: "expired", lastSyncAt: null },
        newGrades: [],
        dueSoon: [
          {
            course: "GBA 490",
            title: "Case 4",
            dueAt: "2026-10-26T18:00:00-05:00",
            state: "draft_ready",
            draftId: "d1",
            uuid: "a1",
          },
        ],
        draftsReady: [
          { draftId: "d1", course: "GBA 490", title: "Case 4", mode: "outline", checks: 2, assignmentUuid: "a1" },
        ],
        announcements: [],
        jobs: { ran: 1, failed: 0, failures: [] },
        aiSpend: { todayCents: 10, capCents: 150 },
        studyItems: [{ course: "OM 300", title: "Quiz 5", uuid: "a2", dueAt: "2026-10-27T19:00:00-05:00" }],
      },
      NOW
    );
    expect(briefing.needsYou[0]).toMatchObject({ kind: "sign_in" });
    expect(briefing.needsYou.map((n) => n.kind)).toEqual([
      "sign_in",
      "submit_yourself",
      "review_draft",
      "study",
    ]);
  });

  it("orders needsYou: sign_in, submit_yourself (<24h), review_draft, study", () => {
    const briefing = buildBriefing(
      {
        kind: "on_demand",
        session: { blackboard: "ok", lastSyncAt: "2026-10-26T11:00:00-05:00" },
        newGrades: [],
        dueSoon: [
          {
            course: "GBA 490",
            title: "Case 4",
            dueAt: "2026-10-26T20:00:00-05:00",
            state: "not_started",
            draftId: null,
            uuid: "a1",
          },
          {
            course: "OM 300",
            title: "Homework 3",
            dueAt: "2026-10-28T12:00:00-05:00",
            state: "not_started",
            draftId: null,
            uuid: "a3",
          },
        ],
        draftsReady: [
          { draftId: "d1", course: "GBA 490", title: "Case 5", mode: "outline", checks: 1, assignmentUuid: "a9" },
        ],
        announcements: [],
        jobs: { ran: 0, failed: 0, failures: [] },
        aiSpend: { todayCents: 0, capCents: 150 },
        studyItems: [{ course: "OM 300", title: "Exam 2", uuid: "a2", dueAt: "2026-10-30T09:00:00-05:00" }],
      },
      NOW
    );
    expect(briefing.needsYou.map((n) => n.kind)).toEqual([
      "submit_yourself",
      "review_draft",
      "study",
    ]);
    expect(briefing.needsYou.find((n) => n.kind === "submit_yourself").ref).toBe("a1");
  });

  it("excludes submitted items from dueSoon and keeps headline short", () => {
    const briefing = buildBriefing(
      {
        kind: "evening",
        session: { blackboard: "ok", lastSyncAt: null },
        newGrades: [
          { course: "GBA 490", title: "Case 3", score: 88, pointsPossible: 100, changed: false },
          { course: "OM 300", title: "Quiz 4", score: 9, pointsPossible: 10, changed: true },
        ],
        dueSoon: [
          {
            course: "OM 300",
            title: "Quiz 5",
            dueAt: "2026-10-26T19:00:00-05:00",
            state: "not_started",
            draftId: null,
            uuid: "q5",
          },
        ],
        draftsReady: [
          { draftId: "d1", course: "GBA 490", title: "Case 4", mode: "outline", checks: 3, assignmentUuid: "c4" },
        ],
        announcements: [],
        jobs: { ran: 4, failed: 0, failures: [] },
        aiSpend: { todayCents: 23, capCents: 150 },
      },
      NOW
    );
    expect(briefing.dueSoon.every((d) => d.state !== "submitted")).toBe(true);
    expect(briefing.headline.length).toBeLessThanOrEqual(90);
    expect(briefing.headline.length).toBeGreaterThan(0);
    expect(validateBriefing(briefing).ok).toBe(true);
  });
});

describe("readFacts + buildBriefing (fixture DB)", () => {
  /** @type {import('better-sqlite3').Database} */
  let db;

  beforeEach(() => {
    db = openFixture();
  });

  afterEach(() => {
    db.close();
  });

  it("expired session surfaces sign_in first after buildBriefing", () => {
    const courseId = seedCourse(db, { name: "GBA 490", code: "GBA 490" });
    db.prepare(
      "INSERT INTO assignments (uuid, course_id, title, due_date, kind, submitted) VALUES (?, ?, ?, ?, ?, 0)"
    ).run("a1", courseId, "Case 4", "2026-10-26T18:00:00-05:00", "assignment");
    db.prepare(
      "INSERT INTO station_drafts (id, assignment_uuid, course_uuid, mode, status, check_count) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("d1", "a1", "c1", "outline", "ready", 2);
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("station.bb_session", "expired");
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("station.ai_cap_cents_per_day", "150");

    const facts = readFacts(db, NOW);
    const briefing = buildBriefing(facts, NOW);
    expect(validateBriefing(briefing).ok).toBe(true);
    expect(briefing.session.blackboard).toBe("expired");
    expect(briefing.needsYou[0].kind).toBe("sign_in");
    expect(briefing.headline.length).toBeLessThanOrEqual(90);
  });

  it("excludes submitted assignments from dueSoon", () => {
    const courseId = seedCourse(db);
    db.prepare(
      "INSERT INTO assignments (uuid, course_id, title, due_date, kind, submitted) VALUES (?, ?, ?, ?, ?, 1)"
    ).run("done", courseId, "Submitted quiz", "2026-10-26T18:00:00-05:00", "quiz");
    db.prepare(
      "INSERT INTO assignments (uuid, course_id, title, due_date, kind, submitted) VALUES (?, ?, ?, ?, ?, 0)"
    ).run("open", courseId, "Open quiz", "2026-10-26T20:00:00-05:00", "quiz");
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("station.bb_session", "ok");

    const facts = readFacts(db, NOW);
    expect(facts.dueSoon.map((d) => d.title)).toEqual(["Open quiz"]);
    expect(facts.dueSoon.every((d) => d.state !== "submitted")).toBe(true);

    const briefing = buildBriefing(facts, NOW);
    expect(briefing.dueSoon.map((d) => d.title)).toEqual(["Open quiz"]);
    expect(briefing.headline.length).toBeLessThanOrEqual(90);
    expect(validateBriefing(briefing).ok).toBe(true);
  });

  it("ranks open work by due time and marks draft_ready state", () => {
    const om = seedCourse(db, { uuid: "om", name: "OM 300", code: "OM 300" });
    const gba = seedCourse(db, { uuid: "gba", name: "GBA 490", code: "GBA 490" });
    db.prepare(
      "INSERT INTO assignments (uuid, course_id, title, due_date, kind, submitted) VALUES (?, ?, ?, ?, ?, 0)"
    ).run("later", om, "Homework", "2026-10-28T12:00:00-05:00", "assignment");
    db.prepare(
      "INSERT INTO assignments (uuid, course_id, title, due_date, kind, submitted) VALUES (?, ?, ?, ?, ?, 0)"
    ).run("soon", gba, "Case 4", "2026-10-26T18:00:00-05:00", "assignment");
    db.prepare(
      "INSERT INTO station_drafts (id, assignment_uuid, course_uuid, mode, status, check_count) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("d1", "soon", "gba", "outline", "ready", 3);
    db.prepare(
      "INSERT INTO bb_grade_items (course_id, bb_id, name, score, points_possible, synced_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(gba, "g1", "Case 3", 88, 100, "2026-10-26T08:00:00-05:00");
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("station.bb_session", "ok");
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "station.last_sync_at",
      "2026-10-26T11:30:00-05:00"
    );
    db.prepare("INSERT INTO station_ai_usage (day, model, est_cents) VALUES (?, ?, ?)").run(
      "2026-10-26",
      "claude-sonnet-5-5",
      23
    );

    const facts = readFacts(db, NOW);
    expect(facts.dueSoon.map((d) => d.title)).toEqual(["Case 4", "Homework"]);
    expect(facts.dueSoon[0].state).toBe("draft_ready");
    expect(facts.dueSoon[0].draftId).toBe("d1");
    expect(facts.newGrades).toEqual([
      { course: "GBA 490", title: "Case 3", score: 88, pointsPossible: 100, changed: false },
    ]);
    expect(facts.draftsReady[0]).toMatchObject({ draftId: "d1", checks: 3, mode: "outline" });
    expect(facts.aiSpend).toEqual({ todayCents: 23, capCents: 150 });
    expect(facts.session).toEqual({ blackboard: "ok", lastSyncAt: "2026-10-26T11:30:00-05:00" });

    const briefing = buildBriefing({ ...facts, kind: "run" }, NOW);
    expect(validateBriefing(briefing).ok).toBe(true);
    expect(briefing.headline.length).toBeLessThanOrEqual(90);
  });
});
