/**
 * Station model router (BRIEFING §3.6).
 * Handlers call route() only — never import Anthropic/Ollama/ai directly.
 */

const ROUTER_TASKS = Object.freeze(new Set(["draft_outline", "draft_rough"]));

/** Cents per 1M tokens (rough table for spend-cap estimates). */
const RATE_CENTS_PER_M = Object.freeze({
  haiku: { in: 100, out: 500 },
  sonnet: { in: 300, out: 1500 },
  opus: { in: 1500, out: 7500 },
});

/**
 * @param {string} model
 * @returns {"haiku"|"sonnet"|"opus"}
 */
function tierForModel(model) {
  const m = String(model || "").toLowerCase();
  if (/opus/.test(m)) return "opus";
  if (/haiku/.test(m)) return "haiku";
  return "sonnet";
}

/**
 * @param {string} model
 * @param {number} tokensIn
 * @param {number} tokensOut
 */
function estimateCloudCents(model, tokensIn, tokensOut) {
  const rates = RATE_CENTS_PER_M[tierForModel(model)];
  const cents =
    (Math.max(0, Number(tokensIn) || 0) * rates.in) / 1_000_000 +
    (Math.max(0, Number(tokensOut) || 0) * rates.out) / 1_000_000;
  return Math.max(1, Math.ceil(cents));
}

/** @param {Date|string|number} now */
function dayKey(now) {
  const d = now instanceof Date ? now : new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @param {import('better-sqlite3').Database} db @param {string} key @param {string} fallback */
function setting(db, key, fallback) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value != null && String(row.value) !== "" ? String(row.value) : fallback;
}

/** @param {import('better-sqlite3').Database} db @param {string} day */
function todaySpendCents(db, day) {
  const row = db
    .prepare(`SELECT COALESCE(SUM(est_cents), 0) AS c FROM station_ai_usage WHERE day = ?`)
    .get(day);
  return Number(row?.c) || 0;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ day: string, model: string, tokensIn: number, tokensOut: number, estCents: number }} row
 */
function recordUsage(db, row) {
  db.prepare(
    `INSERT INTO station_ai_usage (day, model, tokens_in, tokens_out, est_cents)
     VALUES (@day, @model, @tokensIn, @tokensOut, @estCents)
     ON CONFLICT(day, model) DO UPDATE SET
       tokens_in = tokens_in + excluded.tokens_in,
       tokens_out = tokens_out + excluded.tokens_out,
       est_cents = est_cents + excluded.est_cents`,
  ).run({
    day: row.day,
    model: row.model,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    estCents: row.estCents,
  });
}

/** @param {string} baseUrl */
async function defaultProbeOllama(baseUrl) {
  const root = String(baseUrl || "http://127.0.0.1:11434/api").replace(/\/api\/?$/, "");
  const url = `${root}/api/tags`;
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

let sdkPromise = null;

async function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import("ai"),
      import("@ai-sdk/anthropic"),
      import("ollama-ai-provider-v2"),
    ]).then(([ai, anthropic, ollama]) => ({
      generateText: ai.generateText,
      createAnthropic: anthropic.createAnthropic,
      createOllama: ollama.createOllama,
      ollamaDefault: ollama.ollama,
    }));
  }
  return sdkPromise;
}

/**
 * @param {{ model: string, system: string, userContent: string, maxTokens?: number, baseUrl: string }} opts
 */
async function defaultGenerateLocal(opts) {
  const { generateText, createOllama, ollamaDefault } = await loadSdk();
  const provider = opts.baseUrl
    ? createOllama({ baseURL: opts.baseUrl })
    : ollamaDefault;
  const result = await generateText({
    model: provider(opts.model),
    system: opts.system,
    prompt: opts.userContent,
    maxTokens: opts.maxTokens || 8192,
  });
  const tokensIn = Number(result.usage?.inputTokens ?? result.usage?.promptTokens) || 0;
  const tokensOut = Number(result.usage?.outputTokens ?? result.usage?.completionTokens) || 0;
  return { text: String(result.text || ""), tokensIn, tokensOut };
}

/**
 * @param {{ model: string, system: string, userContent: string, maxTokens?: number, apiKey: string }} opts
 */
async function defaultGenerateCloud(opts) {
  const { generateText, createAnthropic } = await loadSdk();
  const anthropic = createAnthropic({ apiKey: opts.apiKey });
  const result = await generateText({
    model: anthropic(opts.model),
    system: opts.system,
    prompt: opts.userContent,
    maxTokens: opts.maxTokens || 8192,
  });
  const tokensIn = Number(result.usage?.inputTokens ?? result.usage?.promptTokens) || 0;
  const tokensOut = Number(result.usage?.outputTokens ?? result.usage?.completionTokens) || 0;
  return { text: String(result.text || ""), tokensIn, tokensOut };
}

