import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./studyhub-bootstrap.css", import.meta.url), "utf8");
const start = css.indexOf(":root {");
const root = css.slice(start, css.indexOf("}", start));
const token = (name) => root.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();

describe("design tokens", () => {
  it("uses the aqua/magenta palette on true black", () => {
    expect(token("sh-bg")).toBe("#04050A");
    expect(token("sh-accent")).toBe("#4CF0E8");
    expect(token("sh-accent-2")).toBe("#FF4FD8");
    expect(token("sh-danger")).toBe("#FF4D4F");
    expect(token("sh-warn")).toBe("#FFC857");
  });

  it("uses Geist and Michroma", () => {
    expect(token("sh-font-body")).toMatch(/^"Geist Sans"/);
    expect(token("sh-font-mono")).toMatch(/^"Geist Mono"/);
    expect(token("sh-font-display")).toMatch(/^"Michroma"/);
    expect(css).not.toMatch(/Manrope|Chakra Petch|JetBrains Mono/);
  });

  it("has no rounded corners", () => {
    for (const r of ["xl", "lg", "md", "sm", "xs"]) expect(token(`sh-radius-${r}`)).toBe("0");
    const literals = [...css.matchAll(/border(?:-(?:top|bottom)-(?:left|right))?-radius:\s*([^;]+);/g)]
      .map((m) => m[1].trim())
      .filter((v) => !/^(0|inherit|var\(--sh-radius-[a-z]+\))( !important)?$/.test(v));
    expect(literals).toEqual([]);
  });

  it("drops the background grid", () => {
    expect(css).not.toMatch(/--sh-grid-line/);
  });

  it("leaves no old palette behind", () => {
    expect(css).not.toMatch(/79,\s*216,\s*255|#4FD8FF/i);
  });

  it("defines the secondary and chamfer tokens", () => {
    expect(token("sh-side")).toBe("#030407");
    expect(token("sh-accent-2-soft")).toMatch(/^color-mix/);
    expect(token("sh-accent-2-line")).toMatch(/^color-mix/);
    expect(token("sh-cut")).toBe("12px");
  });
});
