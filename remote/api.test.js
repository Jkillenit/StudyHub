import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api.js";

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(data);
    },
    async json() {
      return data;
    },
  };
}

describe("createApiClient", () => {
  it("sends Bearer on briefing and run", async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).endsWith("/api/briefing")) {
        return jsonResponse({ headline: "Hi", kind: "morning" });
      }
      if (String(url).endsWith("/api/run")) {
        return jsonResponse({ runId: "r1", jobIds: ["j1"] });
      }
      return jsonResponse({ error: "nope" }, 404);
    });
    const api = createApiClient({
      baseUrl: "https://pc.ts.net",
      getToken: () => "secret",
      fetchImpl,
    });
    await api.getBriefing();
    await api.startRun("full");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://pc.ts.net/api/briefing",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const briefingHeaders = fetchImpl.mock.calls[0][1].headers;
    expect(briefingHeaders.get("Authorization")).toBe("Bearer secret");
    const runCall = fetchImpl.mock.calls[1];
    expect(runCall[0]).toBe("https://pc.ts.net/api/run");
    expect(JSON.parse(runCall[1].body)).toEqual({ preset: "full" });
  });

  it("rejects unknown presets before fetch", async () => {
    const fetchImpl = vi.fn();
    const api = createApiClient({ getToken: () => "t", fetchImpl });
    await expect(api.startRun("explode")).rejects.toMatchObject({ message: "invalid_preset" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces 401", async () => {
    const api = createApiClient({
      getToken: () => "bad",
      fetchImpl: vi.fn(async () => jsonResponse({ error: "unauthorized" }, 401)),
    });
    await expect(api.getHealth()).rejects.toMatchObject({ status: 401 });
  });
});
