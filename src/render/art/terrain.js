/**
 * The ground: layered noise-based grass and soil, scattered rocks and grass
 * tufts, and a vignette toward the edges. Never a flat fill.
 *
 * Generation is a pure function of (seed, pixelWidth, pixelHeight) — see
 * renderTerrainTexture below — so the hard performance rule ("generate once,
 * blit forever") is safe: getTerrainSprite renders it to an offscreen canvas
 * exactly once per (seed, size) via the shared cache in cache.js, and every
 * later call is a single drawImage. Nothing here reads a clock, so the same
 * seed always paints the same ground, run after run.
 */

import { fbm2D, hash2, createRng } from './noise.js';
import { TERRAIN, mixColors, shade } from './palette.js';
import { getCachedCanvas } from './cache.js';

/** Detail resolution independent of camera zoom: texture pixels per map unit. */
export const TERRAIN_PX_PER_UNIT = 6;

const CELL_PX = 9;

/**
 * The pure texture generator. Draws layered terrain directly into `ctx`
 * across a `pixelWidth` x `pixelHeight` rectangle starting at (0, 0). Exported
 * separately from the cached entry point so it can be exercised directly by
 * tests without needing a real canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} pixelWidth
 * @param {number} pixelHeight
 * @param {string|number} seed
 */
