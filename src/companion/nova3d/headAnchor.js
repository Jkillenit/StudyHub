/**
 * Where her head is inside her box, in px from the top-left. The camera is orthographic and
 * the canvas fills the `size` box, so it's a straight linear map; `seat` is the canvas drop
 * (fraction of the frame) while seated, `flipped` the lying mirror.
 */
export function headAnchor(world, cam, size, { seat = 0, flipped = false } = {}) {
  const fx = (world.x - cam.left) / (cam.right - cam.left);
  const fy = (cam.top - world.y) / (cam.top - cam.bottom);
  return { x: Math.round((flipped ? 1 - fx : fx) * size), y: Math.round((fy + seat) * size) };
}
