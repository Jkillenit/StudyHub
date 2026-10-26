import { describe, expect, it } from "vitest";
import { RUN_PRESET_OPTIONS, buildJobsView, jobStatusTone } from "./jobsView.js";

const job = (overrides = {}) => ({
  id: "j1",
  type: "bb_sync",
  status: "queued",
  source: "desktop",
  progress: 0,
  summary: null,
  error: null,
  created_at: "2026-10-26 12:00:00",
  ...overrides,
});

describe("buildJobsView", () => {
  it("returns empty lists for no jobs", () => {
    expect(buildJobsView([])).toEqual({ active: [], recent: [], rows: [] });
    expect(buildJobsView(null).rows).toEqual([]);
  });

  it("marks queued and running as active and cancellable", () => {
    const view = buildJobsView([
      job({ id: "a", status: "running", progress: 40, summary: "syncing" }),
      job({ id: "b", status: "queued" }),
      job({ id: "c", status: "done", progress: 100, summary: "ok" }),
    ]);
    expect(view.active.map((r) => r.id)).toEqual(["a", "b"]);
    expect(view.active.every((r) => r.canCancel)).toBe(true);
    expect(view.recent.map((r) => r.id)).toEqual(["c"]);
    expect(view.recent[0].canCancel).toBe(false);
  });

  it("keeps a flat rows list newest-first when created_at differs", () => {
    const view = buildJobsView([
      job({ id: "old", created_at: "2026-10-26 10:00:00", status: "done" }),
      job({ id: "new", created_at: "2026-10-26 12:00:00", status: "failed", error: "boom" }),
    ]);
    expect(view.rows.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("copies type, status, progress, summary, and error onto rows", () => {
    const [row] = buildJobsView([
      job({ type: "briefing_build", status: "needs_you", progress: 50, summary: "AI cap", error: "cap" }),
    ]).rows;
    expect(row).toMatchObject({
      type: "briefing_build",
      status: "needs_you",
      progress: 50,
      summary: "AI cap",
      error: "cap",
      label: expect.stringMatching(/briefing/i),
    });
  });
});

describe("jobStatusTone", () => {
  it("maps statuses to panel tones", () => {
    expect(jobStatusTone("failed")).toBe("danger");
    expect(jobStatusTone("needs_you")).toBe("warn");
    expect(jobStatusTone("done")).toBe("ok");
    expect(jobStatusTone("running")).toBe("accent");
    expect(jobStatusTone("queued")).toBe("muted");
  });
});

describe("RUN_PRESET_OPTIONS", () => {
  it("lists the four frozen presets", () => {
    expect(RUN_PRESET_OPTIONS.map((p) => p.id)).toEqual(["full", "sync", "drafts", "briefing"]);
  });
});
