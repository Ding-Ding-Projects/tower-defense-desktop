/**
 * Enemies as creatures and machines, not tinted blobs. Every body gets real
 * volume (a gradient shaded toward the scene's own light direction, never a
 * flat fill), a tight contact shadow that softens outward, anatomy derived
 * from the enemy's own data fields, a walk cycle that actually alternates
 * limbs, materials that read as cloth, flesh or metal, and visible wear as
 * health drops. The special cases — boss, hidden, flying, shielded — are
 * built as genuinely different silhouettes, not the same body with a
 * different fill.
 *
 * Archetype is chosen from real fields only (boss, flying, hidden, defense,
 * speed), never from id or displayName, so a brand new enemy row gets a
 * sensible body with no matching art commission:
 *   boss                    -> 'boss'    large, heavily plated, own silhouette
 *   flying                  -> 'flier'   wings, lifted off the ground
 *   hidden                  -> 'wraith'  translucent refractive shimmer
 *   defense >= 12            -> 'machine' hull, tracks, panel lines, no limbs
 *   defense >= 3              -> 'armored' humanoid with visible plate segments
 *   speed >= 5                -> 'fast'    leaner, forward-pitched humanoid
 *   otherwise                -> 'walker'  the base humanoid: head, torso, arms, legs
 *
 * `drawEnemy` is the pure function the renderer calls. Beyond the base
 * (ctx, size, def, phase) contract, it also takes `facingRadians` (which way
 * the enemy is moving — 0 points along +x/screen-right, matching the same
 * convention towers.js rotation uses) and `hpRatio` (hpCurrent / hpMax, for
 * visible damage wear); both default to a sensible neutral value so an older
 * caller passing only four arguments still gets a correctly facing, undamaged
 * enemy. `getEnemySprite` is the cached wrapper: phase and facing are each
 * quantized into a fixed number of buckets, so a wave of identical enemies
 * shares a small, bounded set of cached bitmaps rather than one redraw per
 * enemy per frame.
 */

import { ENEMY, HIDDEN_ALPHA, LIGHT_DIRECTION, LIGHT_ANGLE_RADIANS, shade, withAlpha, mixColors } from './palette.js';
import { getCachedCanvas, quantizePhase, quantizeAngle } from './cache.js';

/** Base world size of an enemy, in map units. */
export const ENEMY_WORLD_SIZE = 2;

const PHASE_CACHE_BUCKETS = 12;
const FACING_CACHE_BUCKETS = 16;

/**
 * @param {import('../../data/schema/types.js').EnemyDef} def
 * @param {number} size
 * @returns {string}
 */
export function enemySpriteSignature(def, size) {
  return `enemy:${def.id}:${size}`;
}

/** @typedef {'boss'|'flier'|'wraith'|'machine'|'armored'|'fast'|'walker'} EnemyArchetype */

/**
 * @param {import('../../data/schema/types.js').EnemyDef} def
 * @returns {'boss'|'flier'|'wraith'|'machine'|'armored'|'fast'|'walker'}
 */
export function enemyArchetype(def) {
  if (def.boss) return 'boss';
  if (def.flying) return 'flier';
  if (def.hidden) return 'wraith';
  const defense = def.defense ?? 0;
  if (defense >= 12) return 'machine';
  if (defense >= 3) return 'armored';
  if ((def.speed ?? 0) >= 5) return 'fast';
  return 'walker';
}

/**
 * @param {number} maxHp
 * @returns {number}
 */
function hpScale(maxHp) {
  return clamp(0.72 + Math.log10(Math.max(10, maxHp)) * 0.16, 0.72, 1.55);
}

/**
 * The rendered body radius for an enemy at a given sprite size — exported so
 * a caller (or a test) can reason about an enemy's on-screen footprint
 * without re-deriving the scale rules baked into drawEnemy. A boss is
 * substantially larger than a basic enemy of the same sprite size because of
 * the explicit boss multiplier here, on top of the shared maxHp scale.
 * @param {number} size
 * @param {import('../../data/schema/types.js').EnemyDef} def
 * @returns {number}
 */
export function enemyBodyRadius(size, def) {
  const archetype = enemyArchetype(def);
  const scale = hpScale(def.maxHp) * (def.boss ? 1.7 : 1) * (archetype === 'fast' ? 0.92 : 1);
  // 0.27 left the creature occupying roughly half its own sprite box, which at
  // gameplay zoom is a twenty pixel smudge with a health bar wider than it sitting on
  // top. The box still needs headroom for a boss's bulk, a flier's lift and a wraith's
  // drift, so this is not the whole box either.
  return size * 0.34 * scale;
}

