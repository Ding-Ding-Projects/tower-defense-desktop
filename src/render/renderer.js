/**
 * The canvas renderer.
 *
 * Draws the terrain, the worn track, the placement zones, the towers, the enemies,
 * the projectiles and their effects, then hands the frame to the in-canvas interface
 * layer which draws the shop, the heads-up display and the panels on top.
 *
 * All the drawing itself lives in ./art. This file's job is the geometry: where each
 * thing is on screen, how big it is, which way it faces, and how far through its walk
 * cycle it has got. Keeping those apart is what lets the art be checked without a
 * canvas and the placement be checked without a picture.
 *
 * This module is runtime and canvas facing, so it is not covered by node --test. It is
 * verified by driving the real built program headlessly and capturing the window.
 */

import { worldToScreen } from './camera.js';
import { fromFixed } from '../sim/core/fixed.js';
import {
  getTerrainSprite,
  drawPath,
  getTowerSprite,
  getEnemySprite,
  drawMuzzleFlash,
  drawImpactSpark,
  drawExplosion,
  drawLeakFlash,
  TOWER_WORLD_SIZE,
  ENEMY_WORLD_SIZE,
  PROJECTILE_WORLD_SIZE,
} from './art/index.js';

/**
 * Sizes are in MAP UNITS, multiplied by the camera zoom at draw time.
 *
 * The camera zoom is pixels per map unit and sits around seven on a normal window, so
 * a constant that quietly assumed a zoom of one drew a 650 pixel tower and a 150 pixel
 * health bar. Everything visible is measured in the units the simulation uses and
 * tower ranges are published in, which is the only way a range circle and the tower it
 * belongs to can agree about where it ends.
 *
 * The art module publishes its own world sizes; these scale them for this map's
 * proportions, where two hundred units span a couple of thousand pixels.
 */
export const WORLD = Object.freeze({
  tower: TOWER_WORLD_SIZE * 1.6,
  enemy: ENEMY_WORLD_SIZE * 2.1,
  projectile: PROJECTILE_WORLD_SIZE,
  particle: 0.35,
  laneWidth: 4.5,
  // Narrower than the creature it belongs to, not wider. At 2.6 the bar was broader
  // than the enemy's own body and became the thing the eye landed on.
  healthBarWidth: 1.9,
  healthBarHeight: 0.32,
  healthBarGap: 0.5,
});

/** Sprite texture resolution. NOT a size on screen. */
const SPRITE_PX = 128;

