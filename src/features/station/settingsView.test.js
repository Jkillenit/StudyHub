import { describe, expect, it } from "vitest";
import { DRAFT_MODES, buildSettingsView } from "./settingsView.js";

const courses = [
  { uuid: "c1", name: "GBA 490 Strategic Management", courseCode: "GBA 490" },
  { uuid: "c2", name: "OM 300", courseCode: "OM 300" },
];

describe("buildSettingsView", () => {
  it("defaults when settings are empty", () => {
    const view = buildSettingsView({}, courses);
    expect(view.enabled).toBe(false);
    expect(view.hasToken).toBe(false);
    expect(view.ntfyUrl).toBe("https://ntfy.sh");
    expect(view.pushDetails).toBe(false);
    expect(view.aiCapCents).toBe(150);
    expect(view.cloudModel).toBe("claude-sonnet-5-5");
    expect(view.preferLocal).toBe(true);
    expect(view.localModel).toBe("llama3.2");
    expect(view.allowOpus).toBe(false);
    expect(view.morningBriefAt).toBe("06:45");
  });

  it("parses stored settings and per-course draft modes", () => {
    const view = buildSettingsView(
      {
        enabled: "1",
        tokenHash: "abc",
        ntfyUrl: "https://ntfy.sh",
        ntfyTopic: "secret-topic",
        pushDetails: "1",
        aiCapCents: "200",
        cloudModel: "claude-sonnet-5-5",
        preferLocal: "0",
        localModel: "llama3.2",
        allowOpus: "1",
        morningBriefAt: "07:00",
        draftModes: { c1: "outline", c2: "off" },
      },
      courses,
    );
    expect(view.enabled).toBe(true);
    expect(view.hasToken).toBe(true);
    expect(view.pushDetails).toBe(true);
    expect(view.aiCapCents).toBe(200);
    expect(view.preferLocal).toBe(false);
    expect(view.allowOpus).toBe(true);
    expect(view.ntfyTopic).toBe("secret-topic");
    expect(view.courseDraftModes).toEqual([
      { courseUuid: "c1", name: "GBA 490 Strategic Management", mode: "outline" },
      { courseUuid: "c2", name: "OM 300", mode: "off" },
    ]);
  });

  it("keeps a zero AI cap instead of falling back to 150", () => {
    expect(buildSettingsView({ aiCapCents: 0 }).aiCapCents).toBe(0);
    expect(buildSettingsView({ aiCapCents: "0" }).aiCapCents).toBe(0);
  });

  it("defaults unset course draft modes to outline", () => {
    const view = buildSettingsView({}, courses);
    expect(view.courseDraftModes.every((c) => c.mode === "outline")).toBe(true);
  });
});

describe("DRAFT_MODES", () => {
  it("is the frozen per-course allowlist", () => {
    expect(DRAFT_MODES).toEqual(["off", "outline", "rough_draft"]);
  });
});