/**
 * @param {EnemyArchetype} archetype
 * @returns {string}
 */
function baseColor(archetype) {
  switch (archetype) {
    case 'boss': return ENEMY.boss;
    case 'flier': return ENEMY.flying;
    case 'wraith': return ENEMY.hidden;
    case 'machine': return ENEMY.machineHull;
    case 'armored': return ENEMY.metal;
    case 'fast': return ENEMY.fast;
    default: return ENEMY.normal;
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size
 * @param {import('../../data/schema/types.js').EnemyDef} def
 * @param {number} phase           animation phase in radians, any range
 * @param {number} [facingRadians] direction of travel; 0 = +x/screen-right
 * @param {number} [hpRatio]       hpCurrent / hpMax, 0..1; 1 = undamaged
 */
export function drawEnemy(ctx, size, def, phase, facingRadians = 0, hpRatio = 1) {
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const archetype = enemyArchetype(def);
  const hp = clamp(hpRatio, 0, 1);
  const r = enemyBodyRadius(size, def);
  const lift = def.flying ? r * 0.95 : 0;
  const groundY = cy + r * 0.18;
  const shadowX = def.flying ? cx + r * 0.18 : cx;
  const bodyY = cy - lift;
  const speedFactor = clamp((def.speed ?? 3) / 3.2, 0.55, 1.9);
  const color = baseColor(archetype);

  drawContactShadow(ctx, shadowX, groundY, r, archetype);

  ctx.save();
  ctx.translate(cx, bodyY);
  if (archetype === 'machine') {
    ctx.rotate(facingRadians);
  } else if (Math.cos(facingRadians) < 0) {
    ctx.scale(-1, 1);
  }

  if (archetype === 'machine') {
    drawMachineBody(ctx, r, color, phase, speedFactor, hp);
  } else if (archetype === 'flier') {
    drawFlierBody(ctx, r, color, phase, speedFactor, hp);
  } else if (archetype === 'wraith') {
    drawWraithBody(ctx, r, color, phase, speedFactor, hp);
  } else {
    drawHumanoidBody(ctx, r, color, phase, speedFactor, hp, {
      armored: archetype === 'armored' || archetype === 'boss',
      boss: archetype === 'boss',
      lean: archetype === 'fast' ? 1 : 0,
    });
  }

  ctx.restore();

  if (def.shieldHp > 0) drawShieldOverlay(ctx, cx, bodyY, r, phase);
}

/* ---------------------------------------------------------------- shadow */

/** Tight and dark directly under the body, softening outward: a radial gradient squashed into an ellipse, never a flat translucent disc. */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} groundY
 * @param {number} r
 * @param {EnemyArchetype} archetype
 */
function drawContactShadow(ctx, cx, groundY, r, archetype) {
  const squash = 0.36;
  const faint = archetype === 'wraith';
  const radius = r * (archetype === 'flier' ? 0.85 : 1.1);
  ctx.save();
  ctx.translate(cx, groundY);
  ctx.scale(1, squash);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, faint ? 'rgba(6, 10, 16, 0.16)' : 'rgba(6, 10, 16, 0.55)');
  gradient.addColorStop(0.55, faint ? 'rgba(6, 10, 16, 0.08)' : 'rgba(6, 10, 16, 0.28)');
  gradient.addColorStop(1, 'rgba(6, 10, 16, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* -------------------------------------------------------- volume filling */

/**
 * The one routine every solid body shape uses to look like it has volume:
 * a radial gradient whose hot spot is offset toward the scene light
 * direction (lit side), fading through the base colour to a shaded rim on
 * the far side, plus a soft warm bounce-light smudge on the underside where
 * light reflects up off the ground. Never a single flat fillStyle.
 */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} rx
 * @param {number} ry
 * @param {string} color
 * @param {{ metal?: boolean }} [options]
 */
function fillWithVolume(ctx, cx, cy, rx, ry, color, options = {}) {
  const hot = { x: cx + LIGHT_DIRECTION.x * rx * 0.55, y: cy + LIGHT_DIRECTION.y * ry * 0.55 };
  const gradient = ctx.createRadialGradient(hot.x, hot.y, Math.max(0.5, rx * 0.05), cx, cy, Math.max(rx, ry) * 1.15);
  const lit = options.metal ? shade(color, 0.5) : mixColors(color, '#ffffff', 0.28);
  const shaded = options.metal ? shade(color, -0.45) : shade(color, -0.35);
  gradient.addColorStop(0, lit);
  gradient.addColorStop(0.55, color);
  gradient.addColorStop(1, shaded);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bounce light: a faint warm arc along the underside, away from the key light.
  ctx.fillStyle = ENEMY.bounceLight;
  ctx.beginPath();
  ctx.ellipse(cx - LIGHT_DIRECTION.x * rx * 0.3, cy - LIGHT_DIRECTION.y * ry * 0.3, rx * 0.55, ry * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (options.metal) {
    ctx.strokeStyle = ENEMY.metalHighlight;
    ctx.lineWidth = Math.max(1, rx * 0.1);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(rx, ry) * 0.82, LIGHT_ANGLE_RADIANS - 0.6, LIGHT_ANGLE_RADIANS + 0.3);
    ctx.stroke();
  }
}

/* ------------------------------------------------------------- wear/gait */

/**
 * @param {number} phase  walk phase, advanced by distance travelled
 * @param {number} speedFactor
 * @param {number} amplitude
 * @param {number} phaseOffset
 * @param {boolean} limp
 * @returns {number}
 */
function limbSwing(phase, speedFactor, amplitude, phaseOffset, limp) {
  const p = phase * speedFactor + phaseOffset;
  const factor = limp ? 0.6 : 1;
  return Math.sin(p) * amplitude * factor;
}

/** Scorching, cracks: extra draw calls only, never fewer, so a damaged enemy always draws at least as much as an undamaged one. */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} r
 * @param {number} hp  0..1
 */
