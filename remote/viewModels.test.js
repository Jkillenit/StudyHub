import { describe, expect, it } from "vitest";
import {
  RUN_PRESET_OPTIONS,
  isRunPreset,
  briefingSections,
  cardPrimaryText,
  cardMetaText,
  sortJobs,
  upsertJob,
  parseTokenInput,
  sessionLine,
} from "./viewModels.js";

const sampleBriefing = {
  generatedAt: "2026-10-26T06:45:00-05:00",
  kind: "run",
  headline: "Two new grades, one draft ready.",
  session: { blackboard: "ok", lastSyncAt: "2026-10-26T06:40:00-05:00" },
  newGrades: [{ course: "GBA 490", title: "Case 3", score: 88, pointsPossible: 100 }],
  dueSoon: [{ course: "OM 300", title: "Quiz", dueAt: "2026-10-26T20:00:00-05:00", state: "not_started" }],
  draftsReady: [{ draftId: "d1", course: "GBA 490", title: "Case 4", mode: "outline", checks: 3 }],
  needsYou: [{ kind: "review_draft", text: "Review GBA 490 Case 4 outline", ref: "d1" }],
  announcements: [{ course: "MIS 430", title: "Office hours", postedAt: "2026-10-25T12:00:00-05:00" }],
  jobs: { ran: 4, failed: 0, failures: [] },
  aiSpend: { todayCents: 23, capCents: 150 },
};

describe("run presets", () => {
  it("lists the four BRIEFING presets", () => {
    expect(RUN_PRESET_OPTIONS.map((p) => p.id)).toEqual(["full", "sync", "drafts", "briefing"]);
    expect(isRunPreset("full")).toBe(true);
    expect(isRunPreset("nope")).toBe(false);
  });
});

describe("briefingSections", () => {
  it("returns ordered card sections with items", () => {
    const sections = briefingSections(sampleBriefing);
    expect(sections.map((s) => s.id)).toEqual([
      "needsYou",
      "newGrades",
      "dueSoon",
      "draftsReady",
      "announcements",
    ]);
    expect(sections[0].items).toHaveLength(1);
    expect(cardPrimaryText(sections[0].items[0], "needsYou")).toMatch(/Case 4/);
    expect(cardMetaText(sampleBriefing.newGrades[0], "newGrades")).toBe("88 / 100");
  });

  it("returns empty list for missing briefing", () => {
    expect(briefingSections(null)).toEqual([]);
  });
});

describe("jobs list helpers", () => {
  it("sorts running before queued before done", () => {
    const sorted = sortJobs([
      { id: "a", status: "done", created_at: "2026-10-26T01:00:00.000Z" },
      { id: "b", status: "running", created_at: "2026-10-26T00:00:00.000Z" },
      { id: "c", status: "queued", created_at: "2026-10-26T02:00:00.000Z" },
    ]);
    expect(sorted.map((j) => j.id)).toEqual(["b", "c", "a"]);
  });

  it("upserts job.updated payloads", () => {
    const next = upsertJob(
      [{ id: "j1", status: "queued", progress: 0, created_at: "2026-10-26T00:00:00.000Z" }],
      { id: "j1", status: "running", progress: 40 },
    );
    expect(next[0].status).toBe("running");
    expect(next[0].progress).toBe(40);
  });
});

describe("parseTokenInput", () => {
  it("extracts token from a dashboard URL", () => {
    const parsed = parseTokenInput("https://home.ts.net/?token=secret-value");
    expect(parsed.token).toBe("secret-value");
    expect(parsed.baseUrl).toBe("https://home.ts.net");
  });

  it("treats bare text as the token", () => {
    expect(parseTokenInput("  bare-token  ")).toEqual({ token: "bare-token", baseUrl: "" });
  });
});

describe("sessionLine", () => {
  it("flags offline and expired session", () => {
    expect(sessionLine(sampleBriefing, { offline: true })).toMatch(/Offline/);
    expect(
      sessionLine({ ...sampleBriefing, session: { blackboard: "expired", lastSyncAt: null } }),
    ).toMatch(/signed out/i);
  });
});
