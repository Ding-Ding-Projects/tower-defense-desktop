/**
 * Enemy movement along lanes, and leaks.
 *
 * Distance travelled is the authoritative value; the x and y coordinates are derived
 * from it every tick. Storing position and advancing it directly would accumulate
 * error along a curve, and an enemy would slowly drift off its own path.
 */

import { toFixed } from '../core/fixed.js';
import { TICK_SECONDS } from '../core/constants.js';
import { laneMetrics, positionAlong, requireLane } from './geometry.js';
import { speedMultiplier, isStunned } from './statuses.js';

/**
 * Advance every living enemy, and report the ones that reached the end.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @returns {import('../state/match-state.js').Enemy[]} enemies that leaked this tick
 */
export function advanceEnemies(state, gameData) {
  const map = gameData.maps.get(state.mapId);
  if (!map) throw new Error('unknown map: ' + state.mapId);
  const difficulty = gameData.difficulties.get(state.difficultyId);
  if (!difficulty) throw new Error('unknown difficulty: ' + state.difficultyId);

  /** @type {import('../state/match-state.js').Enemy[]} */
  const leaked = [];

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const def = gameData.enemies.get(enemy.defId);
    if (!def) continue;

    const lane = requireLane(map, enemy.laneId);
    const metrics = laneMetrics(lane);

    if (!isStunned(enemy, gameData.statuses)) {
      const unitsPerSecond =
        def.speed * difficulty.enemySpeedMultiplier * speedMultiplier(enemy, gameData.statuses);
      enemy.distFixed += toFixed(unitsPerSecond * TICK_SECONDS);
    }

    if (enemy.distFixed >= metrics.total) {
      enemy.distFixed = metrics.total;
      leaked.push(enemy);
    }

    const pos = positionAlong(lane, metrics, enemy.distFixed, enemy.offsetFixed);
    enemy.xFixed = pos.xFixed;
    enemy.yFixed = pos.yFixed;
    enemy.segment = pos.segment;
  }

  return leaked;
}

/**
 * Remove the leaked enemies and take the base health off.
 *
 * A leak is counted whether or not the enemy would have died to a status effect this
 * same tick. Reaching the end is reaching the end.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @param {import('../state/match-state.js').Enemy[]} leaked
 */
export function resolveLeaks(state, gameData, leaked) {
  if (leaked.length === 0) return;
  const leakedSeqs = new Set(leaked.map((e) => e.seq));
  for (const enemy of leaked) {
    const def = gameData.enemies.get(enemy.defId);
    state.lives -= def ? def.leakDamage : 1;
    state.leakCount += 1;
  }
  state.enemies = state.enemies.filter((e) => !leakedSeqs.has(e.seq));
  if (state.lives <= 0) {
    state.lives = 0;
    state.phase = 'lost';
  }
}