function drawWear(ctx, r, hp) {
  if (hp >= 0.66) return;
  ctx.fillStyle = ENEMY.scorch;
  ctx.beginPath();
  ctx.ellipse(r * 0.18, r * 0.1, r * 0.4, r * 0.28, 0.4, 0, Math.PI * 2);
  ctx.fill();

  if (hp < 0.4) {
    ctx.strokeStyle = ENEMY.crack;
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath();
    ctx.moveTo(-r * 0.25, -r * 0.5);
    ctx.lineTo(-r * 0.05, -r * 0.05);
    ctx.lineTo(-r * 0.3, r * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * 0.15, -r * 0.35);
    ctx.lineTo(r * 0.32, r * 0.1);
    ctx.stroke();
  }
}

/* ---------------------------------------------------------- eyes / face */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @param {string} eyeColor
 * @param {boolean} dim
 */
function drawEyes(ctx, x, y, r, eyeColor, dim) {
  ctx.fillStyle = dim ? withAlpha(eyeColor, 0.6) : eyeColor;
  ctx.beginPath();
  ctx.arc(x + r * 0.28, y - r * 0.06, r * 0.1, 0, Math.PI * 2);
  ctx.arc(x + r * 0.46, y - r * 0.02, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

/* --------------------------------------------------------- walker/boss */

/**
 * The base humanoid: head, torso, two arms and two legs. Drawn in profile
 * (the way a 2D top-down game actually shows a walking character) so the
 * legs sit in front of and behind the torso along the facing axis rather
 * than side by side, and alternate on the walk cycle exactly like a real
 * gait: front leg forward while the back leg drives, arms swinging opposite
 * their nearest leg, a slight double-frequency bob and counter-rotation of
 * the torso on every step.
 */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} r
 * @param {string} color
 * @param {number} phase
 * @param {number} speedFactor
 * @param {number} hp  0..1
 * @param {{ armored: boolean, boss: boolean, lean: number }} opts
 */
function drawHumanoidBody(ctx, r, color, phase, speedFactor, hp, opts) {
  const limp = hp < 0.5 && !opts.boss;
  const strideAmp = r * (opts.boss ? 0.3 : 0.42);
  const armAmp = r * 0.3;
  const lean = opts.lean ? r * 0.28 : 0;

  const frontLegX = limbSwing(phase, speedFactor, strideAmp, 0, limp);
  const backLegX = limbSwing(phase, speedFactor, strideAmp, Math.PI, false);
  const frontArmX = limbSwing(phase, speedFactor, armAmp, Math.PI, false);
  const backArmX = limbSwing(phase, speedFactor, armAmp, 0, false);
  const bob = -Math.abs(Math.sin(phase * speedFactor)) * r * 0.08;
  const torsoTilt = Math.sin(phase * speedFactor) * 0.05;

  const hipY = r * 0.5;
  const shoulderY = -r * 0.18 + bob;
  const legColor = shade(color, -0.3);
  const armColor = shade(color, -0.12);

  // Back leg, drawn first so the front leg overlaps it during the stride.
  drawLimb(ctx, 0, hipY, backLegX, hipY + r * 0.65, legColor, r * 0.16);
  // Back arm.
  drawLimb(ctx, lean * 0.4, shoulderY, backArmX * 0.7, shoulderY + r * 0.55, armColor, r * 0.12);

  // Torso.
  ctx.save();
  ctx.translate(lean * 0.5, bob * 0.4);
  ctx.rotate(torsoTilt);
  fillWithVolume(ctx, 0, 0, r * 0.4, r * 0.58, color, { metal: opts.armored });
  ctx.strokeStyle = ENEMY.outline;
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.4, r * 0.58, 0, 0, Math.PI * 2);
  ctx.stroke();

  if (opts.armored) {
    drawPlateSegments(ctx, r * 0.4, r * 0.58, hp, opts.boss);
  } else {
    ctx.strokeStyle = ENEMY.clothFold;
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.2);
    ctx.quadraticCurveTo(0, r * 0.05, -r * 0.12, r * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * 0.18, -r * 0.15);
    ctx.quadraticCurveTo(r * 0.05, r * 0.1, r * 0.14, r * 0.42);
    ctx.stroke();
  }

  drawWear(ctx, r, hp);
  ctx.restore();

  // Front arm, front leg: drawn last so they read as nearest the viewer.
  drawLimb(ctx, lean * 0.5, shoulderY, frontArmX * 0.7, shoulderY + r * 0.55, armColor, r * 0.13);
  drawLimb(ctx, 0, hipY, frontLegX, hipY + r * 0.65, legColor, r * 0.18);

  // Head.
  const headX = lean + Math.sin(phase * speedFactor) * r * 0.02;
  const headY = -r * 0.95 + bob * 0.5;
  const headR = r * (opts.boss ? 0.5 : 0.4);
  const headColor = opts.armored ? shade(color, 0.05) : mixColors(color, ENEMY.skinWarm, 0.35);
  fillWithVolume(ctx, headX, headY, headR, headR, headColor, { metal: opts.armored });
  ctx.strokeStyle = ENEMY.outline;
  ctx.lineWidth = Math.max(1, r * 0.04);
  ctx.beginPath();
  ctx.arc(headX, headY, headR, 0, Math.PI * 2);
  ctx.stroke();

  if (opts.boss) drawCrown(ctx, headX, headY, headR);

  drawEyes(ctx, headX, headY, headR, ENEMY.eye, false);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {string} color
 * @param {number} width
 */
