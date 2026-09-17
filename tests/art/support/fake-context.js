/**
 * A minimal fake 2D canvas context that records every call and every
 * property assignment made against it, for use under `node --test` where
 * there is no real canvas. Every drawing module in src/render/art is a pure
 * function of (ctx, ...args), so recording exactly what was asked of `ctx`
 * is enough to assert on cache identity, determinism, and structural
 * differences between draw calls without ever needing to rasterize a pixel.
 */

const METHODS = [
  'clearRect', 'fillRect', 'strokeRect',
  'beginPath', 'closePath', 'moveTo', 'lineTo',
  'arc', 'ellipse', 'rect', 'roundRect',
  'quadraticCurveTo', 'bezierCurveTo',
  'fill', 'stroke', 'clip',
  'save', 'restore', 'translate', 'rotate', 'scale',
  'setLineDash', 'drawImage',
  // The interface layer draws through the same context as the battlefield, and these
  // are what it needs beyond the art. Without them the renderer could only be driven
  // with its interface layer detached, which is how every renderer check ran until a
  // match transition had to be reproduced with the layer attached.
  'arcTo', 'fillText', 'strokeText',
];

const PROPERTIES = [
  'fillStyle', 'strokeStyle', 'globalAlpha', 'globalCompositeOperation',
  'lineWidth', 'lineCap', 'lineJoin', 'font', 'textAlign', 'textBaseline',
];

function roundNumber(value) {
  return Math.round(value * 10000) / 10000;
}

// A gradient returned by createRadialGradient/createLinearGradient later gets
// assigned straight to fillStyle/strokeStyle. Two calls that build "the same"
// gradient from identical arguments still return two distinct objects (real
// canvas gradients work the same way), so comparing them by deepStrictEqual
// across two separate createFakeContext() runs would spuriously fail on
// function-reference identity. Replace a gradient object with a plain,
// order-based marker before logging it, so two deterministic runs that create
// their Nth gradient the same way produce an equal marker.
function isFakeGradient(value) {
  return Boolean(value) && typeof value === 'object' && value.__fakeGradientId !== undefined;
}

function sanitize(value) {
  if (typeof value === 'number') return roundNumber(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (isFakeGradient(value)) return { gradient: value.__fakeGradientKind, ordinal: value.__fakeGradientId };
  return value;
}

/**
 * @returns {{ ctx: any, calls: Array<{ type: string, args: any[] }> }}
 */
export function createFakeContext() {
  const calls = [];
  const ctx = { canvas: { width: 0, height: 0 } };
  let gradientCount = 0;

  for (const name of METHODS) {
    ctx[name] = (...args) => {
      calls.push({ type: name, args: args.map(sanitize) });
      if (name === 'roundRect') return undefined;
      return undefined;
    };
  }

  const state = {};
  for (const prop of PROPERTIES) {
    Object.defineProperty(ctx, prop, {
      enumerable: true,
      get() {
        return state[prop];
      },
      set(value) {
        state[prop] = value;
        calls.push({ type: `set:${prop}`, args: [sanitize(value)] });
      },
    });
  }

  // Real-shaped, because HUD layout reads `.width` off it and lays text out by the
  // answer; a recorded call returning undefined throws one line later. Seven pixels a
  // character, matching the HUD-side fake, so both fakes lay the same text out the
  // same way.
  ctx.measureText = (text) => {
    calls.push({ type: 'measureText', args: [sanitize(text)] });
    return { width: String(text ?? '').length * 7 };
  };

  ctx.createRadialGradient = (...args) => {
    calls.push({ type: 'createRadialGradient', args: args.map(sanitize) });
    return createFakeGradient(calls, 'radial', gradientCount++);
  };
  ctx.createLinearGradient = (...args) => {
    calls.push({ type: 'createLinearGradient', args: args.map(sanitize) });
    return createFakeGradient(calls, 'linear', gradientCount++);
  };

  return { ctx, calls };
}

function createFakeGradient(calls, kind, ordinal) {
  return {
    __fakeGradientId: ordinal,
    __fakeGradientKind: kind,
    addColorStop(offset, color) {
      calls.push({ type: `${kind}GradientStop`, args: [sanitize(offset), color] });
    },
  };
}

/**
 * A fake canvas whose getContext('2d') returns a fresh recording fake
 * context, for use as (or inside) a cache.js canvas factory in tests.
 * @param {number} [width]
 * @param {number} [height]
 * @returns {{ canvas: { getContext: (kind: '2d') => any, width: number, height: number }, ctx: any, calls: Array<{ type: string, args: any[] }> }}
 */
export function createFakeCanvas(width = 0, height = 0) {
  const { ctx, calls } = createFakeContext();
  ctx.canvas.width = width;
  ctx.canvas.height = height;
  const canvas = {
    width,
    height,
    getContext: () => ctx,
  };
  return { canvas, ctx, calls };
}

/**
 * A cache.js-compatible canvas factory backed by fake contexts, useful with
 * setCanvasFactory() to exercise getTerrainSprite/getTowerSprite/getEnemySprite
 * (which otherwise reach for a real OffscreenCanvas or document) under
 * `node --test`.
 * @returns {(width: number, height: number) => { getContext: (kind: '2d') => any }}
 */
export function fakeCanvasFactory() {
  return (width, height) => createFakeCanvas(width, height).canvas;
}
