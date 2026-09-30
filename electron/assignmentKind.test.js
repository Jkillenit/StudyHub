import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { assignmentKind } = createRequire(import.meta.url)("./assignmentKind.cjs");

describe("assignmentKind", () => {
  it.each([
    ["Exam 1", "exam"],
    ["Midterm", "exam"],
    ["Final Exam", "exam"],
    ["Final", "exam"],
    ["Unit Test 2", "exam"],
    ["Quiz 3", "quiz"],
    ["Chapter 4 Quizzes", "quiz"],
    ["Quiz 5 - Exam Review", "quiz"],
    ["Final Project", "assignment"],
    ["Final Paper", "assignment"],
    ["Practice Test", "assignment"],
    ["Homework 2", "assignment"],
    ["Contest entry", "assignment"],
    ["", "assignment"],
  ])("%s → %s", (name, kind) => {
    expect(assignmentKind(name)).toBe(kind);
  });
});
