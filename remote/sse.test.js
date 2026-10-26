import { describe, expect, it, vi } from "vitest";
import { feedSse, connectJobStream } from "./sse.js";

describe("feedSse", () => {
  it("parses job.updated and briefing.ready events", () => {
    const events = [];
    let buf = { event: "message", data: "" };
    buf = feedSse(
      'event: job.updated\ndata: {"id":"j1","status":"running"}\n\n',
      buf,
      (e, d) => events.push([e, d]),
    );
    buf = feedSse(
      "event: briefing.ready\ndata: {\"headline\":\"Hi\"}\n\n",
      buf,
      (e, d) => events.push([e, d]),
    );
    expect(events).toEqual([
      ["job.updated", { id: "j1", status: "running" }],
      ["briefing.ready", { headline: "Hi" }],
    ]);
  });

  it("ignores comment lines used as keepalives", () => {
    const events = [];
    feedSse(": connected\n\n", { event: "message", data: "" }, (e, d) => events.push([e, d]));
    expect(events).toEqual([]);
  });
});

describe("connectJobStream", () => {
  it("sends Bearer and forwards parsed events", async () => {
    const chunks = [
      new TextEncoder().encode('event: job.updated\ndata: {"id":"a"}\n\n'),
    ];
    let i = 0;
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      body: {
        getReader() {
          return {
            async read() {
              if (i >= chunks.length) return { done: true, value: undefined };
              const value = chunks[i];
              i += 1;
              return { done: false, value };
            },
          };
        },
      },
    }));
    const events = [];
    await connectJobStream({
      baseUrl: "https://pc.ts.net",
      token: "tok",
      fetchImpl,
      onEvent: (e, d) => events.push([e, d]),
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://pc.ts.net/api/stream",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
    expect(events).toEqual([["job.updated", { id: "a" }]]);
  });
});
