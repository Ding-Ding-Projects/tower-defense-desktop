/**
 * Deterministic pseudo-random number generator.
 *
 * One ordered stream per match. Every draw in the whole simulation pulls from here,
 * in an order fixed by system execution order rather than by map iteration order.
 * Math.random is banned everywhere under src/sim and tools/check-determinism.mjs
 * fails the build if it reappears.
 *
 * mulberry32: 32-bit state, so the entire generator serialises as one integer and
 * a snapshot can restore it exactly.
 */

/** @typedef {{ state: number }} RngState */

/**
 * @param {number} seed
 * @returns {RngState}
 */
export function createRng(seed) {
  return { state: seed >>> 0 };
}

/**
 * Next float in [0, 1).
 * @param {RngState} rng
 * @returns {number}
 */
export function nextFloat(rng) {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Next integer in [min, max] inclusive.
 * @param {RngState} rng
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function nextInt(rng, min, max) {
  if (max < min) throw new Error('nextInt: max must be >= min');
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

/**
 * @param {RngState} rng
 * @returns {RngState}
 */
export function cloneRng(rng) {
  return { state: rng.state };
}