/**
 * @param {object} deps
 * @param {() => import('better-sqlite3').Database} deps.getDb
 * @param {() => string|null|undefined} [deps.getApiKey]
 * @param {(baseUrl: string) => Promise<boolean>} [deps.probeOllama]
 * @param {(opts: object) => Promise<{ text: string, tokensIn?: number, tokensOut?: number }>} [deps.generateLocal]
 * @param {(opts: object) => Promise<{ text: string, tokensIn?: number, tokensOut?: number }>} [deps.generateCloud]
 * @param {() => Date} [deps.now]
 */
function createModelRouter(deps) {
  if (typeof deps?.getDb !== "function") throw new Error("createModelRouter requires getDb");

  const getApiKey = typeof deps.getApiKey === "function" ? deps.getApiKey : () => null;
  const probeOllama = deps.probeOllama || defaultProbeOllama;
  const generateLocal = deps.generateLocal || defaultGenerateLocal;
  const generateCloud = deps.generateCloud || defaultGenerateCloud;
  const nowFn = deps.now || (() => new Date());

  /** @type {Map<string, string>} */
  const systemCache = new Map();

  /**
   * @param {string} task
   * @param {{ system?: string, userContent?: string, maxTokens?: number, cacheSystem?: boolean }} [opts]
   */
  async function route(task, opts = {}) {
    if (!ROUTER_TASKS.has(task)) {
      return { ok: false, reason: "unknown_task" };
    }

    const db = deps.getDb();
    const preferLocal = setting(db, "station.prefer_local", "1") === "1";
    const localModel = setting(db, "station.local_model", "llama3.2");
    const cloudModel = setting(db, "station.cloud_model", "claude-sonnet-5-5");
    const ollamaBase = setting(db, "station.ollama_base_url", "http://127.0.0.1:11434/api");
    const allowOpus = setting(db, "station.allow_opus", "0") === "1";
    const capCents = Number(setting(db, "station.ai_cap_cents_per_day", "150")) || 150;
    const day = dayKey(nowFn());

    let system = opts.system != null ? String(opts.system) : "";
    if (opts.cacheSystem) {
      if (system) systemCache.set(task, system);
      else if (systemCache.has(task)) system = systemCache.get(task) || "";
    }
    const userContent = opts.userContent != null ? String(opts.userContent) : "";
    const maxTokens = opts.maxTokens;

    if (preferLocal) {
      const up = await probeOllama(ollamaBase);
      if (up) {
        try {
          const result = await generateLocal({
            model: localModel,
            system,
            userContent,
            maxTokens,
            baseUrl: ollamaBase,
          });
          const tokensIn = Number(result.tokensIn) || 0;
          const tokensOut = Number(result.tokensOut) || 0;
          recordUsage(db, {
            day,
            model: localModel,
            tokensIn,
            tokensOut,
            estCents: 0,
          });
          return {
            ok: true,
            text: String(result.text || ""),
            model: localModel,
            tokensIn,
            tokensOut,
            provider: "ollama",
          };
        } catch (err) {
          /* fall through to cloud */
          void err;
        }
      }
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return { ok: false, reason: "unavailable", error: "no api key and local model unavailable" };
    }

    if (/opus/i.test(cloudModel) && !allowOpus) {
      return { ok: false, deferred: true, reason: "opus_blocked" };
    }

    if (todaySpendCents(db, day) >= capCents) {
      return { ok: false, deferred: true, reason: "cap" };
    }

    try {
      const result = await generateCloud({
        model: cloudModel,
        system,
        userContent,
        maxTokens,
        apiKey: String(apiKey),
      });
      const tokensIn = Number(result.tokensIn) || 0;
      const tokensOut = Number(result.tokensOut) || 0;
      const estCents = estimateCloudCents(cloudModel, tokensIn, tokensOut);
      recordUsage(db, {
        day,
        model: cloudModel,
        tokensIn,
        tokensOut,
        estCents,
      });
      return {
        ok: true,
        text: String(result.text || ""),
        model: cloudModel,
        tokensIn,
        tokensOut,
        provider: "anthropic",
      };
    } catch (err) {
      return {
        ok: false,
        reason: "unavailable",
        error: err && err.message ? String(err.message) : "cloud generate failed",
      };
    }
  }

  return { route, systemCache };
}

module.exports = {
  createModelRouter,
  ROUTER_TASKS,
  estimateCloudCents,
  tierForModel,
  dayKey,
};
