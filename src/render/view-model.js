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
 * @property {number} id
 * @property {string} defId
 * @property {number} x  map units
 * @property {number} y  map units
 * @property {number} level
 * @property {import('../data/schema/types.js').TargetingMode} targetingMode
 * @property {number} abilityCooldownRemainingSeconds
 */

/**
 * A status as the interface sees it.
 *
 * `remainingSeconds` used to be declared here and in the snapshot contract, and the
 * simulation emitted neither: it sends the id and the stack count. Nothing read the
 * missing field, so it sat in two type declarations describing a value that never
 * existed.
 *
 * @typedef {object} ViewStatus
 * @property {string} id
 * @property {number} stacks
 */

/**
 * @typedef {object} ViewEnemy
 * @property {number} id
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
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number|null} targetEnemyId
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

/**
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/**
 * @param {import('./sim-interface.js').Snapshot} prev
 * @param {import('./sim-interface.js').Snapshot} next
 * @param {number} alpha
 * @returns {ViewModel}
 */
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

/**
 * Pair each entity in the newer snapshot with its own earlier self, by id, and hand
 * both to the mapper. An entity that has only just appeared has no earlier self and
 * the mapper gets undefined, which is why every mapper below takes a nullable `prev`.
 *
 * @template {{ id: number }} TIn
 * @template TOut
 * @param {TIn[]|undefined} prevList
 * @param {TIn[]|undefined} nextList
 * @param {number} alpha
 * @param {(prev: TIn|undefined, next: TIn, alpha: number) => TOut} mapFn
 * @returns {TOut[]}
 */
function interpolateList(prevList, nextList, alpha, mapFn) {
  const prevById = new Map((prevList ?? []).map((entity) => [entity.id, entity]));
  return (nextList ?? []).map((next) => mapFn(prevById.get(next.id), next, alpha));
}

/**
 * The ONE place a fixed-point position becomes a float.
 *
 * `x` and `y` arrive branded as Fixed from the snapshot, and fromFixed is the only
 * thing that unwraps the brand. That is deliberate: converting a second time used to
 * draw every entity a thousandth of the way from the map origin, silently, and the
 * brand makes a second conversion a compile error rather than an empty screen.
 *
 * @param {{ x: import('../sim/core/fixed.js').Fixed, y: import('../sim/core/fixed.js').Fixed }|undefined} prev
 * @param {{ x: import('../sim/core/fixed.js').Fixed, y: import('../sim/core/fixed.js').Fixed }} next
 * @param {number} alpha
 * @returns {{ x: number, y: number }}
 */
function interpolatePosition(prev, next, alpha) {
  const nx = fromFixed(next.x);
  const ny = fromFixed(next.y);
  if (!prev) return { x: nx, y: ny };
  const px = fromFixed(prev.x);
  const py = fromFixed(prev.y);
  return { x: lerp(px, nx, alpha), y: lerp(py, ny, alpha) };
}

/**
 * @param {import('./sim-interface.js').SnapshotTower|undefined} prev
 * @param {import('./sim-interface.js').SnapshotTower} next
 * @returns {ViewTower}
 */
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

/**
 * @param {import('./sim-interface.js').SnapshotEnemy|undefined} prev
 * @param {import('./sim-interface.js').SnapshotEnemy} next
 * @param {number} alpha
 * @returns {ViewEnemy}
 */
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

/**
 * @param {import('./sim-interface.js').SnapshotProjectile|undefined} prev
 * @param {import('./sim-interface.js').SnapshotProjectile} next
 * @param {number} alpha
 * @returns {ViewProjectile}
 */
function interpolateProjectile(prev, next, alpha) {
  const { x, y } = interpolatePosition(prev, next, alpha);
  return {
    id: next.id,
    x,
    y,
    targetEnemyId: next.targetEnemyId ?? null,
  };
}
