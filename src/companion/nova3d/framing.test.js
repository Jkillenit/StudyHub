import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { boxPx, frameCamera } from "./framing.js";

const cam = new THREE.PerspectiveCamera();
frameCamera(cam, 0, 1.8, 22);

describe("frameCamera", () => {
  it("shows exactly the frame on the body plane", () => {
    const bottom = new THREE.Vector3(0, 0, 0).project(cam);
    const top = new THREE.Vector3(0, 1.8, 0).project(cam);
    const side = new THREE.Vector3(0.9, 0.9, 0).project(cam);
    expect(bottom.y).toBeCloseTo(-1, 5);
    expect(top.y).toBeCloseTo(1, 5);
    expect(side.x).toBeCloseTo(1, 5);
  });

  it("keeps her whole depth inside the clip range", () => {
    const near = new THREE.Vector3(0, 0.9, 0.9).project(cam);
    const far = new THREE.Vector3(0, 0.9, -0.9).project(cam);
    expect(Math.abs(near.z)).toBeLessThan(1);
    expect(Math.abs(far.z)).toBeLessThan(1);
  });
});

describe("boxPx", () => {
  it("maps the body plane linearly to box pixels", () => {
    expect(boxPx(new THREE.Vector3(0, 1.4, 0), cam, 180)).toEqual({ x: 90, y: 40 });
  });

  it("adds the seated canvas drop", () => {
    expect(boxPx(new THREE.Vector3(0, 1.4, 0), cam, 180, { seat: 0.27 })).toEqual({ x: 90, y: 89 });
  });

  it("mirrors x when the canvas is flipped", () => {
    expect(boxPx(new THREE.Vector3(0.45, 1.4, 0), cam, 180)).toEqual({ x: 135, y: 40 });
    expect(boxPx(new THREE.Vector3(0.45, 1.4, 0), cam, 180, { flipped: true })).toEqual({ x: 45, y: 40 });
  });

  it("pushes points nearer the camera out from the center", () => {
    const flat = boxPx(new THREE.Vector3(0.45, 0.9, 0), cam, 180);
    const near = boxPx(new THREE.Vector3(0.45, 0.9, 0.5), cam, 180);
    expect(near.x).toBeGreaterThan(flat.x);
  });
});
