/**
 * Target selection.
 *
 * The one rule that matters more than any other in this file: every comparison ends
 * in a tie-break on spawn sequence. A comparator that can return 0 for two different
 * enemies hands the answer to whatever order the array happened to be in, and two
 * replays of the same command log will eventually disagree about which enemy died.
 * That is the single easiest way to destroy determinism, so it is guarded by name in
 * the tests rather than left to discipline.
 *
 * The five modes below are the ones this project is confident the source game has.
 * The tie-break rule itself is an engine decision and is documented as such; it is
 * not a claim about the source game.
 */

import { distanceSquared, toFixed } from '../core/fixed.js';
import { isRevealed } from './statuses.js';

/** @typedef {import('../../data/schema/types.js').TargetingMode} TargetingMode */

/**
 * Whether one tower is allowed to shoot one enemy at all, ignoring range.
 * @param {import('../state/match-state.js').Enemy} enemy
 * @param {import('../../data/schema/types.js').EnemyDef} enemyDef
 * @param {import('../../data/schema/types.js').TowerLevel} level
 * @param {Map<string, import('../../data/schema/types.js').StatusDef>} statuses
 * @returns {boolean}
 */
export function canTarget(enemy, enemyDef, level, statuses) {
  if (enemyDef.flying && !level.hitsAir) return false;
  if (enemyDef.hidden && !level.detectsHidden && !isRevealed(enemy, statuses)) return false;
  return true;
}

/**
 * Every enemy a tower could legally shoot right now.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @param {import('../state/match-state.js').Tower} tower
 * @param {import('../../data/schema/types.js').TowerLevel} level
 * @param {number} rangeUnits
 * @returns {import('../state/match-state.js').Enemy[]}
 */
export function candidates(state, gameData, tower, level, rangeUnits) {
  const rangeFixed = toFixed(rangeUnits);
  const rangeSq = rangeFixed * rangeFixed;
  const out = [];
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const def = gameData.enemies.get(enemy.defId);
    if (!def) continue;
    if (!canTarget(enemy, def, level, gameData.statuses)) continue;
    if (distanceSquared(tower.xFixed, tower.yFixed, enemy.xFixed, enemy.yFixed) > rangeSq) continue;
    out.push(enemy);
  }
  return out;
}

/**
 * Pick one target from the legal candidates.
 * @param {import('../state/match-state.js').Enemy[]} list
 * @param {TargetingMode} mode
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @param {import('../state/match-state.js').Tower} tower
 * @returns {import('../state/match-state.js').Enemy | null}
 */
export function selectTarget(list, mode, gameData, tower) {
  if (list.length === 0) return null;

  /** @type {(a: import('../state/match-state.js').Enemy, b: import('../state/match-state.js').Enemy) => number} */
  let compare;
  switch (mode) {
    case 'first':
      // Furthest along the path, so closest to leaking.
      compare = (a, b) => b.distFixed - a.distFixed || a.seq - b.seq;
      break;
    case 'last':
      compare = (a, b) => a.distFixed - b.distFixed || a.seq - b.seq;
      break;
    case 'closest':
      compare = (a, b) =>
        distanceSquared(tower.xFixed, tower.yFixed, a.xFixed, a.yFixed) -
          distanceSquared(tower.xFixed, tower.yFixed, b.xFixed, b.yFixed) || a.seq - b.seq;
      break;
    case 'strongest':
      // Current hit points plus remaining shield: what is actually left to chew
      // through, not what the enemy started with.
      compare = (a, b) => b.hp + b.shield - (a.hp + a.shield) || a.seq - b.seq;
      break;
    case 'weakest':
      compare = (a, b) => a.hp + a.shield - (b.hp + b.shield) || a.seq - b.seq;
      break;
    default:
      throw new Error('unknown targeting mode: ' + mode);
  }

  // Copy before sorting. Sorting state.enemies in place would reorder the array the
  // rest of the tick iterates, which is exactly the kind of hidden coupling that
  // makes a determinism failure impossible to find later.
  return [...list].sort(compare)[0] ?? null;
}
