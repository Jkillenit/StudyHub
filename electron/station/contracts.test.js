import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const {
  JOB_TYPES,
  JOB_STATUS,
  RUN_PRESETS,
  EVENTS,
  isJobType,
  expandPreset,
  validateBriefing,
} = createRequire(import.meta.url)("./contracts.cjs");

describe("station contracts", () => {
  it("freezes the job allowlist", () => {
    expect(Object.isFrozen(JOB_TYPES)).toBe(true);
    expect([...JOB_TYPES].sort()).toEqual([
      "bb_sync",
      "briefing_build",
      "drafts_prep",
      "health_check",
      "instructions_sync",
      "notify_test",
    ]);
  });

  it("rejects unknown job types", () => {
    expect(isJobType("bb_sync")).toBe(true);
    expect(isJobType("submit_assignment")).toBe(false);
  });

  it.each(Object.keys(RUN_PRESETS))("preset %s expands to allowlisted types only", (preset) => {
    const types = expandPreset(preset);
    expect(types.length).toBeGreaterThan(0);
    for (const t of types) expect(isJobType(t)).toBe(true);
  });

  it("maps presets to the briefing order", () => {
    expect(expandPreset("full")).toEqual([
      "bb_sync",
      "instructions_sync",
      "drafts_prep",
      "briefing_build",
    ]);
    expect(expandPreset("sync")).toEqual(["bb_sync", "briefing_build"]);
    expect(expandPreset("drafts")).toEqual([
      "instructions_sync",
      "drafts_prep",
      "briefing_build",
    ]);
    expect(expandPreset("briefing")).toEqual(["briefing_build"]);
  });

  it("throws on unknown preset", () => {
    expect(() => expandPreset("nuke")).toThrow(/preset/i);
  });

  it("lists SSE/IPC events", () => {
    expect([...EVENTS].sort()).toEqual([
      "briefing.ready",
      "job.event",
      "job.updated",
      "session.changed",
    ]);
  });

  it("validateBriefing accepts a minimal valid object", () => {
    const briefing = {
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
    expect(validateBriefing(briefing)).toEqual({ ok: true });
  });

  it("validateBriefing rejects bad kind / missing keys", () => {
    expect(validateBriefing(null).ok).toBe(false);
    expect(validateBriefing({ kind: "nope" }).ok).toBe(false);
  });
});
