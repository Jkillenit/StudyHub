import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const {
  createNotify,
  mapEvent,
  RATE_LIMIT_MS,
  EVENT_TYPES,
} = createRequire(import.meta.url)("./notify.cjs");

function fakeClock(start = 1_000_000) {
  let now = start;
  const timers = [];
  return {
    now: () => now,
    advance(ms) {
      now += ms;
      const due = timers.filter((t) => !t.cleared && t.at <= now);
      for (const t of due) {
        t.cleared = true;
        t.fn();
      }
    },
    setTimeout(fn, ms) {
      const handle = { at: now + ms, fn, cleared: false };
      timers.push(handle);
      return handle;
    },
    clearTimeout(handle) {
      if (handle) handle.cleared = true;
    },
  };
}

function makeNotify(overrides = {}) {
  const clock = overrides.clock || fakeClock();
  const config = {
    ntfyUrl: "https://ntfy.sh",
    ntfyTopic: "studyhub-test-topic-abc",
    pushDetails: false,
    clickUrl: "https://desk.tailnet.ts.net/",
    ...overrides.config,
  };
  const fetch = overrides.fetch || vi.fn(async () => ({ ok: true, status: 200 }));
  const notify = createNotify({
    fetch,
    now: clock.now,
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock),
    getConfig: () => ({ ...config }),
  });
  return { notify, fetch, clock, config };
}

describe("mapEvent (BRIEFING §3.5)", () => {
  it("maps every event type to title and priority", () => {
    expect(EVENT_TYPES).toEqual([
      "run_finished",
      "draft_ready",
      "new_grade",
      "session_expired",
      "job_failed",
      "morning_briefing",
    ]);

    expect(mapEvent("run_finished", { grades: 2, drafts: 1 })).toEqual({
      eventType: "run_finished",
      title: "Nova: run done — 2 grades, 1 draft ready",
      body: "",
      priority: "default",
    });

    expect(mapEvent("draft_ready", { course: "GBA 490", title: "Case 4", mode: "outline" })).toEqual({
      eventType: "draft_ready",
      title: "Draft ready: GBA 490 Case 4 (outline)",
      body: "",
      priority: "default",
    });

    expect(mapEvent("new_grade", { course: "GBA 490" }, { pushDetails: false })).toEqual({
      eventType: "new_grade",
      title: "New grade in GBA 490",
      body: "",
      priority: "default",
    });

    expect(mapEvent("session_expired", {})).toEqual({
      eventType: "session_expired",
      title: "Blackboard signed out — sign in on the PC",
      body: "",
      priority: "high",
    });

    expect(mapEvent("job_failed", { type: "drafts_prep" })).toEqual({
      eventType: "job_failed",
      title: "Nova: drafts_prep failed",
      body: "",
      priority: "default",
    });

    expect(mapEvent("morning_briefing", {})).toEqual({
      eventType: "morning_briefing",
      title: "Morning brief ready",
      body: "",
      priority: "low",
    });
  });

  it("includes score on new_grade only when push_details is on", () => {
    expect(
      mapEvent("new_grade", { course: "GBA 490", score: 88, pointsPossible: 100 }, { pushDetails: false })
    ).toEqual({
      eventType: "new_grade",
      title: "New grade in GBA 490",
      body: "",
      priority: "default",
    });

    expect(
      mapEvent("new_grade", { course: "GBA 490", score: 88, pointsPossible: 100 }, { pushDetails: true })
    ).toEqual({
      eventType: "new_grade",
      title: "New grade in GBA 490",
      body: "88/100",
      priority: "default",
    });
  });

  it("strips detail-like body text when push_details is off", () => {
    const withDetails = mapEvent(
      "run_finished",
      { grades: 1, drafts: 0, detail: "Case 3 scored 88/100" },
      { pushDetails: true }
    );
    expect(withDetails.body).toContain("88/100");

    const stripped = mapEvent(
      "run_finished",
      { grades: 1, drafts: 0, detail: "Case 3 scored 88/100" },
      { pushDetails: false }
    );
    expect(stripped.body).toBe("");
  });
});

