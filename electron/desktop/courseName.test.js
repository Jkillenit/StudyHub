import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { shortCourse as appRule } from "../../src/features/dashboard/courseLabel.js";

const { shortCourse } = createRequire(import.meta.url)("./courseName.cjs");

describe("shortCourse (desktop copy)", () => {
  it("matches the app's rule", () => {
    for (const s of ["202640-MIS-430-001", "OM 300", "GBA490", "Operations Management", "202610_MKT_300_002", "", "FIN-302A-01"]) {
      expect(shortCourse(s)).toBe(appRule(s));
    }
    expect(shortCourse("202640-MIS-430-001")).toBe("MIS 430");
  });
});
