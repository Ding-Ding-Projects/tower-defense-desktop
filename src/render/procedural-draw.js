/**
 * There are no art assets on disk and none are fetched. Every tower and enemy
 * category gets a small procedural draw function keyed off its own data fields
 * (footprint, targeting shape, hitsAir, aoeRadius, aura presence for towers;
 * flying/hidden/boss/maxHp for enemies), so a brand-new data row someone adds to
 * src/data later still renders sensibly without a matching art commission.
 *
 * Each unique (id, level) or (id) combination is drawn once to an offscreen
 * canvas and cached; every frame after that is a single blit. This module is
 * runtime/canvas-facing and is exercised visually, not by node --test — see
 * tests/ui for the pure logic (view-model, interpolation, camera, affordability,
 * targeting) this renderer is built on.
 */

const spriteCache = new Map();

/**
 * @param {number} w
 * @param {number} h
 * @returns {OffscreenCanvas|HTMLCanvasElement}
 */
function createOffscreen(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/**
 * @param {string} signature  unique cache key
 * @param {number} size       square sprite side length in device pixels
 * @param {(ctx: CanvasRenderingContext2D, size: number) => void} drawFn
 * @returns {OffscreenCanvas|HTMLCanvasElement}
 */
export function getCachedSprite(signature, size, drawFn) {
  const key = `${signature}@${size}`;
  let sprite = spriteCache.get(key);
  if (!sprite) {
    sprite = createOffscreen(size, size);
    const ctx = sprite.getContext('2d');
    drawFn(ctx, size);
    spriteCache.set(key, sprite);
  }
  return sprite;
}

export function clearSpriteCache() {
  spriteCache.clear();
}

/** @param {import('../data/schema/types.js').TowerDef} towerDef @param {number} level */
export function towerSpriteSignature(towerDef, level) {
  return `tower:${towerDef.id}:${level}`;
}

/** @param {import('../data/schema/types.js').EnemyDef} enemyDef */
export function enemySpriteSignature(enemyDef) {
  return `enemy:${enemyDef.id}`;
}

function towerRole(levelDef) {
  if (levelDef.aura) return 'support';
  if (levelDef.aoeRadius) return 'aoe';
  if (levelDef.chainCount) return 'chain';
  if (levelDef.pierceCount) return 'pierce';
  return 'single';
}

const ROLE_COLORS = {
  single: '#6750a4',
  aoe: '#b3261e',
  chain: '#3d6b52',
  pierce: '#9a5b12',
  support: '#1d6f8c',
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size
 * @param {import('../data/schema/types.js').TowerDef} towerDef
 * @param {import('../data/schema/types.js').TowerLevel} levelDef
 */
export function drawTowerSprite(ctx, size, towerDef, levelDef) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const role = towerRole(levelDef);
  const color = ROLE_COLORS[role] ?? ROLE_COLORS.single;

  ctx.clearRect(0, 0, size, size);

  // Base: a rounded square, bigger for a higher level so an upgraded tower
  // silhouettes as visibly bigger without a second art pass.
  const baseSize = r * (1.3 + levelDef.level * 0.12);
  ctx.fillStyle = shade(color, -0.25);
  roundedRect(ctx, cx - baseSize / 2, cy - baseSize / 2, baseSize, baseSize, baseSize * 0.22);
  ctx.fill();

  // Barrel count communicates burst/pierce/chain at a glance.
  const barrels = Math.max(1, levelDef.burstCount ?? (levelDef.pierceCount ? 2 : 1));
  ctx.fillStyle = color;
  for (let i = 0; i < barrels; i += 1) {
    const offset = (i - (barrels - 1) / 2) * size * 0.12;
    ctx.beginPath();
    ctx.roundRect(cx + offset - size * 0.045, cy - r * 0.95, size * 0.09, r * 0.6, size * 0.03);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  if (levelDef.hitsAir) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (levelDef.aura) {
    ctx.strokeStyle = shade(color, 0.4);
    ctx.setLineDash([size * 0.05, size * 0.05]);
    ctx.lineWidth = Math.max(1, size * 0.02);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size
 * @param {import('../data/schema/types.js').EnemyDef} enemyDef
 */
export function drawEnemySprite(ctx, size, enemyDef) {
  const cx = size / 2;
  const cy = size / 2;
  const scale = Math.min(1.6, 0.6 + Math.log10(Math.max(10, enemyDef.maxHp)) * 0.22);
  const r = size * 0.32 * scale;

  ctx.clearRect(0, 0, size, size);

  let color = '#5a5470';
  if (enemyDef.boss) color = '#8c1d1d';
  else if (enemyDef.flying) color = '#2f7d9e';
  else if (enemyDef.hidden) color = '#4a4a4a';

  ctx.save();
  if (enemyDef.hidden) ctx.globalAlpha = 0.55;

  if (enemyDef.boss) {
    drawPolygon(ctx, cx, cy, r * 1.15, 7, color);
  } else if (enemyDef.flying) {
    drawPolygon(ctx, cx, cy, r, 3, color);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  ctx.restore();

  if (enemyDef.shieldHp > 0) {
    ctx.strokeStyle = '#8ecbe8';
    ctx.lineWidth = Math.max(1, size * 0.035);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPolygon(ctx, cx, cy, radius, sides, color) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function roundedRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.rect(x, y, w, h);
  }
}

function shade(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const adjust = (channel) => Math.max(0, Math.min(255, Math.round(channel + (amount > 0 ? (255 - channel) * amount : channel * amount))));
  r = adjust(r);
  g = adjust(g);
  b = adjust(b);
  return `rgb(${r}, ${g}, ${b})`;
}
