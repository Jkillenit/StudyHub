/**
 * Station job handler: instructions_sync (BRIEFING §3.2).
 * GET assignment instructions + attachment text for rows due within 7 days; store per §3.1.
 * No Electron imports — deps injected.
 */
const fs = require("node:fs");
const path = require("node:path");

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;

function isSessionExpired(err) {
  const status = err?.status ?? err?.statusCode;
  return status === 401 || status === 403;
}

function safeFileName(name) {
  const base = path.basename(String(name || "attachment")).replace(/[^\w.\-() +]/g, "_");
  return base.slice(0, 180) || "attachment";
}

/**
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 * @param {(bbCourseId: string, columnId: string) => Promise<{
 *   instructions: string,
 *   contentId?: string|null,
 *   attachments?: Array<{ id?: string, fileName: string, buffer?: Buffer, text?: string }>
 * }>} deps.fetchInstructions
 * @param {string} deps.appDataPath
 * @param {() => Date} [deps.now]
 */
function createInstructionsSyncHandler({ db, fetchInstructions, appDataPath, now = () => new Date() } = {}) {
  if (!db) throw new Error("createInstructionsSyncHandler requires db");
  if (typeof fetchInstructions !== "function") {
    throw new Error("createInstructionsSyncHandler requires fetchInstructions");
  }
  if (!appDataPath) throw new Error("createInstructionsSyncHandler requires appDataPath");

  const selectDue = db.prepare(`
    SELECT a.uuid AS uuid, a.bb_id AS bbId, a.title AS title, a.due_date AS dueDate,
           c.bb_course_id AS bbCourseId, c.uuid AS courseUuid
    FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.bb_id IS NOT NULL
      AND a.source = 'blackboard'
      AND a.due_date IS NOT NULL
      AND c.bb_course_id IS NOT NULL
      AND a.due_date >= @fromIso
      AND a.due_date <= @untilIso
    ORDER BY a.due_date ASC
  `);

  const updateInstr = db.prepare(`
    UPDATE assignments
    SET instructions = @instructions,
        instructions_synced_at = @syncedAt
    WHERE uuid = @uuid
  `);

  return async function instructionsSync({ progress, log, signal } = {}) {
    const t0 = now();
    const fromIso = new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), t0.getUTCDate())).toISOString();
    const untilIso = new Date(t0.getTime() + WINDOW_DAYS * DAY_MS).toISOString();

    const rows = selectDue.all({ fromIso, untilIso });
    const total = rows.length;
    let synced = 0;

    progress?.(0, total ? `Syncing instructions for ${total} assignment(s)` : "No assignments due within 7 days");

    for (let i = 0; i < rows.length; i += 1) {
      if (signal?.aborted) {
        return { summary: `Cancelled after ${synced}/${total}`, status: "cancelled" };
      }
      const row = rows[i];
      progress?.(Math.round(((i + 0.5) / Math.max(total, 1)) * 100), row.title);

      let payload;
      try {
        payload = await fetchInstructions(row.bbCourseId, row.bbId);
      } catch (err) {
        if (isSessionExpired(err)) {
          log?.("error", "Blackboard session expired", { status: err.status });
          return { status: "needs_you", summary: "Blackboard signed out — sign in on the PC" };
        }
        log?.("warn", `Instructions fetch failed for ${row.title}`, { error: String(err?.message || err) });
        continue;
      }

      const instructions = String(payload?.instructions || "");
      const syncedAt = now().toISOString();
      updateInstr.run({ uuid: row.uuid, instructions: instructions || null, syncedAt });

      const dir = path.join(appDataPath, "station", "instructions", row.uuid);
      for (const att of payload?.attachments || []) {
        if (!att?.buffer || !att.fileName) continue;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, safeFileName(att.fileName)), att.buffer);
      }

      synced += 1;
      log?.("info", `Synced instructions: ${row.title}`, { uuid: row.uuid });
      progress?.(Math.round(((i + 1) / Math.max(total, 1)) * 100), row.title);
    }

    return { summary: `Synced instructions for ${synced} of ${total} assignment(s)` };
  };
}

module.exports = { createInstructionsSyncHandler };
