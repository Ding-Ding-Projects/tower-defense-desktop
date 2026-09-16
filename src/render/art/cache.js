/**
 * The one caching mechanism every drawing module in src/render/art shares.
 * "Draw once per unique signature, blit thereafter" is the hard performance
 * rule this whole library exists to honour, so it lives in exactly one place
 * rather than being reinvented per module.
 *
 * The canvas factory is injectable specifically so this is testable under
 * `node --test`, where neither OffscreenCanvas nor document exists: a test
 * builds a cache with a fake factory that returns a recording fake context,
 * and asserts on identity and on the draw calls made. Runtime code uses the
 * default cache below, which is backed by a real OffscreenCanvas (or a DOM
 * canvas where OffscreenCanvas is unavailable).
 */

/**
 * @typedef {object} SpriteCache
 * @property {(signature: string, width: number, height: number, drawFn: (ctx: any, width: number, height: number) => void) => any} get
 * @property {() => void} clear
 * @property {() => number} size
 */

/**
 * @param {(width: number, height: number) => { getContext: (kind: '2d') => any }} canvasFactory
 * @returns {SpriteCache}
 */
export function createSpriteCache(canvasFactory) {
  const store = new Map();
  return {
    get(signature, width, height, drawFn) {
      const key = `${signature}@${width}x${height}`;
      let entry = store.get(key);
      if (!entry) {
        const canvas = canvasFactory(width, height);
        const ctx = canvas.getContext('2d');
        drawFn(ctx, width, height);
        entry = canvas;
        store.set(key, entry);
      }
      return entry;
    },
    clear() {
      store.clear();
    },
    size() {
      return store.size;
    },
  };
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {{ getContext: (kind: '2d') => any, width: number, height: number }}
 */
export function defaultCanvasFactory(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// The active backend is read at call time, not baked in at module load, so a
// test can swap in a fake canvas factory (see tests/art/support/fake-context.js)
// without needing a real OffscreenCanvas or document — neither of which
// exists under `node --test` — and restore the real one afterward.
let activeCanvasFactory = defaultCanvasFactory;
const defaultCache = createSpriteCache((width, height) => activeCanvasFactory(width, height));

/**
 * @param {string} signature
 * @param {number} width
 * @param {number} height
 * @param {(ctx: CanvasRenderingContext2D, width: number, height: number) => void} drawFn
 * @returns {OffscreenCanvas|HTMLCanvasElement}
 */
export function getCachedCanvas(signature, width, height, drawFn) {
  return defaultCache.get(signature, width, height, drawFn);
}

export function clearArtCache() {
  defaultCache.clear();
}

export function artCacheSize() {
  return defaultCache.size();
}

/**
 * Test-only seam: swap the canvas backend the shared default cache uses.
 * Runtime code never calls this. Always pair with useDefaultCanvasFactory()
 * to restore real behaviour, and clearArtCache() so a later test does not
 * see a fake canvas returned for a signature a real one should now serve.
 * The factory must also report its own size. A canvas is drawn onto AND then drawn
 * FROM, and the blit reads width and height off the object; a fake that omits them
 * produces a zero-sized draw with nothing to say about it.
 * @param {(width: number, height: number) => { getContext: (kind: '2d') => any, width: number, height: number }} factory
 */
export function setCanvasFactory(factory) {
  activeCanvasFactory = factory;
}

export function useDefaultCanvasFactory() {
  activeCanvasFactory = defaultCanvasFactory;
}

/**
 * Quantize a continuous angle (radians, any range) into one of `buckets`
 * evenly spaced steps around the circle, and return both the bucket index
 * and the angle at the centre of that bucket. Used to cache a rotating
 * turret or a walking enemy as a small fixed set of sprites instead of
 * redrawing full vector art every frame.
 * @param {number} radians
 * @param {number} buckets
 * @returns {{ index: number, angle: number }}
 */
export function quantizeAngle(radians, buckets) {
  const twoPi = Math.PI * 2;
  const normalized = ((radians % twoPi) + twoPi) % twoPi;
  const step = twoPi / buckets;
  const index = Math.round(normalized / step) % buckets;
  return { index, angle: index * step };
}

/**
 * Quantize a continuous animation phase into one of `buckets` evenly spaced
 * steps around a 0..2π cycle. Same idea as quantizeAngle, used for walk/tread
 * animation frames rather than facing direction.
 * @param {number} phase
 * @param {number} buckets
 * @returns {{ index: number, phase: number }}
 */
export function quantizePhase(phase, buckets) {
  const { index, angle } = quantizeAngle(phase, buckets);
  return { index, phase: angle };
}
