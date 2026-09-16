/**
 * The canvas renderer. Draws the lane, placement zones, towers, enemies,
 * projectiles, range circles, health bars, status icons, floating damage
 * numbers and the leak flash from a ViewModel (see view-model.js) each frame.
 *
 * This module is runtime/canvas-facing and is not covered by node --test — see
 * the top of tests/ui for why (canvas pixels are not something a unit test can
 * meaningfully assert on) and see docs/features/interface.md for how it is
 * verified instead (screenshots of the built app).
 */

import { worldToScreen } from './camera.js';
import { fromFixed } from '../sim/core/fixed.js';
import { getCachedSprite, drawTowerSprite, drawEnemySprite, towerSpriteSignature, enemySpriteSignature } from './procedural-draw.js';

/**
 * Sprites are cached at this pixel resolution and then scaled to their world size.
 * It is a texture resolution, NOT a size on screen.
 */
const SPRITE_PX = 96;

/**
 * Sizes are in MAP UNITS, multiplied by the camera zoom at draw time.
 *
 * The camera zoom is pixels per map unit and sits around seven on a normal window,
 * so a constant that quietly assumed a zoom of one drew a 650 pixel tower and a 150
 * pixel health bar. Everything on this screen is measured in the same units the
 * simulation and the tower ranges are quoted in, which is the only way a range circle
 * and the tower it belongs to can agree.
 */
const WORLD = Object.freeze({
  tower: 3.2,
  enemy: 2.0,
  projectile: 0.45,
  particle: 0.35,
  laneWidth: 8,
  healthBarWidth: 2.4,
  healthBarHeight: 0.45,
  healthBarGap: 0.6,
});

