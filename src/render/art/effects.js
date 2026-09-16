/**
 * Muzzle flashes, projectile trails, impact sparks, explosions, frost, embers
 * and the leak flash. Every function here is time-parameterised rather than
 * clock-driven: the caller (the particle system in src/render/particles.js,
 * which this library does not own) tracks each effect's age and passes a
 * progress value `t` in [0, 1) — 0 the instant it starts, approaching 1 as it
 * fades out. Two calls with the same arguments always draw the same pixels,
 * which is what makes an effect safe to re-render at a different alpha for a
 * screenshot or a paused frame.
 *
 * Effects are not cached: they are cheap (a handful of paths per call) and,
 * unlike a tower or an enemy, there is rarely more than one of the same
 * effect on screen with the exact same (position, t) at once, so caching
 * would spend a cache slot per unique frame instead of saving real work.
 */

import { EFFECTS } from './palette.js';
import { hash2 } from './noise.js';

/** Base world size of a projectile, in map units. */
export const PROJECTILE_WORLD_SIZE = 0.5;

function fadeOut(t) {
  return Math.max(0, 1 - t);
}

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

/**
 * A brief star-shaped flash at a barrel's muzzle, oriented along the shot.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} angleRadians  direction the shot travels
 * @param {number} t             0..1 progress
 * @param {number} size          reference scale, roughly the barrel width
 */
export function drawMuzzleFlash(ctx, x, y, angleRadians, t, size) {
  const alpha = fadeOut(t);
  if (alpha <= 0) return;
  const length = size * (1.4 - t * 0.6);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleRadians);
  ctx.globalAlpha = alpha;

  ctx.fillStyle = EFFECTS.muzzleEdge;
  drawStar(ctx, 0, 0, length, length * 0.35, 4);
  ctx.fill();

  ctx.fillStyle = EFFECTS.muzzleCore;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.32 * (1 - t), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawStar(ctx, cx, cy, outerR, innerR, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i / (points * 2)) * Math.PI * 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * A fading streak behind a moving projectile, from its previous position to
 * its current one.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @param {number} t     0..1 progress along this trail's own lifetime
 * @param {number} size  reference scale, roughly the projectile diameter
 */
export function drawProjectileTrail(ctx, fromX, fromY, toX, toY, t, size) {
  const alpha = fadeOut(t) * 0.8;
  if (alpha <= 0) return;
  const gradient = ctx.createLinearGradient(fromX, fromY, toX, toY);
  gradient.addColorStop(0, 'rgba(247, 213, 72, 0)');
  gradient.addColorStop(1, EFFECTS.trail);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = gradient;
  ctx.lineWidth = Math.max(1, size * 0.5);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.restore();
}

/**
 * A small burst of radiating spark lines at an impact point.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} t     0..1 progress
 * @param {number} size  reference scale
 */
export function drawImpactSpark(ctx, x, y, t, size) {
  const alpha = fadeOut(t);
  if (alpha <= 0) return;
  const reach = size * (0.4 + easeOutQuad(t) * 1.2);
  const sparkCount = 6;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = EFFECTS.spark;
  ctx.lineWidth = Math.max(1, size * 0.12);
  ctx.lineCap = 'round';
  for (let i = 0; i < sparkCount; i += 1) {
    const angle = (i / sparkCount) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * An area-damage explosion: a bright core flash that fades quickly and an
 * expanding ring shockwave that grows from 0 to `radius` over the effect's
 * lifetime and thins out as it grows.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} radius  final shockwave radius
 * @param {number} t       0..1 progress
 * @param {number} size    reference scale for the core flash
 */
export function drawExplosion(ctx, x, y, radius, t, size) {
  const ringRadius = radius * easeOutQuad(t);
  const ringAlpha = fadeOut(t);
  const coreAlpha = fadeOut(Math.min(1, t * 2.5));

  if (coreAlpha > 0) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
    gradient.addColorStop(0, EFFECTS.explosionCore);
    gradient.addColorStop(0.5, EFFECTS.explosionMid);
    gradient.addColorStop(1, EFFECTS.explosionEdge);
    ctx.save();
    ctx.globalAlpha = coreAlpha;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (ringAlpha > 0 && ringRadius > 0) {
    ctx.save();
    ctx.globalAlpha = ringAlpha;
    ctx.strokeStyle = EFFECTS.shockwave;
    ctx.lineWidth = Math.max(1, size * 0.3 * fadeOut(t));
    ctx.beginPath();
    ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * A frost overlay for a frozen/slowed enemy: an icy tint plus a few crystal
 * facets, fading as the status's remaining time (encoded in `t`, 0 = just
 * applied, 1 = about to expire) runs out.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {number} t  0..1, remaining-duration progress (not a one-shot fade-in)
 */
export function drawFreezeOverlay(ctx, x, y, size, t) {
  const alpha = fadeOut(t) * 0.7 + 0.1;
  const r = size * 0.55;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = EFFECTS.frost;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = EFFECTS.frostCrystal;
  ctx.lineWidth = Math.max(1, size * 0.06);
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(angle) * r * 0.7, y - Math.sin(angle) * r * 0.7);
    ctx.lineTo(x + Math.cos(angle) * r * 0.7, y + Math.sin(angle) * r * 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Small rising embers for a burning enemy. `seed` keeps the ember cloud
 * looking the same across a paused re-render instead of jittering with
 * whatever position argument happens to be reused, while `t` drives their
 * upward drift and fade over the burn tick's lifetime.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {number} t
 * @param {string|number} [seed]
 */
export function drawBurningEmbers(ctx, x, y, size, t, seed = 0) {
  const emberCount = 5;
  ctx.save();
  for (let i = 0; i < emberCount; i += 1) {
    const jitterX = (hash2(i, 1, seed) - 0.5) * size * 0.8;
    const startY = (hash2(i, 2, seed) - 0.5) * size * 0.4;
    const rise = size * (0.3 + hash2(i, 3, seed) * 0.5);
    const emberAlpha = fadeOut((t + hash2(i, 4, seed) * 0.3) % 1);
    if (emberAlpha <= 0) continue;
    ctx.globalAlpha = emberAlpha;
    ctx.fillStyle = i % 2 === 0 ? EFFECTS.ember : EFFECTS.emberDim;
    ctx.beginPath();
    ctx.arc(x + jitterX, y + startY - rise * t, Math.max(0.6, size * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A full-viewport red flash for a leaked enemy. `t` is the fade progress
 * since the leak (0 = just leaked, 1 = fully faded).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {number} t
 */
export function drawLeakFlash(ctx, width, height, t) {
  const alpha = fadeOut(t);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = EFFECTS.leakFlash;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
