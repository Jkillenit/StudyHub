import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { hashToken, generateToken, verifyToken } = require("./auth.cjs");
const { createApi, DEFAULT_HOST, DEFAULT_PORT, isLoopbackHost } = require("./api.cjs");

const TOKEN = "test-station-token-value";
const TOKEN_HASH = hashToken(TOKEN);

function authHeaders(token = TOKEN) {
  return { authorization: `Bearer ${token}` };
}

function sampleBriefing() {
  return {
    generatedAt: "2026-10-26T06:45:00-05:00",
    kind: "morning",
    headline: "Quiet morning.",
    session: { blackboard: "ok", lastSyncAt: "2026-10-26T06:40:00-05:00" },
    newGrades: [],
    dueSoon: [],
    draftsReady: [],
    needsYou: [],
    announcements: [],
    jobs: { ran: 0, failed: 0, failures: [] },
    aiSpend: { todayCents: 0, capCents: 150 },
  };
}

function sampleJob(id = "job-1") {
  return {
    id,
    type: "health_check",
    status: "queued",
    source: "remote",
    params: "{}",
    progress: 0,
    summary: null,
    error: null,
    attempts: 0,
    dedupe_key: null,
    run_id: "run-1",
    created_at: "2026-10-26T06:00:00.000Z",
    started_at: null,
    finished_at: null,
  };
}

function makeServices(overrides = {}) {
  const events = new EventEmitter();
  return {
    events,
    getHealth: vi.fn(async () => ({
      ok: true,
      version: "1.1.0",
      uptimeSec: 12,
      session: "ok",
      lastSyncAt: "2026-10-26T06:40:00-05:00",
      queueDepth: 0,
    })),
    getBriefing: vi.fn(async () => sampleBriefing()),
    startRun: vi.fn(async (preset) => ({
      runId: "run-abc",
      jobIds: [`${preset}-1`, `${preset}-2`],
    })),
    listJobs: vi.fn(async () => [sampleJob()]),
    getJob: vi.fn(async (id) => ({
      job: sampleJob(id),
      events: [
        {
          id: 1,
          job_id: id,
          at: "2026-10-26T06:01:00.000Z",
          level: "info",
          message: "queued",
          data: null,
        },
      ],
    })),
    cancelJob: vi.fn(async () => ({ ok: true })),
    getDraft: vi.fn(async (id) => ({
      meta: { id, status: "ready", mode: "outline", check_count: 2 },
      markdown: "# Outline\n",
    })),
    setDraftStatus: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

/** @type {import('fastify').FastifyInstance | null} */
let app = null;
/** @type {string | null} */
let staticRoot = null;

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
  if (staticRoot) {
    fs.rmSync(staticRoot, { recursive: true, force: true });
    staticRoot = null;
  }
});

async function buildApi(opts = {}) {
  const services = opts.services || makeServices();
  staticRoot =
    opts.staticRoot ||
    (() => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "station-api-"));
      fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>remote</title>");
      return dir;
    })();
  app = await createApi({
    tokenHash: TOKEN_HASH,
    services,
    staticRoot,
    listen: false,
    ...opts,
  });
  return { app, services };
}

describe("station auth", () => {
  it("hashes tokens and verifies with constant-time compare", () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyToken(token, hash)).toBe(true);
    expect(verifyToken("wrong", hash)).toBe(false);
    expect(verifyToken(token, "0".repeat(64))).toBe(false);
    expect(verifyToken("", hash)).toBe(false);
    expect(verifyToken(token, "")).toBe(false);
  });
});

describe("station api host guard", () => {
  it("defaults to 127.0.0.1:47811", () => {
    expect(DEFAULT_HOST).toBe("127.0.0.1");
    expect(DEFAULT_PORT).toBe(47811);
  });

  it("treats only 127.0.0.1 as allowed bind host", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("192.168.1.10")).toBe(false);
    expect(isLoopbackHost("::")).toBe(false);
  });

  it("refuses to start on a non-loopback host", async () => {
    await expect(
      createApi({
        tokenHash: TOKEN_HASH,
        services: makeServices(),
        host: "0.0.0.0",
        listen: true,
      }),
    ).rejects.toThrow(/loopback|127\.0\.0\.1/i);
  });
});