function drawLimb(ctx, x0, y0, x1, y1, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, width);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** Visible plate edges with a darker gap between them; missing plates as health drops. */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} rx
 * @param {number} ry
 * @param {number} hp  0..1
 * @param {boolean} boss
 */
function drawPlateSegments(ctx, rx, ry, hp, boss) {
  const totalPlates = boss ? 5 : 3;
  const visiblePlates = Math.max(1, Math.round(totalPlates * (0.4 + hp * 0.6)));
  const plateH = (ry * 1.7) / totalPlates;
  for (let i = 0; i < visiblePlates; i += 1) {
    const y = -ry * 0.85 + i * plateH + plateH * 0.05;
    ctx.fillStyle = boss ? ENEMY.bossPlate : ENEMY.defensePlate;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-rx * 0.82, y, rx * 1.64, plateH * 0.82, plateH * 0.15);
    else ctx.rect(-rx * 0.82, y, rx * 1.64, plateH * 0.82);
    ctx.fill();
    ctx.strokeStyle = ENEMY.defensePlateDark;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} headR
 */
function drawCrown(ctx, cx, cy, headR) {
  const spikes = 5;
  ctx.fillStyle = ENEMY.bossPlate;
  for (let i = 0; i < spikes; i += 1) {
    const angle = -Math.PI / 2 + (i - (spikes - 1) / 2) * 0.4;
    const baseA = angle - 0.12;
    const baseB = angle + 0.12;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(baseA) * headR * 0.9, cy + Math.sin(baseA) * headR * 0.9);
    ctx.lineTo(cx + Math.cos(angle) * headR * 1.5, cy + Math.sin(angle) * headR * 1.5);
    ctx.lineTo(cx + Math.cos(baseB) * headR * 0.9, cy + Math.sin(baseB) * headR * 0.9);
    ctx.closePath();
    ctx.fill();
  }
}

