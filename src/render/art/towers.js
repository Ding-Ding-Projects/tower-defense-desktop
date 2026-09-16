/**
 * Real tower structure instead of a flat square: a shadowed base, a plinth,
 * a rotating turret head, a barrel (or barrels, or an antenna array, or a
 * beacon ring) that points at the target, and visible upgrade differences as
 * level rises.
 *
 * The SILHOUETTE is derived entirely from the level's own real data fields —
 * aura, aoeRadius, chainCount, pierceCount, incomePerWave, burstCount,
 * hitsAir, detectsHidden. A brand new tower added to src/data/towers tomorrow
 * with, say, an aoeRadius gets the mortar silhouette automatically, with no
 * matching change needed here.
 *
 * The LIVERY — hull colour, plinth shape, panel count — is derived from a hash
 * of the tower's id. That is a refinement of the rule above rather than a break
 * with it, and it was forced by what the shop actually looked like: shape alone
 * made Scout, Soldier, Freezer and Militant pixel-identical, because at level 0
 * they share every mechanical field the silhouette reads. Four towers that draw
 * as the same dark disc are four towers a player cannot tell apart, in the shop
 * or on the field.
 *
 * The principle being protected is "no hand-written per-tower branch in this
 * file", not "ignore the id". A hash needs no such branch: the next tower gets
 * its own colours the moment it has an id, exactly as it gets its silhouette the
 * moment it has stats. What is still forbidden here is `if (def.id === 'scout')`.
 *
 * `drawTower` is the pure function the renderer calls every frame (rotation
 * changes continuously as a turret tracks its target, so it cannot be baked
 * into a cache key as-is). `getTowerSprite` is the cached wrapper: it
 * quantizes rotation into a fixed number of buckets and caches one bitmap per
 * (tower id, level, size, rotation bucket), so a screen full of towers all
 * facing roughly the same way still costs one draw per bucket, not one per
 * tower per frame. Rotation convention: 0 radians points along +x (screen
 * right), increasing clockwise — the same convention as Math.atan2(dy, dx),
 * so the renderer can pass `Math.atan2(target.y - tower.y, target.x - tower.x)`
 * directly.
 */

import { TOWER, TOWER_ROLE, LIGHT_ANGLE_RADIANS, shade, withAlpha, mixHex } from './palette.js';
import { getCachedCanvas, quantizeAngle } from './cache.js';
import { normalizeSeed } from './noise.js';

/**
 * Hull colours a tower can be painted. Deliberately muted and metallic rather than
 * saturated: these sit under the role accent, which still has to be the thing that
 * reads first, because role is what tells a player what the tower DOES.
 */
const LIVERY = Object.freeze([
  '#8a8f98', '#7d6b57', '#55707a', '#6d5b74',
  '#7a8570', '#8a7060', '#5f6b8a', '#84796a',
]);

/**
 * A tower's stable visual identity, hashed from its id.
 *
 * Deterministic by construction: the same id always produces the same livery, which is
 * what lets the sprite cache key on the id and never re-derive this.
 *
 * @param {import('../../data/schema/types.js').TowerDef} def
 * @returns {{ hull: string, plinthSides: number, panels: number }}
 */
export function towerLivery(def) {
  const seed = normalizeSeed('livery:' + (def.id ?? ''));
  return {
    hull: LIVERY[seed % LIVERY.length],
    // Six, eight or ten sides. Enough to be told apart at a glance in a shop card,
    // not so many that the plinth stops reading as a machined slab.
    plinthSides: 6 + ((seed >>> 3) % 3) * 2,
    panels: 2 + ((seed >>> 7) % 3),
  };
}

/** Base world footprint of a placed tower, in map units. See docs/features on the renderer side for how this becomes on-screen pixels via camera zoom. */
export const TOWER_WORLD_SIZE = 3;

const ROTATION_CACHE_BUCKETS = 24;

/**
 * @typedef {'support'|'aoe'|'chain'|'pierce'|'economy'|'single'} TowerRole
 */

/**
 * @param {import('../../data/schema/types.js').TowerLevel} levelDef
 * @returns {TowerRole}
 */
