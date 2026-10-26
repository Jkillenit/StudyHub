/**
 * Job handler: drafts_prep (BRIEFING §3.2 / §6).
 * Uses injected model `route` only — no direct provider calls.
 */
const { listEligible, prepOneDraft } = require("../drafts.cjs");

/**
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 * @param {(task: string, opts: object) => Promise<object>} deps.route
 * @param {() => string} deps.documentsDir
 * @param {() => string} deps.styleDir
 * @param {() => Date|string|number} [deps.now]
 * @param {(info: object) => void|Promise<void>} [deps.onDraftReady]
 * @param {(courseUuid: string) => string} [deps.getSyllabusExcerpt]
 * @param {(assignmentUuid: string) => string} [deps.getAttachmentText]
 */
function createDraftsPrepHandler(deps) {
  if (!deps?.db) throw new Error("createDraftsPrepHandler requires db");
  if (typeof deps.route !== "function") throw new Error("createDraftsPrepHandler requires route");

  return async function draftsPrep({ params = {}, progress, log, signal } = {}) {
    const now = typeof deps.now === "function" ? deps.now() : new Date();
    const documentsDir =
      typeof deps.documentsDir === "function" ? deps.documentsDir() : deps.documentsDir;
    const styleDir = typeof deps.styleDir === "function" ? deps.styleDir() : deps.styleDir;

    const onlyUuid = typeof params.assignmentUuid === "string" ? params.assignmentUuid : null;
    let targets = listEligible(deps.db, now);
    if (onlyUuid) targets = targets.filter((t) => t.uuid === onlyUuid);

    if (!targets.length) {
      progress?.(100, "no eligible drafts");
      return { summary: "no eligible drafts" };
    }

    const ready = [];
    for (let i = 0; i < targets.length; i++) {
      if (signal?.aborted) {
        return { summary: "cancelled", status: "cancelled" };
      }
      const item = targets[i];
      const pct = Math.round((i / targets.length) * 90);
      progress?.(pct, `drafting ${item.title}`);
      log?.("info", `prep ${item.uuid}`, { mode: item.mode, title: item.title });

      const result = await prepOneDraft({
        db: deps.db,
        now,
        assignmentUuid: item.uuid,
        documentsDir,
        styleDir,
        route: deps.route,
        syllabusExcerpt: deps.getSyllabusExcerpt?.(item.course_uuid) || "",
        attachmentText: deps.getAttachmentText?.(item.uuid) || "",
      });

      if (result.status === "needs_you") {
        log?.("warn", result.summary || "needs you", { deferred: result.deferred, reason: result.reason });
        return { summary: result.summary || "AI cap reached", status: "needs_you" };
      }
      if (result.status === "ready") {
        ready.push(result);
        if (deps.onDraftReady) {
          try {
            await deps.onDraftReady(result);
          } catch {
            /* notify must not fail the job */
          }
        }
      } else if (result.status === "failed") {
        log?.("error", result.summary || "draft failed", { uuid: item.uuid });
      }
    }

    progress?.(100, `drafted ${ready.length}`);
    const summary =
      ready.length === 0
        ? "no drafts prepared"
        : ready.length === 1
          ? `draft ready: ${ready[0].summary}`
          : `${ready.length} drafts ready`;
    return { summary };
  };
}

module.exports = { createDraftsPrepHandler };
