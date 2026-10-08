import * as THREE from "three";

const _p = new THREE.Vector3();

/**
 * Aim a square perspective camera so the plane through her body (z = 0) shows exactly
 * [bottom, bottom + height] vertically, the box the old orthographic camera covered. Points
 * on that plane keep their screen spots; anything nearer the camera (knees, a raised hand)
 * reads larger.
 */
export function frameCamera(cam, bottom, height, fov) {
  const centerY = bottom + height / 2;
  const dist = height / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  cam.fov = fov;
  cam.aspect = 1;
  cam.near = Math.max(0.01, dist - height * 2);
  cam.far = dist + height * 2;
  cam.position.set(0, centerY, dist);
  cam.lookAt(0, centerY, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return { centerY, dist };
}

/**
 * Where a world point (her head, a hand) sits inside her `size` box, in px from the top-left.
 * `seat` is the canvas drop (fraction of the box) while seated, `flipped` the lying mirror.
 */
export function boxPx(world, cam, size, { seat = 0, flipped = false } = {}) {
  const p = _p.copy(world).project(cam);
  const fx = (p.x + 1) / 2;
  const fy = (1 - p.y) / 2;
  return { x: Math.round((flipped ? 1 - fx : fx) * size), y: Math.round((fy + seat) * size) };
}
