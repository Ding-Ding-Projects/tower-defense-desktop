/**
 * Fixed-point arithmetic.
 *
 * Positions and distances are integers in 1/1024 map-unit steps. Repeated float
 * addition over a long match accumulates rounding error that eventually diverges
 * two replays of the same command log; integers cannot drift.
 *
 * Health stays a plain integer too, for the same reason: a boss losing 0.30000000004
 * hit points per tick is a replay divergence waiting to happen.
 */

export const FIXED_SHIFT = 10;
export const FIXED_ONE = 1 << FIXED_SHIFT; // 1024

/**
 * A number that has ALREADY been scaled into 1/1024 map-unit steps.
 *
 * It is a plain number at run time; the brand exists only so the compiler can tell a
 * scaled value from an unscaled one. That distinction is worth having because losing
 * it produced the single worst defect this project has had: the snapshot converted to
 * map units and the view model converted the result again, so every tower, enemy and
 * projectile was drawn a thousandth of the way from the map origin. Nothing threw.
 * No check went red. The screen was simply empty except for the terrain, and it took a
 * debugger attached to the running program to find out why.
 *
 * With the brand, converting twice is `fromFixed(number)` where a `Fixed` is required,
 * which the compiler refuses.
 *
 * @typedef {number & { readonly __fixedPoint: unique symbol }} Fixed
 */

/**
 * Map-unit float to fixed-point integer.
 * @param {number} value
 * @returns {Fixed}
 */
export function toFixed(value) {
  return /** @type {Fixed} */ (Math.round(value * FIXED_ONE));
}

/**
 * Fixed-point integer back to map-unit float. Rendering only, never simulation.
 * @param {Fixed} value
 * @returns {number}
 */
export function fromFixed(value) {
  return value / FIXED_ONE;
}

/**
 * Multiply a fixed-point value by a plain scalar, truncating toward zero.
 * @param {number} fixedValue
 * @param {number} scalar
 * @returns {number}
 */
export function mulScalar(fixedValue, scalar) {
  return Math.trunc(fixedValue * scalar);
}

/**
 * Squared distance between two fixed-point points, in fixed-point squared units.
 * Squared, because a square root introduces a float and every range check can be
 * answered without one.
 * @param {number} ax @param {number} ay @param {number} bx @param {number} by
 * @returns {number}
 */
export function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * Integer square root, for the rare place a real distance is needed.
 * @param {number} value
 * @returns {number}
 */
export function isqrt(value) {
  if (value < 0) throw new Error('isqrt: negative input');
  if (value < 2) return value;
  let x = Math.floor(Math.sqrt(value));
  while (x * x > value) x -= 1;
  while ((x + 1) * (x + 1) <= value) x += 1;
  return x;
}