describe("station api auth gate", () => {
  it("returns 401 without a bearer token on every API route", async () => {
    const { app: server } = await buildApi();
    const routes = [
      { method: "GET", url: "/api/health" },
      { method: "GET", url: "/api/briefing" },
      { method: "POST", url: "/api/run", payload: { preset: "briefing" } },
      { method: "GET", url: "/api/jobs" },
      { method: "GET", url: "/api/jobs/job-1" },
      { method: "POST", url: "/api/jobs/job-1/cancel" },
      { method: "GET", url: "/api/stream" },
      { method: "GET", url: "/api/drafts/d1" },
      { method: "POST", url: "/api/drafts/d1/status", payload: { status: "reviewed" } },
    ];
    for (const route of routes) {
      const res = await server.inject(route);
      expect(res.statusCode, route.url).toBe(401);
    }
  });

  it("serves static GET / without bearer (PWA shell)", async () => {
    const { app: server } = await buildApi();
    const res = await server.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("remote");
  });

  it("keeps /api behind the token when the path is encoded or oddly cased", async () => {
    const { app: server } = await buildApi();
    for (const url of ["/%61pi/health", "/api%2Fhealth", "/API/health", "//api/health", "/./api/health"]) {
      const res = await server.inject({ method: "GET", url });
      expect(res.statusCode, url).not.toBe(200);
    }
  });

  it("returns 401 for a wrong bearer token", async () => {
    const { app: server } = await buildApi();
    const res = await server.inject({
      method: "GET",
      url: "/api/health",
      headers: authHeaders("not-the-token"),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("station api routes", () => {
  it("GET /api/health returns health shape", async () => {
    const { app: server, services } = await buildApi();
    const res = await server.inject({
      method: "GET",
      url: "/api/health",
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      version: "1.1.0",
      uptimeSec: 12,
      session: "ok",
      lastSyncAt: "2026-10-26T06:40:00-05:00",
      queueDepth: 0,
    });
    expect(services.getHealth).toHaveBeenCalledOnce();
  });

  it("GET /api/briefing returns latest briefing", async () => {
    const { app: server } = await buildApi();
    const res = await server.inject({
      method: "GET",
      url: "/api/briefing",
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(sampleBriefing());
  });

  it("POST /api/run returns runId and jobIds", async () => {
    const { app: server, services } = await buildApi();
    const res = await server.inject({
      method: "POST",
      url: "/api/run",
      headers: authHeaders(),
      payload: { preset: "sync" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ runId: "run-abc", jobIds: ["sync-1", "sync-2"] });
    expect(services.startRun).toHaveBeenCalledWith("sync");
  });

  it("GET /api/jobs passes since and returns job list", async () => {
    const { app: server, services } = await buildApi();
    const since = "2026-10-26T00:00:00.000Z";
    const res = await server.inject({
      method: "GET",
      url: `/api/jobs?since=${encodeURIComponent(since)}`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([sampleJob()]);
    expect(services.listJobs).toHaveBeenCalledWith(since);
  });

  it("GET /api/jobs/:id returns job + events", async () => {
    const { app: server } = await buildApi();
    const res = await server.inject({
      method: "GET",
      url: "/api/jobs/job-9",
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.job.id).toBe("job-9");
    expect(body.events).toHaveLength(1);
  });

  it("POST /api/jobs/:id/cancel returns { ok }", async () => {
    const { app: server, services } = await buildApi();
    const res = await server.inject({
      method: "POST",
      url: "/api/jobs/job-9/cancel",
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(services.cancelJob).toHaveBeenCalledWith("job-9");
  });

  it("GET /api/drafts/:id returns meta + markdown", async () => {
    const { app: server } = await buildApi();
    const res = await server.inject({
      method: "GET",
      url: "/api/drafts/draft-1",
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      meta: { id: "draft-1", status: "ready", mode: "outline", check_count: 2 },
      markdown: "# Outline\n",
    });
  });

  it("POST /api/drafts/:id/status accepts reviewed|dismissed", async () => {
    const { app: server, services } = await buildApi();
    const res = await server.inject({
      method: "POST",
      url: "/api/drafts/draft-1/status",
      headers: authHeaders(),
      payload: { status: "dismissed" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(services.setDraftStatus).toHaveBeenCalledWith("draft-1", "dismissed");
  });

  it("GET /api/stream is an SSE endpoint", async () => {
    const { app: server, services } = await buildApi();
    const injectPromise = server.inject({
      method: "GET",
      url: "/api/stream",
      headers: authHeaders(),
    });

    // Emit after the handler has subscribed, then close so inject resolves.
    setTimeout(() => {
      services.events.emit("job.updated", { id: "job-1", status: "running" });
      setTimeout(() => services.events.emit("station.api.close"), 10);
    }, 5);

    const res = await injectPromise;
    expect(res.statusCode).toBe(200);
    expect(String(res.headers["content-type"] || "")).toMatch(/text\/event-stream/);
    expect(res.payload).toContain("event: job.updated");
    expect(res.payload).toContain('"id":"job-1"');
  });

  it("GET / still serves remote static files with bearer", async () => {
    const { app: server } = await buildApi();
    const res = await server.inject({
      method: "GET",
      url: "/",
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("remote");
  });
});