export function towerRole(levelDef) {
  if (levelDef.aura) return 'support';
  if (levelDef.aoeRadius) return 'aoe';
  if (levelDef.chainCount) return 'chain';
  if (levelDef.pierceCount) return 'pierce';
  if (levelDef.incomePerWave) return 'economy';
  return 'single';
}

/**
 * The accent for a role.
 *
 * `economy` deliberately has no colour of its own and falls back to the single-target
 * one: an income tower's silhouette already sets it apart, and giving it a sixth accent
 * would spend a colour on the one archetype that never shoots at anything.
 *
 * @param {TowerRole} role
 * @returns {string} a hex colour
 */
function roleColor(role) {
  const byRole = /** @type {Record<string, string>} */ (TOWER_ROLE);
  return byRole[role] ?? TOWER_ROLE.single;
}

/**
 * @param {import('../../data/schema/types.js').TowerDef} def
 * @param {import('../../data/schema/types.js').TowerLevel} levelDef
 * @param {number} size
 * @returns {string}
 */
export function towerSpriteSignature(def, levelDef, size) {
  return `tower:${def.id}:${levelDef.level}:${size}`;
}

/**
 * The pure draw function. Draws a complete tower — base, plinth, armor,
 * turret and barrel(s) rotated to `rotationRadians` — into a `size` x `size`
 * square of `ctx` starting at (0, 0).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size
 * @param {import('../../data/schema/types.js').TowerDef} def
 * @param {import('../../data/schema/types.js').TowerLevel} levelDef
 * @param {number} rotationRadians
 */
export function drawTower(ctx, size, def, levelDef, rotationRadians) {
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const role = towerRole(levelDef);
  const livery = towerLivery(def);
  // Role still leads the hue, so what a tower DOES is what reads first; the hull pulls
  // it far enough apart that two towers of the same role are not the same picture.
  const accent = mixHex(roleColor(role), livery.hull, 0.38);
  const level = levelDef.level ?? 0;

  const footprintScale = clamp((def.footprintRadius ?? 1.5) / 1.5, 0.75, 1.6);
  const levelScale = 1 + level * 0.09;
  const r = size * 0.3 * footprintScale * levelScale;

  drawShadow(ctx, cx, cy, r);
  drawPlinth(ctx, cx, cy, r, level, livery);
  drawArmorRing(ctx, cx, cy, r, level, accent);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotationRadians);
  drawSilhouette(ctx, role, r, size, levelDef, accent);
  ctx.restore();

  drawTurretHub(ctx, cx, cy, r, accent);

  if (levelDef.hitsAir) drawAntiAirSpike(ctx, cx, cy, r);
  if (levelDef.detectsHidden) drawSensorLens(ctx, cx, cy, r);

  drawLevelPips(ctx, cx, cy, r, level);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
function drawShadow(ctx, cx, cy, r) {
  ctx.fillStyle = TOWER.shadow;
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.12, cy + r * 0.22, r * 1.05, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** An octagonal plinth, two-tone so it reads as a solid slab rather than a flat disc. */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} level
 * @param {{ hull: string, plinthSides: number, panels: number }|null} livery
 */
