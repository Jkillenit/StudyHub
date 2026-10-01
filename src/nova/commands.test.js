import { describe, expect, it } from "vitest";
import { CHIPS, NEXT_SCENE, TALK, describeCommand, dueBetween, matchCourse, normalize, parseCommand } from "./commands.js";
import { unknownActions } from "./scenePlayer.js";
import { character } from "../companion/character.js";

const MIS = { id: "c1", name: "Business Information Systems", courseCode: "202640-MIS-430-001" };
const GBA = { id: "c2", name: "Strategic Management", courseCode: "GBA 490" };
const MKT = { id: "c3", name: "Marketing Principles", courseCode: "MKT 300" };
const courses = [MIS, GBA, MKT];
const p = (text) => parseCommand(text, { courses });

describe("command matcher", () => {
  it("matches courses by code, number and nickname", () => {
    expect(matchCourse("mis 430", courses)).toBe(MIS);
    expect(matchCourse("mis430", courses)).toBe(MIS);
    expect(matchCourse("the 490 one", courses)).toBe(GBA);
    expect(matchCourse("marketing", courses)).toBe(MKT);
    expect(matchCourse("strategy", courses)).toBe(GBA);
    expect(matchCourse("biology", courses)).toBe(null);
  });

  it("parses the examples from the design doc", () => {
    expect(p("quiz me on mis 430")).toEqual({ id: "quiz", course: MIS });
    expect(p("what's due tomorrow")).toEqual({ id: "due", days: [1, 1], when: "tomorrow" });
    expect(p("what do i need on the final for gba")).toEqual({ id: "need", course: GBA, item: "final" });
    expect(p("focus 50")).toEqual({ id: "focus", minutes: 50 });
    expect(p("put grades on the left")).toEqual({ id: "move", panel: "standing", slot: "left" });
    expect(p("open notes for marketing")).toEqual({ id: "open", course: MKT, tab: "notes" });
  });

  it("handles defaults, ranges and plain phrasing", () => {
    expect(p("focus")).toEqual({ id: "focus", minutes: 25 });
    expect(p("focus 500").minutes).toBe(120);
    expect(p("whats next").id).toBe("next");
    expect(p("what should I work on?").id).toBe("next");
    expect(p("tidy up")).toEqual({ id: "layout", name: "tidy" });
    expect(p("put it back")).toEqual({ id: "layout", name: "back" });
    expect(p("show me my grades")).toEqual({ id: "grades", course: null });
    expect(p("how am i doing in marketing")).toEqual({ id: "grades", course: MKT });
    expect(p("open calendar")).toEqual({ id: "view", view: "calendar" });
    expect(p("mkt 300")).toEqual({ id: "open", course: MKT, tab: null });
    expect(p("anything due today?")).toMatchObject({ id: "due", when: "today" });
  });

  it("forgives small typos", () => {
    expect(normalize("whats due tomorow")).toBe("whats due tomorrow");
    expect(p("quizz me").id).toBe("quiz");
    expect(p("flashcard drill on marketing")).toEqual({ id: "quiz", course: MKT });
  });

  it("knows small talk and gives up on nonsense", () => {
    expect(p("hey nova")).toEqual({ id: "talk", key: "hi" });
    expect(p("thank you!")).toEqual({ id: "talk", key: "thanks" });
    expect(p("I'm so tired")).toEqual({ id: "talk", key: "tired" });
    expect(p("you're annoying")).toEqual({ id: "talk", key: "annoying" });
    expect(p("purple monkey dishwasher")).toBe(null);
  });

  it("lists what's due in a range, soonest first", () => {
    const now = new Date(2026, 8, 20, 12);
    const on = (d) => new Date(2026, 8, 20 + d, 23, 59).toISOString();
    const data = {
      courses: [
        { uuid: "c1", courseCode: "MIS 430", assignments: [{ title: "Lab", dueDate: on(1) }, { title: "Done", dueDate: on(1), completed: true }] },
        { uuid: "c2", courseCode: "GBA 490", assignments: [{ title: "Essay", dueDate: on(0) }, { title: "Later", dueDate: on(9) }] },
      ],
    };
    expect(dueBetween(data, [1, 1], now).map((x) => x.title)).toEqual(["Lab"]);
    expect(dueBetween(data, [0, 6], now).map((x) => `${x.title}/${x.course}`)).toEqual(["Essay/GBA 490", "Lab/MIS 430"]);
    expect(dueBetween(data, [0, 6], now, "c1").map((x) => x.title)).toEqual(["Lab"]);
  });

  it("every chip parses to a describable command", () => {
    for (const chip of CHIPS) expect(describeCommand(p(chip.text)), chip.text).toBeTruthy();
  });

  it("every small-talk key and the what's-next scene have lines", () => {
    for (const [, key] of TALK) expect(character.lines[`talk.${key}`], key).toBeTruthy();
    expect(unknownActions(NEXT_SCENE.steps)).toEqual([]);
  });
});
