/**
 * Damage application.
 *
 * One fixed order, every time: shield pool first, then flat reduction, then hit
 * points. Any other order silently changes how much a flat-reduction enemy actually
 * takes, and the difference is invisible until a wave that should have held does not.
 *
 * Overkill is discarded rather than carried to the next target. Pierce hits each
 * enemy for the same amount unless the tower level says otherwise.
 */

import { hasTag } from './statuses.js';

/**
 * @typedef {object} DamageResult
 * @property {number} dealt      damage actually removed from shield plus hit points
 * @property {boolean} killed
 * @property {number} reward     cash awarded, zero unless killed
 */

/**
 * @param {import('../state/match-state.js').Enemy} enemy
 * @param {import('../../data/schema/types.js').EnemyDef} def
 * @param {number} amount
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @param {{ tag: string, damageMultiplier: number } | null} [bonusVsTag]
 * @returns {DamageResult}
 */
export function applyDamage(enemy, def, amount, gameData, bonusVsTag = null) {
  if (enemy.hp <= 0) return { dealt: 0, killed: false, reward: 0 };

  let incoming = amount;
  if (bonusVsTag && hasTag(enemy, gameData.statuses, bonusVsTag.tag)) {
    incoming = Math.trunc(incoming * bonusVsTag.damageMultiplier);
  }

  // Flat reduction applies per hit, not per tick, so a fast weak tower is punished by
  // it far more than a slow heavy one. That asymmetry is the point of the stat.
  incoming = Math.max(0, incoming - def.defense);

  let dealt = 0;
  if (enemy.shield > 0) {
    const absorbed = Math.min(enemy.shield, incoming);
    enemy.shield -= absorbed;
    incoming -= absorbed;
    dealt += absorbed;
  }
  if (incoming > 0) {
    const removed = Math.min(enemy.hp, incoming);
    enemy.hp -= removed;
    dealt += removed;
  }

  const killed = enemy.hp <= 0;
  return { dealt, killed, reward: killed ? def.killReward : 0 };
}

/**
 * Damage that bypasses mitigation entirely, which is what a status effect does.
 * A burn that could be shrugged off by flat reduction would be worthless against
 * exactly the enemies it exists to handle.
 * @param {import('../state/match-state.js').Enemy} enemy
 * @param {import('../../data/schema/types.js').EnemyDef} def
 * @param {number} amount
 * @returns {DamageResult}
 */
export function applyTrueDamage(enemy, def, amount) {
  if (enemy.hp <= 0 || amount <= 0) return { dealt: 0, killed: false, reward: 0 };
  const removed = Math.min(enemy.hp, amount);
  enemy.hp -= removed;
  const killed = enemy.hp <= 0;
  return { dealt: removed, killed, reward: killed ? def.killReward : 0 };
}

/**
 * Sort a batch of pending hits into one deterministic order.
 *
 * Simultaneous hits have to resolve in a fixed order, otherwise two enemies on
 * exactly one hit point each die in whichever order the arrays happened to hold, and
 * the cash totals diverge from there.
 * @param {Array<{ sourceSeq: number, targetSeq: number }>} hits
 * @returns {Array<{ sourceSeq: number, targetSeq: number }>}
 */
export function orderHits(hits) {
  return [...hits].sort((a, b) => a.sourceSeq - b.sourceSeq || a.targetSeq - b.targetSeq);
}
