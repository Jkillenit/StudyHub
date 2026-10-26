/**
 * Station draft prep (BRIEFING §6). Review copies only — never submit/post.
 * No Electron imports. Model calls go through injected `route` (S0.4 / §3.6) only.
 */
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { assignmentKind } = require("../assignmentKind.cjs");
const { styleLint, countChecks } = require("./styleLint.cjs");

const DEFAULT_DRAFT_MODEL = "claude-sonnet-5-5";
const DUE_WINDOW_MS = 72 * 3600000;
const WRITING_RE =
  /\b(case|paper|essay|memo|reflection|discussion|write\s?up|response|report)\b/i;

const PROMPTS_DIR = path.join(__dirname, "prompts");

/** @param {Date|string|number} now */
function asDate(now) {
  const d = now instanceof Date ? now : new Date(now);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

/** Local calendar day YYYY-MM-DD. */
function localDayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setting(db, key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value != null ? String(row.value) : fallback;
}

function isGba490(course) {
  const code = String(course?.course_code || "").toUpperCase();
  const name = String(course?.name || "").toUpperCase();
  return /\bGBA\s*490\b/.test(code) || /\bGBA\s*490\b/.test(name);
}

/**
 * @param {string} title
 * @param {string} [instructions]
 */
function isWritingWork(title, instructions = "") {
  return WRITING_RE.test(String(title || "")) || WRITING_RE.test(String(instructions || ""));
}

/**
 * Per-course mode. Unset: GBA 490 → outline, else off.
 * @param {import('better-sqlite3').Database} db
 * @param {{ uuid: string, course_code?: string|null, name?: string|null }} course
 * @returns {"off"|"outline"|"rough_draft"}
 */
function resolveDraftMode(db, course) {
  const raw = setting(db, `station.draft_mode.${course.uuid}`, null);
  if (raw === "off" || raw === "outline" || raw === "rough_draft") return raw;
  if (isGba490(course)) return "outline";
  return "off";
}

/**
 * @param {object} assignment
 * @param {{ now: Date|string|number, mode: string, hasDraft: boolean }} opts
 */
function isEligible(assignment, opts) {
  const mode = opts.mode;
  if (!mode || mode === "off") return false;
  if (opts.hasDraft) return false;
  const title = assignment.title || "";
  if (assignmentKind(title) !== "assignment") return false;
  if (!isWritingWork(title, assignment.instructions || "")) return false;
  if (Number(assignment.submitted) === 1) return false;
  if (assignment.score != null && assignment.score !== "") return false;
  const dueMs = Date.parse(assignment.due_date);
  if (!Number.isFinite(dueMs)) return false;
  const nowMs = asDate(opts.now).getTime();
  const delta = dueMs - nowMs;
  if (delta < 0 || delta > DUE_WINDOW_MS) return false;
  return true;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {Date|string|number} now
 */
function listEligible(db, now = new Date()) {
  const rows = db
    .prepare(
      `SELECT a.uuid, a.title, a.due_date, a.kind, a.submitted, a.score, a.instructions,
              c.uuid AS course_uuid, c.name AS course_name, c.course_code
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       WHERE COALESCE(a.submitted, 0) = 0 AND a.score IS NULL`,
    )
    .all();

  const out = [];
  for (const row of rows) {
    const course = {
      uuid: row.course_uuid,
      name: row.course_name,
      course_code: row.course_code,
    };
    const mode = resolveDraftMode(db, course);
    const hasDraft =
      db
        .prepare(
          `SELECT 1 AS ok FROM station_drafts WHERE assignment_uuid = ? AND mode = ? LIMIT 1`,
        )
        .get(row.uuid, mode) != null;
    if (
      isEligible(row, { now, mode, hasDraft })
    ) {
      out.push({
        uuid: row.uuid,
        title: row.title,
        due_date: row.due_date,
        kind: row.kind,
        instructions: row.instructions,
        course_uuid: row.course_uuid,
        course_name: row.course_name,
        course_code: row.course_code,
        mode,
      });
    }
  }
  return out;
}

function hasEligibleDrafts(db, now = new Date()) {
  return listEligible(db, now).length > 0;
}

/**
 * Rough token pricing in integer cents (Sonnet vs Haiku).
 * @param {string} model
 * @param {number} tokensIn
 * @param {number} tokensOut
 */
function estimateCents(model, tokensIn, tokensOut) {
  const haiku = /haiku/i.test(String(model || ""));
  const inRate = haiku ? 100 : 300; // cents per MTok
  const outRate = haiku ? 500 : 1500;
  return Math.ceil((tokensIn * inRate + tokensOut * outRate) / 1_000_000) || 0;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {Date|string|number} now
 */
function checkSpendCap(db, now = new Date()) {
  const capCents = Number(setting(db, "station.ai_cap_cents_per_day", "150")) || 150;
  const day = localDayKey(asDate(now));
  const row = db
    .prepare(`SELECT COALESCE(SUM(est_cents), 0) AS cents FROM station_ai_usage WHERE day = ?`)
    .get(day);
  const todayCents = Number(row?.cents) || 0;
  return { ok: todayCents < capCents, todayCents, capCents, day };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ now?: Date|string|number, model: string, tokensIn: number, tokensOut: number, estCents?: number }} usage
 */
function recordUsage(db, usage) {
  const day = localDayKey(asDate(usage.now || new Date()));
  const model = usage.model || DEFAULT_DRAFT_MODEL;
  const tokensIn = Number(usage.tokensIn) || 0;
  const tokensOut = Number(usage.tokensOut) || 0;
  const estCents =
    usage.estCents != null ? Number(usage.estCents) : estimateCents(model, tokensIn, tokensOut);
  db.prepare(
    `INSERT INTO station_ai_usage (day, model, tokens_in, tokens_out, est_cents)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(day, model) DO UPDATE SET
       tokens_in = tokens_in + excluded.tokens_in,
       tokens_out = tokens_out + excluded.tokens_out,
       est_cents = est_cents + excluded.est_cents`,
  ).run(day, model, tokensIn, tokensOut, estCents);
}

function readPromptFile(mode) {
  const file = mode === "rough_draft" ? "rough_draft.md" : "outline.md";
  return fs.readFileSync(path.join(PROMPTS_DIR, file), "utf8").trim();
}

/**
 * @param {string} styleDir
 */
function loadStyleProfile(styleDir) {
  if (!styleDir || !fs.existsSync(styleDir)) return "";
  const names = fs
    .readdirSync(styleDir)
    .filter((n) => /\.(txt|md)$/i.test(n))
    .sort();
  const chunks = [];
  for (const name of names) {
    try {
      chunks.push(fs.readFileSync(path.join(styleDir, name), "utf8").trim());
    } catch {
      /* skip unreadable */
    }
  }
  return chunks.filter(Boolean).join("\n\n");
}

/**
 * @param {object} input
 */
function buildPrompt(input) {
  const mode = input.mode === "rough_draft" ? "rough_draft" : "outline";
  const modeBlock = readPromptFile(mode);
  const styleText = String(input.styleText || "").trim();
  const system = [
    modeBlock,
    styleText ? `Style profile (follow closely):\n${styleText}` : "Style profile: plain everyday words, no hyphens or dashes.",
  ].join("\n\n");

  const parts = [
    `Course: ${input.course || ""}`,
    `Assignment: ${input.title || ""}`,
    `Mode: ${mode}`,
    "",
    "Instructions:",
    String(input.instructions || "(none)").trim() || "(none)",
  ];
  if (input.attachmentText) {
    parts.push("", "Attachment text:", String(input.attachmentText).trim());
  }
  if (input.syllabusExcerpt) {
    parts.push("", "Syllabus excerpt:", String(input.syllabusExcerpt).trim());
  }
  parts.push("", "Produce the review copy now.");
  return { system, userContent: parts.join("\n"), mode };
}

function sanitizeFilePart(s) {
  return String(s || "Untitled")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Untitled";
}

function dueDayStamp(dueDate) {
  const m = String(dueDate || "").match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(dueDate);
  if (!Number.isFinite(d.getTime())) {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  }
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** @param {"outline"|"rough_draft"} mode */
function routeTaskForMode(mode) {
  return mode === "rough_draft" ? "draft_rough" : "draft_outline";
}

/**
 * Write markdown + docx under Documents/Nova Drafts/<Course>/.
 * @param {{ documentsDir: string, course: string, title: string, dueDate: string, markdown: string }} opts
 */
async function writeDraftFiles(opts) {
  const courseDir = path.join(
    opts.documentsDir,
    "Nova Drafts",
    sanitizeFilePart(opts.course),
  );
  fs.mkdirSync(courseDir, { recursive: true });
  const base = `${dueDayStamp(opts.dueDate)} ${sanitizeFilePart(opts.title)}`;
  const mdPath = path.join(courseDir, `${base}.md`);
  const docxPath = path.join(courseDir, `${base}.docx`);
  fs.writeFileSync(mdPath, opts.markdown, "utf8");

  const { Document, Packer, Paragraph, TextRun } = require("docx");
  const paragraphs = String(opts.markdown)
    .split(/\n/)
    .map(
      (line) =>
        new Paragraph({
          children: [new TextRun(line)],
        }),
    );
  const doc = new Document({
    sections: [{ children: paragraphs.length ? paragraphs : [new Paragraph({ children: [] })] }],
  });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buf);
  return { mdPath, docxPath };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {object} row
 */
function saveDraftRow(db, row) {
  const id = row.id || randomUUID();
  db.prepare(
    `INSERT INTO station_drafts
      (id, assignment_uuid, course_uuid, mode, status, docx_path, md_path, model, tokens_in, tokens_out, check_count)
     VALUES
      (@id, @assignment_uuid, @course_uuid, @mode, 'ready', @docx_path, @md_path, @model, @tokens_in, @tokens_out, @check_count)
     ON CONFLICT(assignment_uuid, mode) DO UPDATE SET
       id = excluded.id,
       status = 'ready',
       docx_path = excluded.docx_path,
       md_path = excluded.md_path,
       model = excluded.model,
       tokens_in = excluded.tokens_in,
       tokens_out = excluded.tokens_out,
       check_count = excluded.check_count,
       created_at = datetime('now')`,
  ).run({
    id,
    assignment_uuid: row.assignmentUuid,
    course_uuid: row.courseUuid,
    mode: row.mode,
    docx_path: row.docxPath || null,
    md_path: row.mdPath || null,
    model: row.model || null,
    tokens_in: row.tokensIn ?? null,
    tokens_out: row.tokensOut ?? null,
    check_count: row.checkCount ?? 0,
  });
  return id;
}

/**
 * Prep one eligible assignment via injected model `route` (never call providers here).
 *
 * @param {object} deps
 * @param {(task: "draft_outline"|"draft_rough", opts: object) => Promise<object>} deps.route
 *   Success: `{ ok: true, text, model?, tokensIn?, tokensOut? }`
 *   Cap: `{ ok: false, deferred: true, reason: "cap" }` → needs_you
 */
async function prepOneDraft(deps) {
  const {
    db,
    now = new Date(),
    assignmentUuid,
    documentsDir,
    styleDir,
    route,
    syllabusExcerpt = "",
    attachmentText = "",
  } = deps;

  const row = db
    .prepare(
      `SELECT a.uuid, a.title, a.due_date, a.kind, a.submitted, a.score, a.instructions,
              c.uuid AS course_uuid, c.name AS course_name, c.course_code
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       WHERE a.uuid = ?`,
    )
    .get(assignmentUuid);
  if (!row) {
    return { status: "failed", summary: "assignment not found", draftId: null };
  }

  const course = {
    uuid: row.course_uuid,
    name: row.course_name,
    course_code: row.course_code,
  };
  const mode = resolveDraftMode(db, course);
  const hasDraft =
    db
      .prepare(`SELECT 1 AS ok FROM station_drafts WHERE assignment_uuid = ? AND mode = ? LIMIT 1`)
      .get(row.uuid, mode) != null;
  if (!isEligible(row, { now, mode, hasDraft })) {
    return { status: "skipped", summary: "not eligible", draftId: null };
  }

  const styleText = loadStyleProfile(styleDir);
  const courseLabel =
    (row.course_code && String(row.course_code).trim()) || row.course_name || "Course";
  const prompt = buildPrompt({
    mode,
    styleText,
    title: row.title,
    course: courseLabel,
    instructions: row.instructions || "",
    attachmentText,
    syllabusExcerpt,
  });

  if (typeof route !== "function") {
    return { status: "needs_you", summary: "model router missing", draftId: null };
  }

  const task = routeTaskForMode(mode);
  const routed = await route(task, {
    cacheSystem: true,
    system: prompt.system,
    userContent: prompt.userContent,
    maxTokens: 8192,
  });

  if (routed && routed.ok === false && routed.deferred) {
    const reason = routed.reason === "cap" ? "AI cap reached" : String(routed.reason || "deferred");
    return { status: "needs_you", summary: reason, draftId: null, deferred: true, reason: routed.reason };
  }
  if (!routed || routed.ok === false) {
    return {
      status: "failed",
      summary: String(routed?.error || routed?.reason || "route failed"),
      draftId: null,
    };
  }

  const text = String(routed.text ?? "");
  const tokensIn = Number(routed.tokensIn) || 0;
  const tokensOut = Number(routed.tokensOut) || 0;
  // Model label for the draft row only — spend is recorded inside route() (S0.4).
  const model =
    routed.model ||
    setting(db, "station.cloud_model", DEFAULT_DRAFT_MODEL) ||
    DEFAULT_DRAFT_MODEL;

  let markdown = styleLint(text || "");
  if (mode === "rough_draft" && !/^DRAFT/i.test(markdown.trim())) {
    markdown = `DRAFT — REVIEW BEFORE USE\n\n${markdown}`;
    markdown = styleLint(markdown);
  }

  const files = await writeDraftFiles({
    documentsDir,
    course: courseLabel,
    title: row.title,
    dueDate: row.due_date,
    markdown,
  });

  const checkCount = countChecks(markdown);
  const draftId = saveDraftRow(db, {
    assignmentUuid: row.uuid,
    courseUuid: row.course_uuid,
    mode,
    mdPath: files.mdPath,
    docxPath: files.docxPath,
    model,
    tokensIn,
    tokensOut,
    checkCount,
  });

  return {
    status: "ready",
    summary: `${courseLabel} ${row.title} (${mode})`,
    draftId,
    mode,
    markdown,
    mdPath: files.mdPath,
    docxPath: files.docxPath,
    checkCount,
    course: courseLabel,
    title: row.title,
  };
}

module.exports = {
  DEFAULT_DRAFT_MODEL,
  DUE_WINDOW_MS,
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
  routeTaskForMode,
};