describe("createNotify.push", () => {
  it("POSTs to ntfy_url/ntfy_topic with Title, Priority, Click headers", async () => {
    const { notify, fetch, config } = makeNotify({ config: { pushDetails: true } });
    const result = await notify.push({
      title: "Morning brief ready",
      body: "open when you can",
      priority: "low",
      eventType: "morning_briefing",
    });

    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${config.ntfyUrl}/${config.ntfyTopic}`);
    expect(opts.method).toBe("POST");
    expect(opts.headers.Title).toBe("Morning brief ready");
    expect(opts.headers.Priority).toBe("low");
    expect(opts.headers.Click).toBe(config.clickUrl);
    expect(opts.body).toBe("open when you can");
  });

  it("uses click override when provided", async () => {
    const { notify, fetch } = makeNotify();
    await notify.push({
      title: "t",
      body: "",
      priority: "default",
      click: "https://other.example/",
      eventType: "notify_test",
    });
    expect(fetch.mock.calls[0][1].headers.Click).toBe("https://other.example/");
  });

  it("strips body when push_details is off at send time", async () => {
    const { notify, fetch } = makeNotify({ config: { pushDetails: false } });
    await notify.push({
      title: "New grade in GBA 490",
      body: "88/100 on Case 3",
      priority: "default",
      eventType: "new_grade",
    });
    expect(fetch.mock.calls[0][1].body).toBe("");
  });

  it("keeps body when push_details is on", async () => {
    const { notify, fetch } = makeNotify({ config: { pushDetails: true } });
    await notify.push({
      title: "New grade in GBA 490",
      body: "88/100 on Case 3",
      priority: "default",
      eventType: "new_grade",
    });
    expect(fetch.mock.calls[0][1].body).toBe("88/100 on Case 3");
  });

  it("never throws on network failure (job engine safe)", async () => {
    const { notify } = makeNotify({
      fetch: vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    });
    await expect(
      notify.push({ title: "t", body: "b", priority: "default", eventType: "job_failed" })
    ).resolves.toEqual({ ok: false, error: "ECONNRESET" });
  });

  it("never throws on non-ok HTTP status", async () => {
    const { notify } = makeNotify({
      fetch: vi.fn(async () => ({ ok: false, status: 429, statusText: "Too Many Requests" })),
    });
    const result = await notify.push({
      title: "t",
      body: "",
      priority: "default",
      eventType: "run_finished",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/429/);
  });

  it("skips send when topic is missing", async () => {
    const { notify, fetch } = makeNotify({ config: { ntfyTopic: "" } });
    const result = await notify.push({
      title: "t",
      body: "",
      priority: "default",
      eventType: "morning_briefing",
    });
    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("rate limit batching", () => {
  it("sends at most one push per event type per 2 minutes", async () => {
    const { notify, fetch, clock } = makeNotify();
    await notify.push({ title: "A", body: "", priority: "default", eventType: "new_grade" });
    await notify.push({ title: "B", body: "", priority: "default", eventType: "new_grade" });
    await notify.push({ title: "C", body: "", priority: "default", eventType: "new_grade" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers.Title).toBe("A");

    clock.advance(RATE_LIMIT_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].headers.Title).toBe("C +2 more");
  });

  it("batches extras into +N more using the latest title", async () => {
    const { notify, fetch, clock } = makeNotify();
    await notify.push({ title: "First", body: "", priority: "high", eventType: "session_expired" });
    await notify.push({ title: "Second", body: "x", priority: "high", eventType: "session_expired" });
    clock.advance(RATE_LIMIT_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    clock.advance(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    const [, opts] = fetch.mock.calls[1];
    expect(opts.headers.Title).toBe("Second +1 more");
    expect(opts.headers.Priority).toBe("high");
  });

  it("does not rate-limit different event types against each other", async () => {
    const { notify, fetch } = makeNotify();
    await notify.push({ title: "g", body: "", priority: "default", eventType: "new_grade" });
    await notify.push({ title: "d", body: "", priority: "default", eventType: "draft_ready" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("allows a fresh push after the window with no pending batch", async () => {
    const { notify, fetch, clock } = makeNotify();
    await notify.push({ title: "A", body: "", priority: "default", eventType: "draft_ready" });
    clock.advance(RATE_LIMIT_MS);
    await notify.push({ title: "B", body: "", priority: "default", eventType: "draft_ready" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].headers.Title).toBe("B");
  });

  it("rate-limit flush network errors do not throw", async () => {
    let calls = 0;
    const { notify, clock } = makeNotify({
      fetch: vi.fn(async () => {
        calls += 1;
        if (calls === 1) return { ok: true, status: 200 };
        throw new Error("offline");
      }),
    });
    await notify.push({ title: "A", body: "", priority: "default", eventType: "job_failed" });
    await notify.push({ title: "B", body: "", priority: "default", eventType: "job_failed" });
    expect(() => clock.advance(RATE_LIMIT_MS)).not.toThrow();
  });
});

describe("notifyEvent helper", () => {
  it("maps then pushes", async () => {
    const { notify, fetch } = makeNotify({ config: { pushDetails: true } });
    const result = await notify.notifyEvent("new_grade", {
      course: "OM 300",
      score: 90,
      pointsPossible: 100,
    });
    expect(result.ok).toBe(true);
    expect(fetch.mock.calls[0][1].headers.Title).toBe("New grade in OM 300");
    expect(fetch.mock.calls[0][1].body).toBe("90/100");
  });
});

describe("stop", () => {
  it("clears pending batch timers", async () => {
    const { notify, fetch, clock } = makeNotify();
    await notify.push({ title: "A", body: "", priority: "default", eventType: "run_finished" });
    await notify.push({ title: "B", body: "", priority: "default", eventType: "run_finished" });
    notify.stop();
    clock.advance(RATE_LIMIT_MS);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