/* ------------------------------------------------------------- machine */

/** Hull, tracks, panel lines. No head, no limbs: a vehicle, not a creature wearing armour. */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} r
 * @param {string} color
 * @param {number} phase
 * @param {number} speedFactor
 * @param {number} hp  0..1
 */
function drawMachineBody(ctx, r, color, phase, speedFactor, hp) {
  const hullW = r * 1.7;
  const hullH = r * 1.1;

  drawTrack(ctx, -hullH * 0.62, hullW, hullH * 0.36, phase, speedFactor);
  drawTrack(ctx, hullH * 0.62, hullW, hullH * 0.36, phase, speedFactor);

  fillWithVolume(ctx, 0, 0, hullW * 0.5, hullH * 0.5, color, { metal: true });
  ctx.strokeStyle = ENEMY.machineHullDark;
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath();
  ctx.ellipse(0, 0, hullW * 0.5, hullH * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Panel lines.
  ctx.strokeStyle = ENEMY.machineHullDark;
  ctx.lineWidth = Math.max(1, r * 0.03);
  for (const t of [-0.3, 0.3]) {
    ctx.beginPath();
    ctx.moveTo(-hullW * 0.4, hullH * t);
    ctx.lineTo(hullW * 0.4, hullH * t);
    ctx.stroke();
  }

  // Rivets, fewer as the hull takes damage.
  const rivetCount = Math.max(2, Math.round(6 * (0.3 + hp * 0.7)));
  ctx.fillStyle = ENEMY.rivet;
  for (let i = 0; i < rivetCount; i += 1) {
    const x = -hullW * 0.35 + (i / Math.max(1, rivetCount - 1)) * hullW * 0.7;
    ctx.beginPath();
    ctx.arc(x, -hullH * 0.15, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  // Single forward sensor eye — a machine's face.
  drawEyes(ctx, hullW * 0.05, 0, r * 0.6, ENEMY.eye, false);

  drawWear(ctx, r, hp);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} offsetY
 * @param {number} length
 * @param {number} thickness
 * @param {number} phase
 * @param {number} speedFactor
 */
function drawTrack(ctx, offsetY, length, thickness, phase, speedFactor) {
  ctx.fillStyle = ENEMY.track;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-length / 2, offsetY - thickness / 2, length, thickness, thickness / 2);
  else ctx.rect(-length / 2, offsetY - thickness / 2, length, thickness);
  ctx.fill();

  const treadCount = 6;
  const scroll = (phase * speedFactor * length * 0.08) % (length / treadCount);
  ctx.strokeStyle = ENEMY.trackTread;
  ctx.lineWidth = Math.max(1, thickness * 0.18);
  for (let i = 0; i < treadCount; i += 1) {
    const x = -length / 2 + ((i * length) / treadCount + scroll);
    ctx.beginPath();
    ctx.moveTo(x, offsetY - thickness / 2);
    ctx.lineTo(x, offsetY + thickness / 2);
    ctx.stroke();
  }
}

/* --------------------------------------------------------------- flier */

/** Lifted off the ground (see the caller's `lift`), wings that actually flap. */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} r
 * @param {string} color
 * @param {number} phase
 * @param {number} speedFactor
 * @param {number} hp  0..1
 */
function drawFlierBody(ctx, r, color, phase, speedFactor, hp) {
  const flap = Math.sin(phase * speedFactor * 1.6);

  drawWing(ctx, -r * 0.1, -r * 0.1, r, flap, -1);
  drawWing(ctx, -r * 0.1, -r * 0.1, r, -flap, 1);

  fillWithVolume(ctx, 0, r * 0.1, r * 0.42, r * 0.5, color);
  ctx.strokeStyle = ENEMY.outline;
  ctx.lineWidth = Math.max(1, r * 0.04);
  ctx.beginPath();
  ctx.ellipse(0, r * 0.1, r * 0.42, r * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Legs tucked and trailing, not planted.
  ctx.strokeStyle = shade(color, -0.3);
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.12, r * 0.5);
  ctx.lineTo(-r * 0.12 + Math.sin(phase * speedFactor) * r * 0.08, r * 0.75);
  ctx.moveTo(r * 0.12, r * 0.5);
  ctx.lineTo(r * 0.12 - Math.sin(phase * speedFactor) * r * 0.08, r * 0.75);
  ctx.stroke();

  const headY = -r * 0.55;
  fillWithVolume(ctx, r * 0.05, headY, r * 0.28, r * 0.28, mixColors(color, ENEMY.skinWarm, 0.2));
  drawEyes(ctx, r * 0.05, headY, r * 0.28, ENEMY.eye, false);

  drawWear(ctx, r, hp);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @param {number} flap
 * @param {number} side  1 or -1
 */
function drawWing(ctx, x, y, r, flap, side) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(flap * 0.5 * side);
  ctx.fillStyle = ENEMY.wing;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(side * r * 0.9, -r * 0.5, side * r * 1.3, r * 0.05);
  ctx.quadraticCurveTo(side * r * 0.7, r * 0.15, 0, r * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ENEMY.outline;
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.stroke();
  ctx.restore();
}

/* -------------------------------------------------------------- wraith */

/** A translucent refractive shimmer: a faint edge and two ghost-hued echo outlines standing in for chromatic refraction, not a lower alpha on the solid body. */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} r
 * @param {string} color
 * @param {number} phase
 * @param {number} speedFactor
 * @param {number} hp  0..1
 */
function drawWraithBody(ctx, r, color, phase, speedFactor, hp) {
  const drift = Math.sin(phase * speedFactor * 0.7) * r * 0.05;

  // Annotated as pairs rather than left to inference. A literal array of mixed types
  // infers as (number|string)[], so both halves of the destructuring come out as either,
  // and the offset and the colour become interchangeable to the compiler.
  /** @type {Array<[number, string]>} */
  const echoes = [[-drift, ENEMY.wraithEchoA], [drift, ENEMY.wraithEchoB]];
  for (const [dx, tint] of echoes) {
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.ellipse(dx, r * 0.05, r * 0.4, r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = withAlpha(color, HIDDEN_ALPHA);
  ctx.beginPath();
  ctx.ellipse(0, r * 0.05, r * 0.4, r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = ENEMY.wraithEdge;
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath();
  ctx.ellipse(0, r * 0.05, r * 0.4, r * 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();

  const headY = -r * 0.75;
  ctx.strokeStyle = ENEMY.wraithEdge;
  ctx.beginPath();
  ctx.arc(0, headY, r * 0.32, 0, Math.PI * 2);
  ctx.stroke();

  drawEyes(ctx, 0, headY, r * 0.32, ENEMY.eyeDim, true);

  if (hp < 0.4) {
    ctx.strokeStyle = ENEMY.wraithEdge;
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, -r * 0.2);
    ctx.lineTo(r * 0.05, r * 0.3);
    ctx.stroke();
  }
}

/* --------------------------------------------------------------- shield */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} phase
 */
function drawShieldOverlay(ctx, cx, cy, r, phase) {
  const shimmer = 0.55 + Math.sin(phase * 0.5) * 0.1;
  ctx.strokeStyle = withAlpha(ENEMY.shield, shimmer);
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(ENEMY.shieldDark, shimmer * 0.7);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.32, 0, Math.PI * 2);
  ctx.stroke();
}

/* ----------------------------------------------------------------- misc */

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
 * Cached entry point: quantizes phase and facing into a bounded grid of
 * animation/orientation buckets and caches one bitmap per (enemy id, size,
 * phase bucket, facing bucket, damage tier). Damage tier is coarse (four
 * steps) since visible wear only changes a few times over an enemy's life,
 * unlike phase and facing which change every frame.
 * @param {import('../../data/schema/types.js').EnemyDef} def
 * @param {number} size
 * @param {number} phase
 * @param {number} [facingRadians]
 * @param {number} [hpRatio]
 * @returns {OffscreenCanvas|HTMLCanvasElement}
 */
export function getEnemySprite(def, size, phase, facingRadians = 0, hpRatio = 1) {
  const { index: phaseIndex, phase: bucketPhase } = quantizePhase(phase, PHASE_CACHE_BUCKETS);
  const { index: facingIndex, angle: bucketFacing } = quantizeAngle(facingRadians, FACING_CACHE_BUCKETS);
  const damageTier = Math.round(clamp(hpRatio, 0, 1) * 3);
  const signature = `${enemySpriteSignature(def, size)}:p${phaseIndex}:f${facingIndex}:d${damageTier}`;
  return getCachedCanvas(signature, size, size, (ctx) => drawEnemy(ctx, size, def, bucketPhase, bucketFacing, damageTier / 3));
}