function drawPlinth(ctx, cx, cy, r, level, livery) {
  const sides = livery?.plinthSides ?? 8;
  const turn = Math.PI / sides;
  const plinthR = r * 1.05;
  drawRegularPolygon(ctx, cx, cy, plinthR, sides, turn);
  ctx.fillStyle = TOWER.plinthDark;
  ctx.fill();

  const insetR = plinthR * 0.82;
  drawRegularPolygon(ctx, cx, cy, insetR, sides, turn);
  // The hull colour, mixed well down into the neutral plinth. Enough to tell two
  // towers apart in a 44 pixel shop card; not enough to turn a machine into a toy.
  ctx.fillStyle = livery ? mixHex(TOWER.plinth, livery.hull, 0.5) : TOWER.plinth;
  ctx.fill();

  ctx.strokeStyle = shade(TOWER.plinth, level > 0 ? 0.15 : 0.05);
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.stroke();

  // Panel seams across the deck, so the slab reads as fabricated from plates rather
  // than cast as one lump. The count is part of the livery, which is what makes two
  // towers sharing a hull colour still distinguishable.
  const panels = livery?.panels ?? 0;
  if (panels > 0) {
    ctx.save();
    ctx.strokeStyle = withAlpha(TOWER.plinthDark, 0.55);
    ctx.lineWidth = Math.max(0.6, r * 0.035);
    for (let i = 0; i < panels; i += 1) {
      const t = (i + 1) / (panels + 1);
      const y = cy - insetR + insetR * 2 * t;
      const halfWidth = Math.sqrt(Math.max(0, insetR * insetR - (y - cy) * (y - cy))) * 0.86;
      ctx.beginPath();
      ctx.moveTo(cx - halfWidth, y);
      ctx.lineTo(cx + halfWidth, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Armor rivets around the plinth rim: more of them at higher level, so an upgraded tower reads as more heavily plated without a second art pass. */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} level
 * @param {string} accent
 */
function drawArmorRing(ctx, cx, cy, r, level, accent) {
  if (level <= 0) return;
  const rivetCount = 6 + level * 2;
  const ringR = r * 0.95;
  ctx.fillStyle = TOWER.armorRivet;
  for (let i = 0; i < rivetCount; i += 1) {
    const angle = (i / rivetCount) * Math.PI * 2;
    const x = cx + Math.cos(angle) * ringR;
    const y = cy + Math.sin(angle) * ringR;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.6, r * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }
  if (level >= 2) {
    ctx.strokeStyle = withAlpha(accent, 0.55);
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath();
    ctx.arc(cx, cy, ringR * 1.03, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Drawn already rotated (caller has translated to the tower centre and rotated by rotationRadians): everything here points along local +x. */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {TowerRole} role
 * @param {number} r
 * @param {number} size
 * @param {any} levelDef
 * @param {string} accent
 */
function drawSilhouette(ctx, role, r, size, levelDef, accent) {
  const barrels = Math.max(1, levelDef.burstCount ?? 1);
  switch (role) {
    case 'support':
      drawBeacon(ctx, r, accent);
      break;
    case 'aoe':
      drawMortar(ctx, r, accent);
      break;
    case 'chain':
      drawChainArray(ctx, r, levelDef.chainCount ?? 3, accent);
      break;
    case 'pierce':
      drawRifle(ctx, r, accent);
      break;
    case 'economy':
      drawCoinSlot(ctx, r, accent);
      break;
    default:
      drawBarrels(ctx, r, barrels, accent);
      break;
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} r
 * @param {number} count
 * @param {string} accent
 */
function drawBarrels(ctx, r, count, accent) {
  const barrelLen = r * 1.1;
  const barrelW = Math.max(1.2, r * 0.16);
  for (let i = 0; i < count; i += 1) {
    const offset = (i - (count - 1) / 2) * barrelW * 1.4;
    ctx.fillStyle = TOWER.barrel;
    ctx.fillRect(0, offset - barrelW / 2, barrelLen, barrelW);
    ctx.fillStyle = TOWER.barrelHighlight;
    ctx.fillRect(0, offset - barrelW / 2, barrelLen, barrelW * 0.3);
    ctx.fillStyle = accent;
    ctx.fillRect(barrelLen - barrelW * 0.6, offset - barrelW / 2, barrelW * 0.6, barrelW);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} r
 * @param {string} accent
 */
function drawRifle(ctx, r, accent) {
  const len = r * 1.6;
  const w = Math.max(1, r * 0.1);
  ctx.fillStyle = TOWER.barrel;
  ctx.fillRect(0, -w / 2, len, w);
  ctx.fillStyle = TOWER.barrelHighlight;
  ctx.fillRect(0, -w / 2, len, w * 0.25);
  ctx.fillStyle = accent;
  ctx.fillRect(len * 0.55, -w * 0.9, w * 0.5, w * 1.8);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} r
 * @param {string} accent
 */
function drawMortar(ctx, r, accent) {
  const len = r * 0.75;
  const w = Math.max(2, r * 0.42);
  ctx.fillStyle = TOWER.barrel;
  ctx.beginPath();
  ctx.moveTo(0, -w / 2);
  ctx.lineTo(len, -w * 0.62);
  ctx.lineTo(len, w * 0.62);
  ctx.lineTo(0, w / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(len, 0, w * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} r
 * @param {number} chainCount
 * @param {string} accent
 */
function drawChainArray(ctx, r, chainCount, accent) {
  const rods = Math.max(2, Math.min(5, chainCount));
  const spread = Math.PI / 3;
  for (let i = 0; i < rods; i += 1) {
    const angle = rods === 1 ? 0 : -spread / 2 + (spread * i) / (rods - 1);
    const len = r * (0.85 + (i % 2) * 0.15);
    const tipX = Math.cos(angle) * len;
    const tipY = Math.sin(angle) * len;
    ctx.strokeStyle = TOWER.turretMetal;
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(tipX, tipY, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} r
 * @param {string} accent
 */
function drawBeacon(ctx, r, accent) {
  ctx.strokeStyle = withAlpha(accent, 0.7);
  ctx.setLineDash([r * 0.15, r * 0.12]);
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  drawRegularPolygon(ctx, 0, 0, r * 0.4, 6, 0);
  ctx.fillStyle = accent;
  ctx.fill();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} r
 * @param {string} accent
 */
function drawCoinSlot(ctx, r, accent) {
  ctx.fillStyle = TOWER.turretMetal;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.beginPath();
  ctx.moveTo(-r * 0.16, -r * 0.24);
  ctx.lineTo(-r * 0.16, r * 0.24);
  ctx.moveTo(r * 0.16, -r * 0.24);
  ctx.lineTo(r * 0.16, r * 0.24);
  ctx.moveTo(-r * 0.24, 0);
  ctx.lineTo(r * 0.24, 0);
  ctx.stroke();
}

/** The turret head: a metal hub with a rim-light arc facing the palette's light direction. Drawn unrotated, on top of the (rotated) barrel, so the hub itself never spins even though its payload does. */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {string} accent
 */
function drawTurretHub(ctx, cx, cy, r, accent) {
  const hubR = r * 0.52;
  ctx.fillStyle = TOWER.turretMetal;
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, hubR * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = TOWER.rimLight;
  ctx.lineWidth = Math.max(1, hubR * 0.14);
  ctx.beginPath();
  ctx.arc(cx, cy, hubR * 0.86, LIGHT_ANGLE_RADIANS - 0.9, LIGHT_ANGLE_RADIANS + 0.9);
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
function drawAntiAirSpike(ctx, cx, cy, r) {
  ctx.fillStyle = TOWER.antiAirSpike;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.15);
  ctx.lineTo(cx - r * 0.08, cy - r * 0.55);
  ctx.lineTo(cx + r * 0.08, cy - r * 0.55);
  ctx.closePath();
  ctx.fill();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
function drawSensorLens(ctx, cx, cy, r) {
  const x = cx + r * 0.6;
  const y = cy - r * 0.6;
  ctx.fillStyle = shade(TOWER.plinth, -0.1);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = TOWER.sensorLens;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} level
 */
function drawLevelPips(ctx, cx, cy, r, level) {
  if (level <= 0) return;
  const y = cy + r * 1.3;
  const spacing = r * 0.22;
  const startX = cx - ((level - 1) * spacing) / 2;
  ctx.fillStyle = TOWER.rimLight;
  for (let i = 0; i < level; i += 1) {
    ctx.beginPath();
    ctx.arc(startX + i * spacing, y, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {number} sides
 * @param {number} rotation  radians
 */
function drawRegularPolygon(ctx, cx, cy, radius, sides, rotation) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Cached entry point. Quantizes rotation into ROTATION_CACHE_BUCKETS steps so
 * every tower of a given (id, level, size) facing roughly the same direction
 * shares one cached bitmap, rather than redrawing full vector art per tower
 * per frame.
 * @param {import('../../data/schema/types.js').TowerDef} def
 * @param {import('../../data/schema/types.js').TowerLevel} levelDef
 * @param {number} size
 * @param {number} rotationRadians
 * @returns {OffscreenCanvas|HTMLCanvasElement}
 */
export function getTowerSprite(def, levelDef, size, rotationRadians) {
  const { index, angle } = quantizeAngle(rotationRadians, ROTATION_CACHE_BUCKETS);
  const signature = `${towerSpriteSignature(def, levelDef, size)}:r${index}`;
  return getCachedCanvas(signature, size, size, (ctx) => drawTower(ctx, size, def, levelDef, angle));
}
