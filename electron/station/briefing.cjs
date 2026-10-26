/**
 * Station briefing builder (BRIEFING §3.3). Pure assemble + thin SQLite reader.
 * Ranking ideas mirror Today urgency (sooner first); no renderer imports.
 */

const { validateBriefing } = require("./contracts.cjs");

const DUE_HORIZON_MS = 72 * 3600000;
const OVERDUE_WINDOW_MS = 7 * 86400000;
const GRADE_LOOKBACK_MS = 36 * 3600000;
const ANN_LOOKBACK_MS = 7 * 86400000;
const SUBMIT_HOT_MS = 24 * 3600000;
const HEADLINE_MAX = 90;

const SESSION_OK = new Set(["ok", "expired", "unknown"]);

/** @param {Date|string|number} now */
function asDate(now) {
  const d = now instanceof Date ? now : new Date(now);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

/** @param {Date} d */
function toIso(d) {
  return d.toISOString();
}

/** Local calendar day YYYY-MM-DD for AI usage / job day keys. */
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

function courseLabel(row) {
  return (row.course_code && String(row.course_code).trim()) || row.course_name || row.course || "Course";
}

function hoursUntil(iso, nowMs) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return (at - nowMs) / 3600000;
}

function countWord(n) {
  const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  return words[n] || String(n);
}

/**
 * Plain template headline, capped at 90 chars.
 * @param {object} bits
 */
function buildHeadline(bits) {
  const parts = [];
  const g = bits.newGrades?.length || 0;
  const d = bits.draftsReady?.length || 0;
  const hot = (bits.dueSoon || []).find((x) => {
    const h = hoursUntil(x.dueAt, bits.nowMs);
    return h != null && h >= 0 && h < 24;
  });

  if (bits.session === "expired") parts.push("Blackboard signed out");
  if (g === 1) parts.push("One new grade");
  else if (g > 1) parts.push(`${countWord(g)} new grades`);
  if (d === 1) parts.push("one draft ready");
  else if (d > 1) parts.push(`${countWord(d)} drafts ready`);
  if (hot) {
    const when = hoursUntil(hot.dueAt, bits.nowMs) < 12 ? "tonight" : "today";
    parts.push(`${hot.course} ${hot.title} ${when}`.trim());
  } else if (!parts.length) {
    const next = bits.dueSoon?.[0];
    if (next) parts.push(`Next up: ${next.course} ${next.title}`);
    else parts.push("Nothing urgent right now");
  }

  let text = parts.join(", ");
  if (text.length) text = text.charAt(0).toUpperCase() + text.slice(1);
  if (!/[.!?]$/.test(text)) text += ".";
  if (text.length > HEADLINE_MAX) text = `${text.slice(0, HEADLINE_MAX - 1).trimEnd()}…`;
  return text;
}

/**
 * needsYou order: sign_in → submit_yourself (due < 24h) → review_draft → study.
 * @param {object} facts
 * @param {number} nowMs
 */
function buildNeedsYou(facts, nowMs) {
  const out = [];
  if (facts.session?.blackboard === "expired") {
    out.push({
      kind: "sign_in",
      text: "Sign in to Blackboard on the PC",
      ref: null,
    });
  }

  for (const item of facts.dueSoon || []) {
    if (item.state === "submitted") continue;
    const left = item.dueAt ? Date.parse(item.dueAt) - nowMs : NaN;
    if (!Number.isFinite(left) || left >= SUBMIT_HOT_MS) continue;
    // Overdue or due within 24h — Jack submits himself; Station never does.
    out.push({
      kind: "submit_yourself",
      text: `Submit ${item.course} ${item.title} yourself`,
      ref: item.uuid || item.draftId || null,
    });
  }

  for (const draft of facts.draftsReady || []) {
    out.push({
      kind: "review_draft",
      text: `Review ${draft.course} ${draft.title} ${draft.mode || "draft"}`,
      ref: draft.draftId || null,
    });
  }

  for (const study of facts.studyItems || []) {
    out.push({
      kind: "study",
      text: `Study for ${study.course} ${study.title}`,
      ref: study.uuid || null,
    });
  }

  return out;
}