export class CanvasRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../data/schema/types.js').GameData} gameData
   * @param {import('../data/schema/types.js').MapDef} mapDef
   */
  constructor(canvas, gameData, mapDef) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    // Refused here rather than discovered later. Without a 2D context this class cannot
    // do anything at all, and letting it be built anyway means the failure surfaces as
    // a TypeError somewhere deep in a draw call, several frames and one stack trace
    // away from the thing that actually went wrong.
    if (!ctx) throw new Error('CanvasRenderer: the canvas has no 2D context');
    this.ctx = ctx;
    this.gameData = gameData;
    this.mapDef = mapDef;
    /** @type {string|number|null} */
    this.selectedTowerId = null;
    /** @type {string|null} */
    this.placingTowerDefId = null;
    this.reducedMotion = false;
    this._leakFlashUntil = 0;

    // Set here as well as in resize(), which is where they were only ever set before.
    // Drawing before the first resize would otherwise work with undefined dimensions,
    // and undefined arithmetic produces NaN coordinates rather than an error, so the
    // frame comes out blank with nothing to say about it.
    this.dpr = 1;
    this.cssWidth = 0;
    this.cssHeight = 0;

    /**
     * Per-enemy walk phase, last position and facing.
     *
     * The phase advances by the distance the enemy actually moved, not by elapsed
     * time, so a fast enemy takes quicker steps and a lumbering one takes slow ones
     * without either being told its own speed. Facing comes from the same delta, so
     * everything turns to look where it is going.
     * @type {Map<number, { phase: number, x: number, y: number, facing: number }>}
     */
    this._gait = new Map();

    /**
     * Transient effects: a position, a kind and a start time, plus whatever that kind
     * needs. A muzzle flash needs the angle it points; an explosion needs its radius;
     * both need how long they last.
     * @type {{
     *   x: number, y: number, kind: string, start: number,
     *   life?: number, radius?: number, angle?: number,
     * }[]}
     */
    this._effects = [];

    /**
     * The in-canvas interface, drawn last so it sits above the battlefield.
     * @type {import('./hud/interface-layer.js').InterfaceLayer|null}
     */
    this.interfaceLayer = null;
    /** @type {import('./hud/interface-layer.js').InterfaceState|null} */
    this.interfaceState = null;
  }

  /**
   * @param {number} cssWidth
   * @param {number} cssHeight
   * @param {number} [devicePixelRatio]
   */
  resize(cssWidth, cssHeight, devicePixelRatio = window.devicePixelRatio || 1) {
    this.canvas.width = Math.round(cssWidth * devicePixelRatio);
    this.canvas.height = Math.round(cssHeight * devicePixelRatio);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.dpr = devicePixelRatio;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
  }

  /**
   * @param {import('./view-model.js').ViewModel} viewModel
   * @param {{ x: number, y: number, zoom: number }} camera
   * @param {import('./particles.js').ParticleSystem} particles
   */
  /**
   * @param {any} viewModel
   * @param {{x: number, y: number, zoom: number}} camera
   * @param {any} [particles]
   */
  draw(viewModel, camera, particles) {
    const ctx = this.ctx;
    const w = this.cssWidth;
    const h = this.cssHeight;
    const now = performance.now();

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawGround(camera, w, h);
    this._drawTrack(camera, w, h);
    this._drawZones(camera, w, h);

    for (const event of viewModel.events) this._handleEvent(event, particles, now);

    for (const tower of viewModel.towers) this._drawTower(tower, viewModel, camera, w, h);
    for (const enemy of viewModel.enemies) this._drawEnemy(enemy, camera, w, h);
    for (const proj of viewModel.projectiles) this._drawProjectile(proj, camera, w, h);

    this._drawEffects(camera, w, h, now);
    particles.forEachParticle((/** @type {any} */ p) => this._drawParticle(p, camera, w, h));
    particles.forEachDamageNumber((/** @type {any} */ d) => this._drawDamageNumber(d, camera, w, h));

    this._forgetDepartedEnemies(viewModel);

    if (this.interfaceLayer && this.interfaceState) {
      this.interfaceLayer.draw(ctx, { x: 0, y: 0, width: w, height: h }, this.interfaceState);
    }

    if (now < this._leakFlashUntil) {
      drawLeakFlash(ctx, w, h, 1 - (this._leakFlashUntil - now) / 260);
    }

    ctx.restore();
  }

  /** The ground, generated once per map and then blitted. */
  /**
   * @param {{x: number, y: number, zoom: number}} camera
   * @param {number} w  viewport width in CSS pixels
   * @param {number} h
   */
  _drawGround(camera, w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, w, h);
    const topLeft = worldToScreen(camera, w, h, 0, 0);
    const bottomRight = worldToScreen(camera, w, h, this.mapDef.width, this.mapDef.height);
    const sprite = getTerrainSprite(this.mapDef.id, this.mapDef.width, this.mapDef.height);
    ctx.drawImage(
      sprite,
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y,
    );
  }

  /**
   * @param {{x: number, y: number, zoom: number}} camera
   * @param {number} w  viewport width in CSS pixels
   * @param {number} h
   */
  _drawTrack(camera, w, h) {
    for (const lane of this.mapDef.lanes) {
      const points = lane.waypoints.map((wp) => worldToScreen(camera, w, h, wp.x, wp.y));
      drawPath(this.ctx, points, WORLD.laneWidth * camera.zoom, this.mapDef.id, {});
    }
  }

  /**
   * @param {{x: number, y: number, zoom: number}} camera
   * @param {number} w  viewport width in CSS pixels
   * @param {number} h
   */
  _drawZones(camera, w, h) {
    if (!this.placingTowerDefId) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(122, 214, 138, 0.16)';
    ctx.strokeStyle = 'rgba(122, 214, 138, 0.7)';
    ctx.lineWidth = Math.max(1, 0.2 * camera.zoom);
    ctx.setLineDash([0.9 * camera.zoom, 0.7 * camera.zoom]);
    for (const zone of this.mapDef.placementZones) {
      ctx.beginPath();
      zone.polygon.forEach(([x, y], i) => {
        const p = worldToScreen(camera, w, h, x, y);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * A tower points at whatever it would actually be shooting: the nearest enemy inside
   * its range. Without this every turret faces the same way and the battlefield reads
   * as a diagram of towers rather than a fight.
   */
  /**
   * @param {any} tower
   * @param {any} viewModel
   * @param {{x: number, y: number, zoom: number}} camera
   * @param {number} w  viewport width in CSS pixels
   * @param {number} h
   */
  _drawTower(tower, viewModel, camera, w, h) {
    const def = this.gameData.towers.get(tower.defId);
    if (!def) return;
    const levelDef = def.levels[tower.level];
    if (!levelDef) return;

    const p = worldToScreen(camera, w, h, tower.x, tower.y);
    const size = WORLD.tower * camera.zoom;

    let facing = 0;
    let nearest = Infinity;
    for (const enemy of viewModel.enemies) {
      const dx = enemy.x - tower.x;
      const dy = enemy.y - tower.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= levelDef.range && distance < nearest) {
        nearest = distance;
        facing = Math.atan2(dy, dx);
      }
    }

    if (tower.id === this.selectedTowerId) {
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(208, 188, 255, 0.75)';
      ctx.fillStyle = 'rgba(208, 188, 255, 0.07)';
      ctx.lineWidth = Math.max(1, 0.18 * camera.zoom);
      ctx.arc(p.x, p.y, levelDef.range * camera.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    const sprite = getTowerSprite(def, levelDef, SPRITE_PX, facing);
    this.ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);
  }

  /**
   * @param {any} enemy
   * @param {{x: number, y: number, zoom: number}} camera
   * @param {number} w  viewport width in CSS pixels
   * @param {number} h
   */
  _drawEnemy(enemy, camera, w, h) {
    const def = this.gameData.enemies.get(enemy.defId);
    if (!def) return;

    const gait = this._advanceGait(enemy);
    const p = worldToScreen(camera, w, h, enemy.x, enemy.y);
    const size = WORLD.enemy * camera.zoom;
    const hpRatio = Math.max(0, Math.min(1, enemy.hpCurrent / Math.max(1, enemy.hpMax)));

    const sprite = getEnemySprite(def, SPRITE_PX, gait.phase, gait.facing, hpRatio);
    this.ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);

    // Only once something has actually been hurt. A full bar carries no information
    // and there is one per enemy, so a wave in good health rendered as a wall of green
    // rectangles sitting above creatures narrower than the bars themselves. What a
    // player needs to see at a glance is which enemies are hurt, and that reads far
    // better when the undamaged ones are not shouting.
    if (hpRatio < 1) {
      this._drawHealthBar(
        p.x,
        p.y - size / 2 - WORLD.healthBarGap * camera.zoom,
        WORLD.healthBarWidth * camera.zoom,
        hpRatio,
        camera.zoom,
      );
    }

    let iconX = p.x - size / 2;
    for (const status of enemy.statuses) {
      this._drawStatusIcon(iconX, p.y + size / 2 + 0.3 * camera.zoom, status, camera.zoom);
      iconX += 0.8 * camera.zoom;
    }
  }

  /**
   * Advance the walk cycle by the distance actually covered, and face the direction of
   * travel. Driving the gait from elapsed time instead would make a lumbering boss and
   * a sprinting runner step at exactly the same rate, which reads as a sliding sprite
   * rather than a walking thing.
   */
  /**
   * @param {any} enemy
   * @returns {{phase: number, facing: number}}
   */
  _advanceGait(enemy) {
    const previous = this._gait.get(enemy.id);
    if (!previous) {
      const fresh = { phase: 0, x: enemy.x, y: enemy.y, facing: 0 };
      this._gait.set(enemy.id, fresh);
      return fresh;
    }
    const dx = enemy.x - previous.x;
    const dy = enemy.y - previous.y;
    const moved = Math.hypot(dx, dy);
    if (moved > 0.0001) {
      previous.facing = Math.atan2(dy, dx);
      // One full stride per map unit and a half, so the step length is believable at
      // the scale everything else is drawn at.
      previous.phase = (previous.phase + moved / 1.5) % 1;
    }
    previous.x = enemy.x;
    previous.y = enemy.y;
    return previous;
  }

  /** Forget gait state for anything dead or leaked, so the map cannot grow forever. */
  /**
   * @param {any} viewModel
   */
  _forgetDepartedEnemies(viewModel) {
    if (this._gait.size <= viewModel.enemies.length) return;
    const alive = new Set(viewModel.enemies.map((/** @type {any} */ e) => e.id));
    for (const id of this._gait.keys()) {
      if (!alive.has(id)) this._gait.delete(id);
    }
  }

  /**
   * @param {import('./sim-interface.js').SnapshotEvent} event
   * @param {any} particles
   * @param {number} now  milliseconds
   */
  _handleEvent(event, particles, now) {
    const x = fromFixed(event.x);
    const y = fromFixed(event.y);
    if (event.type === 'leak') {
      this._leakFlashUntil = now + 260;
      return;
    }
    if (this.reducedMotion) return;
    if (event.type === 'damageDealt') {
      particles.emitDamageNumber(x, y, event.amount, 'damage');
      this._effects.push({ kind: 'spark', x, y, start: now, life: 220 });
    } else if (event.type === 'kill') {
      this._effects.push({ kind: 'explosion', x, y, start: now, life: 420, radius: 1.6 });
    } else if (event.type === 'towerFired') {
      this._effects.push({ kind: 'muzzle', x, y, angle: event.angle ?? 0, start: now, life: 120 });
    } else if (event.type === 'abilityCast') {
      // Sized to the ability's own radius, so a player can see what it actually reached
      // rather than a flourish that means nothing. Freezer's Frost Grenade covers 6 map
      // units and used to produce no sign at all that it had gone off.
      this._effects.push({
        kind: 'explosion', x, y, start: now, life: 520, radius: event.radius ?? 3,
      });
    } else if (event.type === 'towerPlaced' || event.type === 'towerSold') {
      this._effects.push({ kind: 'spark', x, y, start: now, life: 320 });
    }
  }

  /**
   * @param {{x: number, y: number, zoom: number}} camera
   * @param {number} w  viewport width in CSS pixels
   * @param {number} h
   * @param {number} now  milliseconds
   */
  _drawEffects(camera, w, h, now) {
    const ctx = this.ctx;
    const surviving = [];
    for (const effect of this._effects) {
      // Every effect is pushed with a life, but the shape allows it to be absent and
      // dividing by undefined gives NaN, which compares false against every threshold:
      // the effect would never expire and would be redrawn forever.
      const t = (now - effect.start) / (effect.life ?? 1);
      if (t >= 1) continue;
      const p = worldToScreen(camera, w, h, effect.x, effect.y);
      const size = camera.zoom;
      if (effect.kind === 'spark') drawImpactSpark(ctx, p.x, p.y, t, size);
      else if (effect.kind === 'explosion') {
        drawExplosion(ctx, p.x, p.y, (effect.radius ?? 1.5) * camera.zoom, t, size);
      } else if (effect.kind === 'muzzle') drawMuzzleFlash(ctx, p.x, p.y, effect.angle ?? 0, t, size);
      surviving.push(effect);
    }
    this._effects = surviving;
  }

  /**
   * @param {number} cx
   * @param {number} y
   * @param {number} width
   * @param {number} ratio  0..1
   * @param {number} zoom
   */
  _drawHealthBar(cx, y, width, ratio, zoom) {
    const ctx = this.ctx;
    // Sized in map units like everything else. A pixel floor here quietly undoes the
    // world sizing at low zoom and puts a bar wider than its own enemy.
    const barWidth = width;
    const barHeight = Math.max(2, WORLD.healthBarHeight * zoom);
    const x = cx - barWidth / 2;
    const clamped = Math.min(1, Math.max(0, ratio));
    ctx.save();
    ctx.fillStyle = 'rgba(8, 10, 13, 0.75)';
    ctx.fillRect(x - 1, y - 1, barWidth + 2, barHeight + 2);
    ctx.fillStyle = '#23262d';
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = clamped > 0.5 ? '#5fd37a' : clamped > 0.2 ? '#ffb300' : '#e5484d';
    ctx.fillRect(x, y, barWidth * clamped, barHeight);
    ctx.restore();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {{id: string, stacks?: number}} status
   * @param {number} zoom
   */
  _drawStatusIcon(x, y, status, zoom) {
    const ctx = this.ctx;
    const colours = {
      stun: '#ffd166',
      slow: '#7ec8e3',
      freeze: '#9fe3ff',
      burn: '#ff8a4c',
      poison: '#8ad06a',
      exposed: '#d6a2ff',
      haste: '#ff6b9d',
    };
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, 0.3 * zoom), 0, Math.PI * 2);
    ctx.fillStyle = /** @type {Record<string, string|undefined>} */ (colours)[status.id] ?? '#9aa0a6';
    ctx.fill();
    ctx.restore();
  }

  /**
   * @param {any} proj
   * @param {{x: number, y: number, zoom: number}} camera
   * @param {number} w  viewport width in CSS pixels
   * @param {number} h
   */
  _drawProjectile(proj, camera, w, h) {
    const p = worldToScreen(camera, w, h, proj.x, proj.y);
    const ctx = this.ctx;
    const r = Math.max(1.5, WORLD.projectile * camera.zoom);
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(247, 213, 72, 0.25)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe89a';
    ctx.fill();
    ctx.restore();
  }

  /**
   * @param {any} p
   * @param {{x: number, y: number, zoom: number}} camera
   * @param {number} w  viewport width in CSS pixels
   * @param {number} h
   */
  _drawParticle(p, camera, w, h) {
    const screen = worldToScreen(camera, w, h, p.x, p.y);
    const alpha = Math.max(0, 1 - p.age / p.life);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, Math.max(1, WORLD.particle * camera.zoom), 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.restore();
  }

  /**
   * @param {any} d
   * @param {{x: number, y: number, zoom: number}} camera
   * @param {number} w  viewport width in CSS pixels
   * @param {number} h
   */
  _drawDamageNumber(d, camera, w, h) {
    const screen = worldToScreen(camera, w, h, d.x, d.y);
    const alpha = Math.max(0, 1 - d.age / d.life);
    const rise = (d.age / d.life) * 1.4 * camera.zoom;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${Math.max(10, 0.9 * camera.zoom)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.strokeText(String(d.amount), screen.x, screen.y - rise);
    ctx.fillStyle = '#ffd9d9';
    ctx.fillText(String(d.amount), screen.x, screen.y - rise);
    ctx.restore();
  }
}
