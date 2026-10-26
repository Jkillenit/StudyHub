/**
 * Thin Station `route` until S0.4 `modelRouter.cjs` lands.
 * Matches BRIEFING §3.6 signature; draft tasks → callMessages, or deferred cap.
 */

const DRAFT_TASKS = new Set(["draft_outline", "draft_rough"]);

/**
 * Prefer real model router when present (S0.4); else callMessages stub.
 * @param {{ getDb: () => import('better-sqlite3').Database, getApiKey: () => string|null|undefined, checkSpendCap: Function, callMessages: Function }} deps
 */
function resolveStationRoute(deps) {
  const tryLoad = (rel) => {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const mod = require(rel);
      if (typeof mod.createModelRouter === "function") {
        return mod.createModelRouter({
          getDb: deps.getDb,
          getApiKey: deps.getApiKey,
        }).route;
      }
    } catch {
      /* not on main yet */
    }
    return null;
  };

  return (
    tryLoad("./modelRouter.cjs") ||
    tryLoad("../ai/modelRouter.cjs") ||
    createCallMessagesRoute(deps)
  );
}

/**
 * @param {{ getDb: () => import('better-sqlite3').Database, getApiKey: () => string|null|undefined, checkSpendCap: Function, callMessages: Function }} deps
 */
function createCallMessagesRoute(deps) {
  const { getDb, getApiKey, checkSpendCap, callMessages } = deps;

  return async function route(task, opts = {}) {
    if (!DRAFT_TASKS.has(String(task || ""))) {
      return { ok: false, reason: "unknown_task" };
    }

    const db = getDb();
    const modelRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("station.cloud_model");
    const legacy = db.prepare("SELECT value FROM settings WHERE key = ?").get("station.draft_model");
    const model =
      (modelRow?.value && String(modelRow.value)) ||
      (legacy?.value && String(legacy.value)) ||
      "claude-sonnet-5-5";

    const allowOpus = db.prepare("SELECT value FROM settings WHERE key = ?").get("station.allow_opus");
    if (/opus/i.test(model) && String(allowOpus?.value || "0") !== "1") {
      return { ok: false, deferred: true, reason: "opus_blocked" };
    }

    const cap = checkSpendCap(db, new Date());
    if (!cap.ok) {
      return { ok: false, deferred: true, reason: "cap" };
    }

    const apiKey = typeof getApiKey === "function" ? getApiKey() : null;
    if (!apiKey) {
      return { ok: false, reason: "unavailable", error: "no api key" };
    }

    try {
      const text = await callMessages(apiKey, {
        model,
        system: opts.system,
        userContent: opts.userContent,
        maxTokens: opts.maxTokens || 8192,
      });
      const tokensIn =
        Math.ceil(String(opts.system || "").length / 4) +
        Math.ceil(String(opts.userContent || "").length / 4);
      const tokensOut = Math.ceil(String(text || "").length / 4);
      return {
        ok: true,
        text,
        model,
        tokensIn,
        tokensOut,
        provider: "anthropic",
      };
    } catch (err) {
      return { ok: false, reason: "unavailable", error: err?.message || String(err) };
    }
  };
}

module.exports = { resolveStationRoute, createCallMessagesRoute, DRAFT_TASKS };