export class CanvasRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../data/schema/types.js').GameData} gameData
   * @param {import('../data/schema/types.js').MapDef} mapDef
   */
  constructor(canvas, gameData, mapDef) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gameData = gameData;
    this.mapDef = mapDef;
    this.selectedTowerId = null;
    this.placingTowerDefId = null;
    this.reducedMotion = false;
    this._leakFlashUntil = 0;
  }

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
  draw(viewModel, camera, particles) {
    const ctx = this.ctx;
    const w = this.cssWidth;
    const h = this.cssHeight;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(0, 0, w, h);

    this._drawZones(camera, w, h);
    this._drawLane(camera, w, h);

    for (const event of viewModel.events) {
      this._handleEvent(event, particles);
    }

    for (const tower of viewModel.towers) {
      this._drawTower(tower, camera, w, h);
    }
    for (const enemy of viewModel.enemies) {
      this._drawEnemy(enemy, camera, w, h);
    }
    for (const proj of viewModel.projectiles) {
      this._drawProjectile(proj, camera, w, h);
    }

    particles.forEachParticle((p) => this._drawParticle(p, camera, w, h));
    particles.forEachDamageNumber((d) => this._drawDamageNumber(d, camera, w, h));

    if (performance.now() < this._leakFlashUntil) {
      ctx.fillStyle = 'rgba(179, 38, 30, 0.25)';
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  _handleEvent(event, particles) {
    if (this.reducedMotion) return;
    // Converted through the shared helper, not a hardcoded 1024. A second copy of
    // that constant is a second place to be wrong when the precision changes.
    const { x, y } = { x: fromFixed(event.x), y: fromFixed(event.y) };
    if (event.type === 'damageDealt') {
      particles.emitDamageNumber(x, y, event.amount, 'damage');
      particles.emitBurst(x, y, '#f2b8b5', 4);
    } else if (event.type === 'kill') {
      particles.emitBurst(x, y, '#ffd166', 10);
    } else if (event.type === 'leak') {
      this._leakFlashUntil = performance.now() + 260;
    }
  }

  _drawZones(camera, w, h) {
    if (!this.placingTowerDefId) return;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(103, 80, 164, 0.18)';
    ctx.strokeStyle = 'rgba(103, 80, 164, 0.6)';
    ctx.lineWidth = 2;
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
  }

  _drawLane(camera, w, h) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#3a3f4b';
    ctx.lineWidth = WORLD.laneWidth * camera.zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const lane of this.mapDef.lanes) {
      ctx.beginPath();
      lane.waypoints.forEach((wp, i) => {
        const p = worldToScreen(camera, w, h, wp.x, wp.y);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }
  }

  _drawTower(tower, camera, w, h) {
    const def = this.gameData.towers.get(tower.defId);
    if (!def) return;
    const levelDef = def.levels[tower.level];
    const p = worldToScreen(camera, w, h, tower.x, tower.y);
    const size = WORLD.tower * camera.zoom;
    const sprite = getCachedSprite(towerSpriteSignature(def, tower.level), SPRITE_PX, (ctx) => drawTowerSprite(ctx, SPRITE_PX, def, levelDef));

    if (tower.id === this.selectedTowerId) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(208, 188, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.arc(p.x, p.y, levelDef.range * camera.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }

    this.ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);
  }

  _drawEnemy(enemy, camera, w, h) {
    const def = this.gameData.enemies.get(enemy.defId);
    if (!def) return;
    const p = worldToScreen(camera, w, h, enemy.x, enemy.y);
    const size = WORLD.enemy * camera.zoom;
    const sprite = getCachedSprite(enemySpriteSignature(def), SPRITE_PX, (ctx) => drawEnemySprite(ctx, SPRITE_PX, def));
    this.ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);

    this._drawHealthBar(p.x, p.y - size / 2 - WORLD.healthBarGap * camera.zoom, WORLD.healthBarWidth * camera.zoom, enemy.hpCurrent / Math.max(1, enemy.hpMax), camera.zoom);

    let iconX = p.x - size / 2;
    for (const status of enemy.statuses) {
      this._drawStatusIcon(iconX, p.y + size / 2 + 0.3 * camera.zoom, status, camera.zoom);
      iconX += 0.8 * camera.zoom;
    }
  }

  _drawHealthBar(cx, y, width, ratio, zoom) {
    const ctx = this.ctx;
    // Sized in map units like everything else. A pixel floor here quietly undoes
    // the world sizing at low zoom and puts a bar wider than its own enemy.
    const barWidth = width;
    const barHeight = Math.max(2, WORLD.healthBarHeight * zoom);
    const x = cx - barWidth / 2;
    ctx.fillStyle = '#2b2d33';
    ctx.fillRect(x, y, barWidth, barHeight);
    const clamped = Math.min(1, Math.max(0, ratio));
    ctx.fillStyle = clamped > 0.5 ? '#4caf50' : clamped > 0.2 ? '#ffb300' : '#e53935';
    ctx.fillRect(x, y, barWidth * clamped, barHeight);
  }

  _drawStatusIcon(x, y, status, zoom) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, 0.3 * zoom), 0, Math.PI * 2);
    ctx.fillStyle = '#79747e';
    ctx.fill();
  }

  _drawProjectile(proj, camera, w, h) {
    const p = worldToScreen(camera, w, h, proj.x, proj.y);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(p.x, p.y, WORLD.projectile * camera.zoom, 0, Math.PI * 2);
    ctx.fillStyle = '#f7d548';
    ctx.fill();
  }

  _drawParticle(p, camera, w, h) {
    const screen = worldToScreen(camera, w, h, p.x, p.y);
    const alpha = Math.max(0, 1 - p.age / p.life);
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, WORLD.particle * camera.zoom, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawDamageNumber(d, camera, w, h) {
    const screen = worldToScreen(camera, w, h, d.x, d.y);
    const alpha = Math.max(0, 1 - d.age / d.life);
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 13px "Roboto", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`-${Math.round(d.amount)}`, screen.x, screen.y);
    ctx.globalAlpha = 1;
  }
}
