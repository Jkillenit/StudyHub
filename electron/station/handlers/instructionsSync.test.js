import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createInstructionsSyncHandler } = require("./instructionsSync.cjs");
const { fetchAssignmentInstructions } = require("../../bbSync.cjs");

const NOW = new Date("2026-10-26T12:00:00.000Z");

function openFixture() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      bb_course_id TEXT
    );
    CREATE TABLE assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      bb_id TEXT,
      title TEXT NOT NULL,
      due_date TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      instructions TEXT,
      instructions_synced_at TEXT
    );
  `);
  return db;
}

function seedDueAssignment(db, overrides = {}) {
  const course = db
    .prepare("INSERT INTO courses (uuid, name, bb_course_id) VALUES (?, ?, ?)")
    .run(overrides.courseUuid || "c-gba", "GBA 490", overrides.bbCourseId || "_100_1");
  const due = overrides.dueDate || "2026-10-30T23:59:00.000Z";
  db.prepare(
    `INSERT INTO assignments (uuid, course_id, bb_id, title, due_date, source)
     VALUES (?, ?, ?, ?, ?, 'blackboard')`,
  ).run(
    overrides.uuid || "asg-1",
    course.lastInsertRowid,
    overrides.bbId || "_col_1",
    overrides.title || "Case 4",
    due,
  );
}

function ctx() {
  const progress = [];
  const logs = [];
  return {
    params: {},
    progress: (pct, msg) => progress.push({ pct, msg }),
    log: (level, msg, data) => logs.push({ level, msg, data }),
    signal: { aborted: false },
    _progress: progress,
    _logs: logs,
  };
}

describe("fetchAssignmentInstructions (GET helper)", () => {
  it("builds instructions from column description, content body, and attachment text", async () => {
    const calls = [];
    const getJson = async (pathname) => {
      calls.push({ method: "GET", pathname });
      if (pathname.includes("/gradebook/columns/")) {
        return {
          id: "_col_1",
          name: "Case 4",
          description: "<p>Read the case.</p>",
          contentId: "_cnt_9",
        };
      }
      if (pathname.includes("/contents/_cnt_9/attachments") && !pathname.includes("/download")) {
        return {
          results: [{ id: "att1", fileName: "brief.pdf" }],
        };
      }
      if (pathname.includes("/contents/_cnt_9")) {
        return {
          id: "_cnt_9",
          title: "Case 4",
          body: "<p>Submit a 2-page memo.</p>",
        };
      }
      throw new Error(`unexpected path ${pathname}`);
    };
    const getBuffer = async (pathname) => {
      calls.push({ method: "GET", pathname });
      expect(pathname).toContain("/attachments/att1/download");
      return Buffer.from("%PDF-fake");
    };
    const extractBufferText = async () => "Attachment body text";

    const result = await fetchAssignmentInstructions("_100_1", "_col_1", {
      getJson,
      getBuffer,
      extractBufferText,
      sleep: async () => {},
    });

    expect(result.contentId).toBe("_cnt_9");
    expect(result.instructions).toContain("Submit a 2-page memo");
    expect(result.instructions).toContain("Attachment body text");
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].fileName).toBe("brief.pdf");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("guard: helper only issues GET including attachment download", async () => {
    const calls = [];
    const getJson = async (pathname) => {
      calls.push({ method: "GET", pathname });
      if (pathname.includes("/gradebook/columns/")) {
        return { id: "_col_1", description: "Do the thing", contentId: "_cnt_9" };
      }
      if (pathname.includes("/attachments") && !pathname.includes("/download")) {
        return { results: [{ id: "att1", fileName: "brief.pdf" }] };
      }
      if (pathname.includes("/contents/_cnt_9")) {
        return { id: "_cnt_9", body: "<p>Body</p>" };
      }
      throw new Error(`unexpected ${pathname}`);
    };
    const getBuffer = async (pathname) => {
      calls.push({ method: "GET", pathname });
      return Buffer.from("x");
    };

    await fetchAssignmentInstructions("_100_1", "_col_1", {
      getJson,
      getBuffer,
      extractBufferText: async () => "ok",
      sleep: async () => {},
    });

    expect(calls.some((c) => c.pathname.includes("/download"))).toBe(true);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("guard: exported helper source never sets a non-GET method", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../bbSync.cjs"), "utf8");
    const start = src.indexOf("async function fetchAssignmentInstructions");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\nmodule.exports", start + 1);
    const body = end === -1 ? src.slice(start) : src.slice(start, end);
    expect(body).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/i);
    expect(body).not.toMatch(/\b(POST|PUT|PATCH|DELETE)\b/);
  });
});

describe("instructions_sync handler", () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  /** @type {string} */
  let tmpDir;

  beforeEach(() => {
    db = openFixture();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sh-instr-"));
  });

  afterEach(() => {
    db?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("syncs instructions for assignments due within 7 days and stores attachments", async () => {
    seedDueAssignment(db);
    seedDueAssignment(db, {
      uuid: "asg-far",
      bbId: "_col_far",
      title: "Far away",
      dueDate: "2026-12-01T00:00:00.000Z",
      courseUuid: "c2",
      bbCourseId: "_200_1",
    });

    const fetchInstructions = async (bbCourseId, columnId) => {
      expect(bbCourseId).toBe("_100_1");
      expect(columnId).toBe("_col_1");
      return {
        instructions: "Memo please\n\n--- Attachment: brief.pdf ---\nPages of case",
        contentId: "_cnt_9",
        attachments: [
          { id: "att1", fileName: "brief.pdf", buffer: Buffer.from("pdf-bytes"), text: "Pages of case" },
        ],
      };
    };

    const handler = createInstructionsSyncHandler({
      db,
      fetchInstructions,
      appDataPath: tmpDir,
      now: () => NOW,
    });

    const c = ctx();
    const result = await handler(c);

    const row = db.prepare("SELECT instructions, instructions_synced_at FROM assignments WHERE uuid = ?").get("asg-1");
    expect(row.instructions).toContain("Memo please");
    expect(row.instructions_synced_at).toBeTruthy();

    const far = db.prepare("SELECT instructions FROM assignments WHERE uuid = ?").get("asg-far");
    expect(far.instructions).toBeNull();

    const saved = path.join(tmpDir, "station", "instructions", "asg-1", "brief.pdf");
    expect(fs.existsSync(saved)).toBe(true);
    expect(fs.readFileSync(saved)).toEqual(Buffer.from("pdf-bytes"));

    expect(result.summary).toMatch(/1/);
    expect(result.status).toBeUndefined();
  });

  it("returns needs_you when Blackboard session is expired", async () => {
    seedDueAssignment(db);
    const err = Object.assign(new Error("HTTP 401"), { status: 401 });
    const handler = createInstructionsSyncHandler({
      db,
      fetchInstructions: async () => {
        throw err;
      },
      appDataPath: tmpDir,
      now: () => NOW,
    });

    const result = await handler(ctx());
    expect(result.status).toBe("needs_you");
    expect(result.summary).toMatch(/sign/i);
  });

  it("skips manual assignments without bb_id", async () => {
    const course = db.prepare("INSERT INTO courses (uuid, name, bb_course_id) VALUES ('c','X','_1_1')").run();
    db.prepare(
      `INSERT INTO assignments (uuid, course_id, bb_id, title, due_date, source)
       VALUES ('manual-1', ?, NULL, 'Local', '2026-10-28T00:00:00.000Z', 'manual')`,
    ).run(course.lastInsertRowid);

    let called = 0;
    const handler = createInstructionsSyncHandler({
      db,
      fetchInstructions: async () => {
        called += 1;
        return { instructions: "", contentId: null, attachments: [] };
      },
      appDataPath: tmpDir,
      now: () => NOW,
    });

    const result = await handler(ctx());
    expect(called).toBe(0);
    expect(result.summary).toMatch(/0/);
  });

  it("continues when one assignment fetch fails with a non-auth error", async () => {
    seedDueAssignment(db, { uuid: "asg-bad", bbId: "_col_bad", title: "Bad" });
    seedDueAssignment(db, {
      uuid: "asg-ok",
      bbId: "_col_ok",
      title: "Ok",
      courseUuid: "c-ok",
      bbCourseId: "_100_1",
    });

    const handler = createInstructionsSyncHandler({
      db,
      fetchInstructions: async (_bb, columnId) => {
        if (columnId === "_col_bad") throw new Error("HTTP 500");
        return { instructions: "ok text", contentId: null, attachments: [] };
      },
      appDataPath: tmpDir,
      now: () => NOW,
    });

    const result = await handler(ctx());
    expect(db.prepare("SELECT instructions FROM assignments WHERE uuid = ?").get("asg-ok").instructions).toBe(
      "ok text",
    );
    expect(db.prepare("SELECT instructions FROM assignments WHERE uuid = ?").get("asg-bad").instructions).toBeNull();
    expect(result.summary).toMatch(/1 of 2/);
  });
});
