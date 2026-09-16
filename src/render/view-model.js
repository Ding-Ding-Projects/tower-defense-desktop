/**
 * Turns two raw simulation snapshots (see sim-interface.js) plus an interpolation
 * alpha into the render-ready view model the canvas renderer and the HUD both
 * read. This is the one place fixed-point positions become floats — via
 * fromFixed, never a hand-rolled division — and the one place two ticks worth of
 * entities become one smoothly-moving frame.
 *
 * Every function here is pure: same inputs, same output, no DOM, no canvas, no
 * Date.now(). That is what makes it unit-testable without a browser.
 */

import { fromFixed } from '../sim/core/fixed.js';
import { lerp } from './interpolation.js';

/**
 * @typedef {object} ViewTower
 * @property {string} id
 * @property {string} defId
 * @property {number} x  map units
 * @property {number} y  map units
 * @property {number} level
 * @property {import('../data/schema/types.js').TargetingMode} targetingMode
 * @property {number} abilityCooldownRemainingSeconds
 */

/**
 * @typedef {object} ViewStatus
 * @property {string} id
 * @property {number} stacks
 * @property {number} remainingSeconds
 */

/**
 * @typedef {object} ViewEnemy
 * @property {string} id
 * @property {string} defId
 * @property {number} x
 * @property {number} y
 * @property {number} hpCurrent
 * @property {number} hpMax
 * @property {number} shieldCurrent
 * @property {ViewStatus[]} statuses
 */

/**
 * @typedef {object} ViewProjectile
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {string} fromTowerDefId
 * @property {string|null} targetEnemyId
 */

/**
 * @typedef {object} ViewModel
 * @property {number} tick
 * @property {number} cash
 * @property {number} lives
 * @property {number} waveIndex
 * @property {'intermission'|'active'|'victory'|'defeat'} phase
 * @property {number} intermissionSecondsRemaining
 * @property {ViewTower[]} towers
 * @property {ViewEnemy[]} enemies
 * @property {ViewProjectile[]} projectiles
 * @property {import('./sim-interface.js').SnapshotEvent[]} events
 */

/**
 * @returns {ViewModel}
 */
export function emptyViewModel() {
  return {
    tick: 0,
    cash: 0,
    lives: 0,
    waveIndex: 0,
    phase: 'intermission',
    intermissionSecondsRemaining: 0,
    towers: [],
    enemies: [],
    projectiles: [],
    events: [],
  };
}

/**
 * @param {import('./sim-interface.js').Snapshot|null} prevSnapshot
 * @param {import('./sim-interface.js').Snapshot|null} nextSnapshot
 * @param {number} alpha  0..1, see interpolation.js#computeAlpha
 * @returns {ViewModel}
 */
export function buildViewModel(prevSnapshot, nextSnapshot, alpha) {
  if (!nextSnapshot) return emptyViewModel();
  if (!prevSnapshot || prevSnapshot === nextSnapshot) {
    return snapshotToViewModel(nextSnapshot, nextSnapshot, 1);
  }
  return snapshotToViewModel(prevSnapshot, nextSnapshot, clamp01(alpha));
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function snapshotToViewModel(prev, next, alpha) {
  return {
    tick: next.tick,
    cash: next.cash,
    lives: next.lives,
    waveIndex: next.waveIndex,
    phase: next.phase,
    intermissionSecondsRemaining: next.intermissionSecondsRemaining,
    towers: interpolateList(prev.towers, next.towers, alpha, interpolateTower),
    enemies: interpolateList(prev.enemies, next.enemies, alpha, interpolateEnemy),
    projectiles: interpolateList(prev.projectiles, next.projectiles, alpha, interpolateProjectile),
    events: next.events ?? [],
  };
}

function interpolateList(prevList, nextList, alpha, mapFn) {
  const prevById = new Map((prevList ?? []).map((entity) => [entity.id, entity]));
  return (nextList ?? []).map((next) => mapFn(prevById.get(next.id), next, alpha));
}

function interpolatePosition(prev, next, alpha) {
  const nx = fromFixed(next.x);
  const ny = fromFixed(next.y);
  if (!prev) return { x: nx, y: ny };
  const px = fromFixed(prev.x);
  const py = fromFixed(prev.y);
  return { x: lerp(px, nx, alpha), y: lerp(py, ny, alpha) };
}

function interpolateTower(prev, next) {
  // Towers do not move once placed; no lerp needed for position, but the shape
  // stays parallel to enemy/projectile so the renderer treats all three uniformly.
  const { x, y } = interpolatePosition(prev, next, 1);
  return {
    id: next.id,
    defId: next.defId,
    x,
    y,
    level: next.level,
    targetingMode: next.targetingMode,
    abilityCooldownRemainingSeconds: next.abilityCooldownRemainingSeconds ?? 0,
  };
}

function interpolateEnemy(prev, next, alpha) {
  const { x, y } = interpolatePosition(prev, next, alpha);
  const hpCurrent = prev ? lerp(prev.hpCurrent, next.hpCurrent, alpha) : next.hpCurrent;
  return {
    id: next.id,
    defId: next.defId,
    x,
    y,
    hpCurrent,
    hpMax: next.hpMax,
    shieldCurrent: next.shieldCurrent,
    statuses: next.statuses ?? [],
  };
}

function interpolateProjectile(prev, next, alpha) {
  const { x, y } = interpolatePosition(prev, next, alpha);
  return {
    id: next.id,
    x,
    y,
    fromTowerDefId: next.fromTowerDefId,
    targetEnemyId: next.targetEnemyId ?? null,
  };
}
