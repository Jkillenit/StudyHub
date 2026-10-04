import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./courseView.js", () => ({ openCourseView: vi.fn() }));
vi.mock("../mirror/openInBlackboard.js", () => ({ openInBlackboard: vi.fn() }));

const { openCourseView } = await import("./courseView.js");
const { runTodayAction } = await import("./runAction.js");

describe("runTodayAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens the deck with the exam for an exam review", () => {
    const open = vi.fn();
    runTodayAction({ type: "review", courseUuid: "c1", examUuid: "e1", label: "START REVIEW" }, open);
    expect(openCourseView).toHaveBeenCalledWith(open, "c1", { item: "qz-deck", examUuid: "e1" });
  });

  it("opens the plain deck for a review without an exam", () => {
    const open = vi.fn();
    runTodayAction({ type: "review", courseUuid: "c1", label: "START REVIEW" }, open);
    expect(openCourseView).toHaveBeenCalledWith(open, "c1", { item: "qz-deck" });
  });
});
