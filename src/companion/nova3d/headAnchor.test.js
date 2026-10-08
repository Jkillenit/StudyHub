import { describe, expect, it } from "vitest";
import { headAnchor } from "./headAnchor.js";

const cam = { left: -0.9, right: 0.9, top: 1.8, bottom: 0 };

describe("headAnchor", () => {
  it("maps world units to box pixels", () => {
    expect(headAnchor({ x: 0, y: 1.4 }, cam, 180)).toEqual({ x: 90, y: 40 });
  });

  it("adds the seated canvas drop", () => {
    expect(headAnchor({ x: 0, y: 1.4 }, cam, 180, { seat: 0.27 })).toEqual({ x: 90, y: 89 });
  });

  it("mirrors x when the canvas is flipped", () => {
    expect(headAnchor({ x: 0.45, y: 1.4 }, cam, 180)).toEqual({ x: 135, y: 40 });
    expect(headAnchor({ x: 0.45, y: 1.4 }, cam, 180, { flipped: true })).toEqual({ x: 45, y: 40 });
  });
});