export function renderTerrainTexture(ctx, pixelWidth, pixelHeight, seed) {
  ctx.clearRect(0, 0, pixelWidth, pixelHeight);

  // Layer 1: a soft base fill so gaps between grid cells never show canvas.
  ctx.fillStyle = TERRAIN.grassBase;
  ctx.fillRect(0, 0, pixelWidth, pixelHeight);

  // Layer 2: coarse fbm-noise grid blending grass and soil, with a second
  // noise sample driving light/dark variation within whichever colour won.
  const freq = 0.09;
  for (let py = 0; py < pixelHeight; py += CELL_PX) {
    for (let px = 0; px < pixelWidth; px += CELL_PX) {
      const n = fbm2D(px * freq, py * freq, seed, 4, 2, 0.5);
      const shadeNoise = fbm2D(px * freq * 3.7 + 50, py * freq * 3.7 + 50, seed, 2, 2, 0.5);
      const isSoil = n > 0.62;
      const base = isSoil ? TERRAIN.soilBase : TERRAIN.grassBase;
      const dark = isSoil ? TERRAIN.soilDark : TERRAIN.grassDark;
      const light = isSoil ? TERRAIN.soilLight : TERRAIN.grassLight;
      const color = shadeNoise > 0.5
        ? mixColors(base, light, (shadeNoise - 0.5) * 2)
        : mixColors(dark, base, shadeNoise * 2);
      ctx.fillStyle = color;
      const w = Math.min(CELL_PX, pixelWidth - px);
      const h = Math.min(CELL_PX, pixelHeight - py);
      ctx.fillRect(px, py, w, h);
    }
  }

  drawClumps(ctx, pixelWidth, pixelHeight, seed);
  drawTufts(ctx, pixelWidth, pixelHeight, seed);
  drawRocks(ctx, pixelWidth, pixelHeight, seed);
  drawVignette(ctx, pixelWidth, pixelHeight);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {string|number} seed
 */
function drawClumps(ctx, w, h, seed) {
  const area = w * h;
  const count = Math.max(4, Math.round(area / 2200));
  const rng = createRng(`${seed}:clump`);
  for (let i = 0; i < count; i += 1) {
    const cx = rng() * w;
    const cy = rng() * h;
    const radius = 4 + rng() * 6;
    const lobes = 3 + Math.floor(rng() * 3);
    const darker = rng() > 0.5;
    ctx.fillStyle = darker ? TERRAIN.grassDark : TERRAIN.grassLight;
    ctx.globalAlpha = 0.35;
    for (let lobe = 0; lobe < lobes; lobe += 1) {
      const angle = (lobe / lobes) * Math.PI * 2 + rng() * 0.6;
      const dist = radius * 0.4 * rng();
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, radius * (0.4 + rng() * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {string|number} seed
 */
function drawTufts(ctx, w, h, seed) {
  const area = w * h;
  const count = Math.max(6, Math.round(area / 900));
  const rng = createRng(`${seed}:tuft`);
  ctx.strokeStyle = TERRAIN.tuft;
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i += 1) {
    const x = rng() * w;
    const y = rng() * h;
    const bladeCount = 2 + Math.floor(rng() * 3);
    ctx.strokeStyle = rng() > 0.5 ? TERRAIN.tuft : TERRAIN.tuftDark;
    for (let b = 0; b < bladeCount; b += 1) {
      const lean = (rng() - 0.5) * 3;
      const height = 3 + rng() * 4;
      ctx.beginPath();
      ctx.moveTo(x + b * 1.4, y);
      ctx.quadraticCurveTo(x + b * 1.4 + lean * 0.5, y - height * 0.6, x + b * 1.4 + lean, y - height);
      ctx.stroke();
    }
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {string|number} seed
 */
function drawRocks(ctx, w, h, seed) {
  const area = w * h;
  const count = Math.max(2, Math.round(area / 6000));
  const rng = createRng(`${seed}:rock`);
  for (let i = 0; i < count; i += 1) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 3 + rng() * 4;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.25, y + r * 0.3, r * 1.05, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = TERRAIN.rockDark;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.75, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = TERRAIN.rock;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.15, y - r * 0.15, r * 0.7, r * 0.5, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = shade(TERRAIN.rockHighlight, 0.1);
    ctx.beginPath();
    ctx.ellipse(x - r * 0.32, y - r * 0.3, r * 0.28, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function drawVignette(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const outerRadius = Math.hypot(cx, cy);
  const gradient = ctx.createRadialGradient(cx, cy, outerRadius * 0.55, cx, cy, outerRadius);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, TERRAIN.vignette);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

/**
 * The cached entry point: renders (once per seed+size) an offscreen texture
 * covering a `mapWidthUnits` x `mapHeightUnits` map at a fixed detail
 * resolution, then blits it into `ctx` at the destination rectangle given
 * (typically the whole visible map in screen space, already projected by the
 * caller through camera.js — terrain.js has no camera or zoom concept of
 * its own).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string|number} seed
 * @param {number} mapWidthUnits
 * @param {number} mapHeightUnits
 * @param {number} destX
 * @param {number} destY
 * @param {number} destWidthPx
 * @param {number} destHeightPx
 */
export function drawTerrain(ctx, seed, mapWidthUnits, mapHeightUnits, destX, destY, destWidthPx, destHeightPx) {
  const sprite = getTerrainSprite(seed, mapWidthUnits, mapHeightUnits);
  ctx.drawImage(sprite, destX, destY, destWidthPx, destHeightPx);
}

/**
 * @param {string|number} seed
 * @param {number} mapWidthUnits
 * @param {number} mapHeightUnits
 * @returns {OffscreenCanvas|HTMLCanvasElement}
 */
export function getTerrainSprite(seed, mapWidthUnits, mapHeightUnits) {
  const pixelWidth = Math.max(1, Math.round(mapWidthUnits * TERRAIN_PX_PER_UNIT));
  const pixelHeight = Math.max(1, Math.round(mapHeightUnits * TERRAIN_PX_PER_UNIT));
  const signature = `terrain:${seed}`;
  return getCachedCanvas(signature, pixelWidth, pixelHeight, (ctx, w, h) => renderTerrainTexture(ctx, w, h, seed));
}

/** Exposed for callers (and tests) that want the noise sample used at a point, e.g. to keep decorative placement consistent with the drawn ground. */
/**
 * @param {number} mapX
 * @param {number} mapY
 * @param {string|number} seed
 * @returns {number} in [0, 1)
 */
export function terrainNoiseAt(mapX, mapY, seed) {
  return hash2(Math.round(mapX * 10), Math.round(mapY * 10), seed);
}
