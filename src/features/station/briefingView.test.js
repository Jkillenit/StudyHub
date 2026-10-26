import { describe, expect, it } from "vitest";
import { buildBriefingView } from "./briefingView.js";

const base = {
  generatedAt: "2026-10-26T06:45:00-05:00",
  kind: "morning",
  headline: "Two new grades, one draft ready, OM 300 quiz tonight.",
  session: { blackboard: "ok", lastSyncAt: "2026-10-26T06:40:00-05:00" },
  newGrades: [{ course: "GBA 490", title: "Case 3", score: 88, pointsPossible: 100, changed: false }],
  dueSoon: [
    {
      course: "OM 300",
      title: "Quiz 4",
      dueAt: "2026-10-26T20:00:00-05:00",
      state: "not_started",
      draftId: null,
    },
  ],
  draftsReady: [{ draftId: "d1", course: "GBA 490", title: "Case 4", mode: "outline", checks: 3 }],
  needsYou: [{ kind: "review_draft", text: "Review GBA 490 Case 4 outline", ref: "d1" }],
  announcements: [{ course: "MIS 430", title: "Office hours moved", postedAt: "2026-10-25T12:00:00Z" }],
  jobs: { ran: 4, failed: 0, failures: [] },
  aiSpend: { todayCents: 23, capCents: 150 },
};

describe("buildBriefingView", () => {
  it("returns null for missing briefing", () => {
    expect(buildBriefingView(null)).toBeNull();
    expect(buildBriefingView(undefined)).toBeNull();
  });

  it("keeps headline and kind for Nova and the panel header", () => {
    const view = buildBriefingView(base);
    expect(view.headline).toBe(base.headline);
    expect(view.kind).toBe("morning");
    expect(view.generatedAt).toBe(base.generatedAt);
  });

  it("labels session state for the panel", () => {
    expect(buildBriefingView(base).session.label).toMatch(/ok|synced/i);
    expect(buildBriefingView({ ...base, session: { blackboard: "expired", lastSyncAt: null } }).session.label).toMatch(
      /sign.?in|expired/i,
    );
  });

  it("orders sections needsYou first, then grades, drafts, due, announcements", () => {
    const ids = buildBriefingView(base).sections.map((s) => s.id);
    expect(ids[0]).toBe("needsYou");
    expect(ids).toEqual(["needsYou", "newGrades", "draftsReady", "dueSoon", "announcements"]);
  });

  it("skips empty sections", () => {
    const view = buildBriefingView({
      ...base,
      newGrades: [],
      announcements: [],
      draftsReady: [],
      dueSoon: [],
      needsYou: [{ kind: "sign_in", text: "Sign in to Blackboard", ref: null }],
    });
    expect(view.sections.map((s) => s.id)).toEqual(["needsYou"]);
  });

  it("formats grade and draft rows for display", () => {
    const view = buildBriefingView(base);
    const grades = view.sections.find((s) => s.id === "newGrades");
    expect(grades.items[0].primary).toContain("Case 3");
    expect(grades.items[0].secondary).toMatch(/88/);
    const drafts = view.sections.find((s) => s.id === "draftsReady");
    expect(drafts.items[0].primary).toContain("Case 4");
    expect(drafts.items[0].secondary).toMatch(/outline/i);
  });

  it("exposes jobs and AI spend summaries", () => {
    const view = buildBriefingView(base);
    expect(view.jobsSummary).toMatch(/4/);
    expect(view.aiSpend.label).toMatch(/23/);
    expect(view.aiSpend.capCents).toBe(150);
  });

  it("surfaces failed jobs in the summary", () => {
    const view = buildBriefingView({
      ...base,
      jobs: { ran: 4, failed: 1, failures: [{ type: "drafts_prep", error: "cap" }] },
    });
    expect(view.jobsSummary).toMatch(/fail/i);
  });
});
