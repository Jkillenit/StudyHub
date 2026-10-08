import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./studyhub-bootstrap.css", import.meta.url), "utf8");
const start = css.indexOf(":root {");
const root = css.slice(start, css.indexOf("}", start));
const token = (name) => root.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();

describe("design tokens", () => {
  it("uses ice aqua on graphite", () => {
    expect(token("sh-bg")).toBe("#000000");
    expect(token("sh-accent")).toBe("#86E1DE");
    expect(token("sh-accent-2")).toBe("var(--sh-text-3)");
    expect(token("sh-danger")).toBe("#E5686A");
    expect(token("sh-warn")).toBe("#E3BE72");
  });

  it("gives Nova her own royal blue", () => {
    expect(token("sh-nova")).toBe("#3F7BFF");
    expect(token("sh-nova-soft")).toMatch(/^color-mix\(in oklab, var\(--sh-nova\)/);
  });

  it("uses Geist for everything", () => {
    expect(token("sh-font-body")).toMatch(/^"Geist Sans"/);
    expect(token("sh-font-mono")).toMatch(/^"Geist Mono"/);
    expect(token("sh-font-display")).toMatch(/^"Geist Sans"/);
    expect(css).not.toMatch(/Michroma|Manrope|Chakra Petch|JetBrains Mono/);
  });

  it("uses the small radius scale", () => {
    expect(token("sh-radius-sm")).toBe("6px");
    expect(token("sh-radius-md")).toBe("10px");
    expect(token("sh-radius-lg")).toBe("14px");
    const literals = [...css.matchAll(/border(?:-(?:top|bottom)-(?:left|right))?-radius:\s*([^;]+);/g)]
      .map((m) => m[1].trim())
      .filter((v) => !/^(0|50%|999px|inherit|var\(--sh-radius-[a-z]+\))( !important)?$/.test(v));
    expect(literals).toEqual([]);
  });

  it("drops the background grid", () => {
    expect(css).not.toMatch(/--sh-grid-line/);
  });

  it("leaves no old palette or HUD chrome behind", () => {
    expect(css).not.toMatch(/79,\s*216,\s*255|#4FD8FF|#4CF0E8|#FF4FD8/i);
    expect(css).not.toMatch(/\.sh-cut\b|\.sh-hex\b|\.sh-bracket\b|\.nv-scan\b|\.nv-sweep\b/);
  });

  it("drops the chamfer", () => {
    expect(token("sh-side")).toBe("#000000");
    expect(token("sh-accent-2-soft")).toMatch(/^color-mix/);
    expect(token("sh-cut")).toBe("0");
  });
});