/**
 * @param {object} facts
 * @param {Date|string|number} [now]
 */
function buildBriefing(facts, now = new Date()) {
  const at = asDate(now);
  const nowMs = at.getTime();
  const dueSoon = (facts.dueSoon || []).filter((d) => d && d.state !== "submitted");
  const session = {
    blackboard: SESSION_OK.has(facts.session?.blackboard) ? facts.session.blackboard : "unknown",
    lastSyncAt: facts.session?.lastSyncAt ?? null,
  };
  const newGrades = facts.newGrades || [];
  const draftsReady = facts.draftsReady || [];
  const announcements = facts.announcements || [];
  const jobs = facts.jobs || { ran: 0, failed: 0, failures: [] };
  const aiSpend = facts.aiSpend || { todayCents: 0, capCents: 150 };
  const kind = facts.kind || "on_demand";

  const briefing = {
    generatedAt: toIso(at),
    kind,
    headline: buildHeadline({
      session: session.blackboard,
      newGrades,
      draftsReady,
      dueSoon,
      nowMs,
    }),
    session,
    newGrades,
    dueSoon,
    draftsReady,
    needsYou: buildNeedsYou({ ...facts, dueSoon, session }, nowMs),
    announcements,
    jobs: {
      ran: Number(jobs.ran) || 0,
      failed: Number(jobs.failed) || 0,
      failures: Array.isArray(jobs.failures) ? jobs.failures : [],
    },
    aiSpend: {
      todayCents: Number(aiSpend.todayCents) || 0,
      capCents: Number(aiSpend.capCents) || 150,
    },
  };

  const check = validateBriefing(briefing);
  if (!check.ok) {
    const err = new Error(`briefing failed validation: ${check.errors.join("; ")}`);
    err.errors = check.errors;
    throw err;
  }
  return briefing;
}

/**
 * Load DB facts for buildBriefing. Kind is left as on_demand; callers merge kind.
 * @param {import('better-sqlite3').Database} db
 * @param {Date|string|number} [now]
 */
