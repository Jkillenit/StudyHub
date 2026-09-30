import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { examKey, parseExamCoverage, modulesForRefs, suggestionFor } = createRequire(import.meta.url)("./examCoverage.cjs");

describe("examKey", () => {
  it.each([
    ["Exam 1", "exam1"],
    ["Exam #2 (online)", "exam2"],
    ["Exam II", "exam2"],
    ["Test 3", "exam3"],
    ["Midterm", "midterm"],
    ["Midterm Exam", "midterm"],
    ["Mid-term 2", "midterm2"],
    ["Final Exam", "final"],
    ["Final", "final"],
    ["Cumulative Final Examination", "final"],
    ["Exam", "exam"],
    ["Final Project", null],
    ["Homework 4", null],
    ["Exam in class", "exam"],
  ])("%s → %s", (title, key) => {
    expect(examKey(title)).toBe(key);
  });
});

describe("parseExamCoverage", () => {
  it("reads chapters, ranges and lists after each label", () => {
    const rules = parseExamCoverage(
      [
        "Exam 1: Chapters 1-4 (Oct 3)",
        "Exam 2 — Oct 31 — covers Ch. 5, 6 and 8",
        "Midterm (Modules 3 through 5)",
        "Final Exam: cumulative",
      ].join("\n")
    );
    expect(rules).toEqual([
      { key: "exam1", refs: [1, 2, 3, 4], cumulative: false },
      { key: "exam2", refs: [5, 6, 8], cumulative: false },
      { key: "midterm", refs: [3, 4, 5], cumulative: false },
      { key: "final", refs: [], cumulative: true },
    ]);
  });

  it("keeps two exams on one line apart", () => {
    const rules = parseExamCoverage("Exam 1 covers chapters 1-3; Exam 2 covers chapters 4-6.");
    expect(rules.map((r) => [r.key, r.refs])).toEqual([
      ["exam1", [1, 2, 3]],
      ["exam2", [4, 5, 6]],
    ]);
  });

  it("uses the first mention with coverage and ignores mentions without it", () => {
    const rules = parseExamCoverage("Exam 1 is worth 20%.\nWeek 6: Exam 1 over units 1-2\nExam 1 review: chapter 9");
    expect(rules).toEqual([{ key: "exam1", refs: [1, 2], cumulative: false }]);
  });

  it("does not read chapter numbers out of ordinary words", () => {
    expect(parseExamCoverage("Exam 1: each 3 questions, approach 2")).toEqual([]);
  });

  it("returns nothing for text without exams", () => {
    expect(parseExamCoverage("Homework 20%\nQuizzes 10%")).toEqual([]);
    expect(parseExamCoverage("")).toEqual([]);
  });
});

describe("modulesForRefs", () => {
  const modules = [
    { uuid: "m1", title: "Chapter 1 - Intro" },
    { uuid: "m2", title: "Ch2 Forecasting" },
    { uuid: "m3", title: "OM300_ch03_Capacity.pptx" },
    { uuid: "m12", title: "Chapter 12 Quality" },
    { uuid: "m5", title: "05 Inventory" },
    { uuid: "g", title: "General" },
  ];

  it("matches keyword numbers, then leading numbers, never partial digits", () => {
    expect(modulesForRefs([1, 2, 3], modules)).toEqual(["m1", "m2", "m3"]);
    expect(modulesForRefs([12], modules)).toEqual(["m12"]);
    expect(modulesForRefs([5], modules)).toEqual(["m5"]);
    expect(modulesForRefs([7], modules)).toEqual([]);
  });

  it("builds a suggestion only when something resolves", () => {
    const rules = [
      { key: "exam1", refs: [1, 2], cumulative: false },
      { key: "exam2", refs: [7], cumulative: false },
      { key: "final", refs: [], cumulative: true },
    ];
    expect(suggestionFor("Exam 1", rules, modules)).toEqual({ moduleIds: ["m1", "m2"], cumulative: false });
    expect(suggestionFor("Exam 2", rules, modules)).toBeNull();
    expect(suggestionFor("Final Exam", rules, modules)).toEqual({ moduleIds: [], cumulative: true });
    expect(suggestionFor("Quiz 1", rules, modules)).toBeNull();
  });
});
