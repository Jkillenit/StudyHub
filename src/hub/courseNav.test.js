import { describe, expect, it } from "vitest";
import { builtinCourseNav, userCourseNav } from "./courseNav.js";
import { STUDY_CHAPTERS } from "../study/chapters.js";

const course = {
  modules: [
    { id: "m1", label: "Notes 1", title: "Requirements" },
    { id: "m2", label: "Notes 2", title: "Use cases" },
  ],
  disabledModuleIds: ["m2"],
};

describe("userCourseNav", () => {
  it("lists non-disabled modules with two-digit prefixes and completion", () => {
    const [modules] = userCourseNav(course, { completedIds: ["m1"] });
    expect(modules.key).toBe("modules");
    expect(modules.label).toBeNull();
    expect(modules.tourId).toBe("course-modules");
    expect(modules.items).toHaveLength(1);
    expect(modules.items[0]).toMatchObject({ id: "module:m1", prefix: "01", label: "Requirements", complete: true });
  });

  it("orders groups modules, course, study with their tour ids and prefixes", () => {
    const groups = userCourseNav(course);
    expect(groups.map((g) => [g.key, g.label, g.tourId])).toEqual([
      ["modules", null, "course-modules"],
      ["course", "Course", "course-mirror"],
      ["study", "Study", "course-drill"],
    ]);
    expect(groups[1].items.map((i) => i.prefix)).toEqual(["AS", "AN", "BB"]);
    expect(groups[2].items.map((i) => i.prefix)).toEqual(["QZ", "PT", "SG", "ST"]);
    expect(groups[0].items[0].complete).toBe(false);
  });

  it("maps truthy badges onto items", () => {
    const groups = userCourseNav(course, { badges: { "qz-deck": 7, "course-assignments": "2", "study-test": 0 } });
    const all = groups.flatMap((g) => g.items);
    expect(all.find((i) => i.id === "qz-deck").badge).toBe(7);
    expect(all.find((i) => i.id === "course-assignments").badge).toBe("2");
    expect(all.find((i) => i.id === "study-test").badge).toBeUndefined();
  });

  it("tolerates a course without modules", () => {
    expect(userCourseNav({})[0].items).toEqual([]);
  });
});

describe("builtinCourseNav", () => {
  const ids = ["ch1", "ch6s", "final", "flashcards"];
  const chapters = STUDY_CHAPTERS.filter((c) => ids.includes(c.id));

  it("builds module, reference and study groups from the visible chapters", () => {
    const groups = builtinCourseNav({ chapters, completedIds: ["ch6s"] });
    expect(groups.map((g) => [g.key, g.label, g.tourId])).toEqual([
      ["mod", null, "course-modules"],
      ["ref", "Reference", "course-mirror"],
      ["drill", "Study", "course-drill"],
    ]);
    const [mod, ref, drill] = groups;
    expect(mod.items).toEqual([
      { id: "ch1", prefix: "01", label: "Operations & Strategy", complete: false },
      { id: "ch6s", prefix: "06S", label: "SPC", complete: true },
    ]);
    expect(ref.items).toEqual([{ id: "final", prefix: "FR", label: "Final Review & Glossary", complete: false, tone: "amber" }]);
    expect(drill.items).toEqual([{ id: "flashcards", prefix: "QZ", label: "Flashcards & drill", complete: false, tone: "accent" }]);
  });

  it("omits chapters not in the visible list", () => {
    const all = builtinCourseNav({ chapters }).flatMap((g) => g.items);
    expect(all.some((i) => i.id === "formulas")).toBe(false);
  });
});
