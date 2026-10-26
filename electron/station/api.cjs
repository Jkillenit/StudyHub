/**
 * Nova Station remote API (BRIEFING §3.4).
 * Fastify on 127.0.0.1:47811 only; bearer token; routes wired to injected services.
 */

const path = require("node:path");
const { Readable } = require("node:stream");
const { EventEmitter } = require("node:events");
const Fastify = require("fastify");
const fastifyStatic = require("@fastify/static");
const { verifyToken, bearerFromHeader } = require("./auth.cjs");
const { EVENTS } = require("./contracts.cjs");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 47811;

const SSE_EVENTS = EVENTS.filter((e) => e !== "session.changed");

/** @param {string} host */
function isLoopbackHost(host) {
  return host === "127.0.0.1";
}

/**
 * @param {string} host
 */
function assertLoopbackHost(host) {
  if (!isLoopbackHost(host)) {
    throw new Error(`Station API refuses non-loopback bind (got ${host}; use 127.0.0.1 only)`);
  }
}

/**
 * @typedef {object} ApiServices
 * @property {() => Promise<object>|object} getHealth
 * @property {() => Promise<object>|object} getBriefing
 * @property {(preset: string) => Promise<{runId: string, jobIds: string[]}>|{runId: string, jobIds: string[]}} startRun
 * @property {(since?: string) => Promise<object[]>|object[]} listJobs
 * @property {(id: string) => Promise<{job: object, events: object[]}|null>|{job: object, events: object[]}|null} getJob
 * @property {(id: string) => Promise<{ok: boolean}>|{ok: boolean}} cancelJob
 * @property {(id: string) => Promise<{meta: object, markdown: string}|null>|{meta: object, markdown: string}|null} getDraft
 * @property {(id: string, status: string) => Promise<{ok: boolean}>|{ok: boolean}} setDraftStatus
 * @property {import('node:events').EventEmitter} [events]
 */

/**
 * @param {object} opts
 * @param {string} opts.tokenHash
 * @param {ApiServices} opts.services
 * @param {string} [opts.host]
 * @param {number} [opts.port]
 * @param {string} [opts.staticRoot]
 * @param {boolean} [opts.listen] — when true, bind host:port (default true)
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function createApi(opts) {
  const host = opts.host ?? DEFAULT_HOST;
  const port = opts.port ?? DEFAULT_PORT;
  const shouldListen = opts.listen !== false;

  if (shouldListen) {
    assertLoopbackHost(host);
  } else if (opts.host != null) {
    assertLoopbackHost(host);
  }

  const tokenHash = opts.tokenHash;
  if (!tokenHash) {
    throw new Error("Station API requires tokenHash");
  }

  const services = opts.services;
  if (!services) {
    throw new Error("Station API requires services");
  }

  const events = services.events || new EventEmitter();

  const app = Fastify({
    logger: false,
    // inject tests should not need a real listen for route coverage
  });

  app.addHook("onRequest", async (request, reply) => {
    const token = bearerFromHeader(request.headers.authorization);
    if (!verifyToken(token || "", tokenHash)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/api/health", async () => services.getHealth());

  app.get("/api/briefing", async () => services.getBriefing());

  app.post("/api/run", async (request) => {
    const body = /** @type {{ preset?: string }} */ (request.body || {});
    return services.startRun(body.preset);
  });

  app.get("/api/jobs", async (request) => {
    const q = /** @type {{ since?: string }} */ (request.query || {});
    return services.listJobs(q.since);
  });

  app.get("/api/jobs/:id", async (request, reply) => {
    const { id } = /** @type {{ id: string }} */ (request.params);
    const row = await services.getJob(id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.post("/api/jobs/:id/cancel", async (request) => {
    const { id } = /** @type {{ id: string }} */ (request.params);
    return services.cancelJob(id);
  });

  app.get("/api/drafts/:id", async (request, reply) => {
    const { id } = /** @type {{ id: string }} */ (request.params);
    const draft = await services.getDraft(id);
    if (!draft) return reply.code(404).send({ error: "not_found" });
    return draft;
  });

  app.post("/api/drafts/:id/status", async (request, reply) => {
    const { id } = /** @type {{ id: string }} */ (request.params);
    const body = /** @type {{ status?: string }} */ (request.body || {});
    const status = body.status;
    if (status !== "reviewed" && status !== "dismissed") {
      return reply.code(400).send({ error: "invalid_status" });
    }
    return services.setDraftStatus(id, status);
  });

  app.get("/api/stream", (request, reply) => {
    const stream = new Readable({
      read() {},
    });

    /** @type {Array<[string, (...args: unknown[]) => void]>} */
    const handlers = [];

    const close = () => {
      for (const [name, handler] of handlers) {
        events.off(name, handler);
      }
      events.off("station.api.close", close);
      request.raw.off("close", close);
      if (!stream.destroyed) {
        stream.push(null);
      }
    };

    for (const name of SSE_EVENTS) {
      const handler = (data) => {
        if (!stream.destroyed) {
          stream.push(`event: ${name}\ndata: ${JSON.stringify(data ?? null)}\n\n`);
        }
      };
      events.on(name, handler);
      handlers.push([name, handler]);
    }

    events.on("station.api.close", close);
    request.raw.on("close", close);

    reply.header("Content-Type", "text/event-stream");
    reply.header("Cache-Control", "no-cache");
    reply.header("Connection", "keep-alive");
    reply.send(stream);

    stream.push(": connected\n\n");
  });

  if (opts.staticRoot) {
    await app.register(fastifyStatic, {
      root: path.resolve(opts.staticRoot),
      wildcard: false,
    });
    // Auth hook already covers GET /; @fastify/static serves index.html for /
  }

  if (shouldListen) {
    assertLoopbackHost(host);
    await app.listen({ host, port });
  } else {
    await app.ready();
  }

  return app;
}

/**
 * Convenience start/stop wrapper for station/index wiring.
 * @param {Parameters<typeof createApi>[0]} opts
 */
async function start(opts) {
  const host = opts.host ?? DEFAULT_HOST;
  assertLoopbackHost(host);
  const app = await createApi({ ...opts, host, listen: true });
  return {
    app,
    async stop() {
      await app.close();
    },
  };
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  isLoopbackHost,
  assertLoopbackHost,
  createApi,
  start,
};