function readFacts(db, now = new Date()) {
  const at = asDate(now);
  const nowMs = at.getTime();
  const day = localDayKey(at);
  const dueHi = toIso(new Date(nowMs + DUE_HORIZON_MS));
  const dueLo = toIso(new Date(nowMs - OVERDUE_WINDOW_MS));
  const gradeSince = toIso(new Date(nowMs - GRADE_LOOKBACK_MS));
  const annSince = toIso(new Date(nowMs - ANN_LOOKBACK_MS));

  const rawSession = setting(db, "station.bb_session", "unknown");
  const blackboard = SESSION_OK.has(rawSession) ? rawSession : "unknown";
  let lastSyncAt = setting(db, "station.last_sync_at", null);
  if (!lastSyncAt) {
    lastSyncAt =
      db
        .prepare(
          `SELECT MAX(at) AS at FROM (
             SELECT MAX(synced_at) AS at FROM bb_items
             UNION ALL
             SELECT MAX(synced_at) AS at FROM bb_grade_items
           )`
        )
        .get()?.at || null;
  }

  const capCents = Number(setting(db, "station.ai_cap_cents_per_day", "150")) || 150;
  const spendRow = db
    .prepare("SELECT COALESCE(SUM(est_cents), 0) AS cents FROM station_ai_usage WHERE day = ?")
    .get(day);
  const todayCents = Number(spendRow?.cents) || 0;

  const draftByAsg = new Map(
    db
      .prepare(
        `SELECT id, assignment_uuid, course_uuid, mode, check_count, status
         FROM station_drafts WHERE status = 'ready'`
      )
      .all()
      .map((r) => [r.assignment_uuid, r])
  );

  const dueRows = db
    .prepare(
      `SELECT a.uuid, a.title, a.due_date, a.kind, a.submitted, a.completed,
              c.uuid AS course_uuid, c.name AS course_name, c.course_code
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       WHERE a.submitted = 0 AND COALESCE(a.completed, 0) = 0
         AND a.due_date IS NOT NULL
         AND a.due_date >= ? AND a.due_date <= ?
         AND a.score IS NULL
       ORDER BY a.due_date ASC, a.title COLLATE NOCASE ASC`
    )
    .all(dueLo, dueHi);

  const dueSoon = dueRows.map((r) => {
    const draft = draftByAsg.get(r.uuid);
    return {
      course: courseLabel(r),
      title: r.title,
      dueAt: r.due_date,
      state: draft ? "draft_ready" : "not_started",
      draftId: draft?.id || null,
      uuid: r.uuid,
      kind: r.kind || "assignment",
      courseUuid: r.course_uuid,
    };
  });

  const studyItems = dueRows
    .filter((r) => r.kind === "exam")
    .map((r) => ({
      course: courseLabel(r),
      title: r.title,
      uuid: r.uuid,
      dueAt: r.due_date,
    }));

  const draftsReady = db
    .prepare(
      `SELECT d.id AS draftId, d.mode, d.check_count AS checks, d.assignment_uuid,
              c.name AS course_name, c.course_code, a.title
       FROM station_drafts d
       JOIN courses c ON c.uuid = d.course_uuid
       LEFT JOIN assignments a ON a.uuid = d.assignment_uuid
       WHERE d.status = 'ready'
       ORDER BY d.created_at ASC`
    )
    .all()
    .map((r) => ({
      draftId: r.draftId,
      course: courseLabel(r),
      title: r.title || "Draft",
      mode: r.mode,
      checks: Number(r.checks) || 0,
      assignmentUuid: r.assignment_uuid,
    }));

  const newGrades = db
    .prepare(
      `SELECT g.name AS title, g.score, g.points_possible, c.name AS course_name, c.course_code
       FROM bb_grade_items g
       JOIN courses c ON c.id = g.course_id
       WHERE g.score IS NOT NULL AND g.synced_at >= ?
       ORDER BY g.synced_at DESC`
    )
    .all(gradeSince)
    .map((r) => ({
      course: courseLabel(r),
      title: r.title,
      score: r.score,
      pointsPossible: r.points_possible ?? null,
      changed: false,
    }));

  const announcements = db
    .prepare(
      `SELECT a.title, a.posted_at, c.name AS course_name, c.course_code
       FROM announcements a
       JOIN courses c ON c.id = a.course_id
       WHERE a.posted_at IS NOT NULL AND a.posted_at >= ?
       ORDER BY a.posted_at DESC
       LIMIT 8`
    )
    .all(annSince)
    .map((r) => ({
      course: courseLabel(r),
      title: r.title,
      postedAt: r.posted_at,
    }));

  const jobRows = db
    .prepare(
      `SELECT status, type, error, summary FROM station_jobs
       WHERE date(COALESCE(finished_at, created_at), 'localtime') = ?`
    )
    .all(day);
  const ran = jobRows.filter((j) => j.status === "done" || j.status === "failed" || j.status === "needs_you").length;
  const failures = jobRows
    .filter((j) => j.status === "failed")
    .map((j) => ({ type: j.type, error: j.error || j.summary || "failed" }));

  return {
    kind: "on_demand",
    session: { blackboard, lastSyncAt },
    newGrades,
    dueSoon,
    draftsReady,
    announcements,
    studyItems,
    jobs: { ran, failed: failures.length, failures },
    aiSpend: { todayCents, capCents },
  };
}

module.exports = { buildBriefing, readFacts, HEADLINE_MAX };
