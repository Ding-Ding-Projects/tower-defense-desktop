/**
 * A small deterministic pseudo-random number generator and a value-noise
 * function built on top of it, used by terrain.js and path.js to generate
 * organic-looking variation that is nonetheless a pure function of its seed.
 *
 * Nothing here reads Math.random, Date.now, or any other ambient source.
 * The same (seed, x, y) always produces the same number, which is what lets
 * terrain.js cache its output to an offscreen canvas exactly once and lets
 * tests assert that two runs draw an identical call sequence.
 */

/**
 * Turn any seed (string or number) into a 32-bit unsigned integer, so the
 * rest of this module only has to deal with one seed shape.
 * @param {string|number} seed
 * @returns {number}
 */
export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed >>> 0;
  }
  const str = String(seed);
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * mulberry32: a tiny, fast, good-enough deterministic PRNG. Returns a
 * closure producing successive values in [0, 1).
 * @param {string|number} seed
 * @returns {() => number}
 */
export function createRng(seed) {
  let state = normalizeSeed(seed);
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A single deterministic pseudo-random sample for an integer lattice point,
 * independent of iteration order: hash2(3, 4, seed) is always the same
 * number no matter what was sampled before it. This is what value noise is
 * built from instead of an RNG stream, because a stream depends on how many
 * numbers were already drawn from it.
 * @param {number} x
 * @param {number} y
 * @param {string|number} seed  normalizeSeed accepts either, and callers genuinely
 *   pass a composed string such as `${seed}:${side}` to get two independent streams
 *   out of one seed. The annotation said number and the code always handled both.
 * @returns {number} in [0, 1)
 */
export function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393);
  h = Math.imul(h ^ ((y | 0) + 0x9e3779b9), 668265263);
  h ^= h >>> 13;
  h = Math.imul(h, 2246822519) ^ normalizeSeed(seed);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * @param {number} t
 * @returns {number}
 */
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

/**
 * Single-octave value noise: smoothly interpolated hash values on an integer
 * lattice. Continuous, deterministic, and cheap.
 * @param {number} x
 * @param {number} y
 * @param {string|number} seed  either, because normalizeSeed accepts either and callers
 *   compose strings to get independent streams from one seed
 * @returns {number} in [0, 1)
 */
export function valueNoise2D(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = smoothstep(x - x0);
  const sy = smoothstep(y - y0);

  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x1, y0, seed);
  const n01 = hash2(x0, y1, seed);
  const n11 = hash2(x1, y1, seed);

  const ix0 = n00 + (n10 - n00) * sx;
  const ix1 = n01 + (n11 - n01) * sx;
  return ix0 + (ix1 - ix0) * sy;
}

/**
 * Fractal Brownian motion: several octaves of value noise summed at
 * decreasing amplitude and increasing frequency, which is what actually
 * looks like organic terrain variation instead of one blurry blob.
 * @param {number} x
 * @param {number} y
 * @param {string|number} seed
 * @param {number} [octaves]
 * @param {number} [lacunarity]  frequency multiplier per octave
 * @param {number} [gain]        amplitude multiplier per octave
 * @returns {number} in [0, 1)
 */
export function fbm2D(x, y, seed, octaves = 4, lacunarity = 2, gain = 0.5) {
  // Normalised once, so each octave's seed is derived the same way whether the caller
  // passed a number or a string. Left as-is, `seed + o * 101` is addition for one and
  // concatenation for the other: both deterministic, but two different derivations
  // hiding behind one expression, and only one of them is what the line reads as.
  const baseSeed = normalizeSeed(seed);
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let max = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += valueNoise2D(x * frequency, y * frequency, baseSeed + o * 101) * amplitude;
    max += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return max > 0 ? sum / max : 0;
}
