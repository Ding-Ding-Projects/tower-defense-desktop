/**
 * Auras, and the effective stats they produce.
 *
 * The important rule here: a tower's base stats are NEVER mutated. Effective stats
 * are recomputed every tick from the live set of auras. That makes stacking a pure
 * function of the current world, which means a replay re-derives it identically and
 * removing a support tower instantly takes its buff away with no bookkeeping.
 *
 * The three stacking modes exist because the wiki is not always explicit about which
 * one a given buff uses, so it is a field on the data row rather than an assumption
 * baked into this file.
 */

import { distanceSquared, toFixed } from '../core/fixed.js';

/**
 * @typedef {object} EffectiveStats
 * @property {number} damage
 * @property {number} fireRate
 * @property {number} range      map units, not fixed-point
 * @property {number} income
 */

/**
 * Collect every aura currently reaching a point, paired with its source tower.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @param {number} xFixed
 * @param {number} yFixed
 * @param {number} excludeSeq  a tower does not buff itself
 * @returns {import('../../data/schema/types.js').AuraDef[]}
 */
export function aurasReaching(state, gameData, xFixed, yFixed, excludeSeq) {
  const found = [];
  // Sorted by seq so the collection order is identical on every run, which matters
  // for "highest" resolution when two auras tie exactly.
  const sorted = [...state.towers].sort((a, b) => a.seq - b.seq);
  for (const source of sorted) {
    if (source.seq === excludeSeq) continue;
    const def = gameData.towers.get(source.defId);
    if (!def) continue;
    const level = def.levels[source.level];
    if (!level) continue;

    // A tower can be projecting two auras at once: the passive one its level carries,
    // and a stronger temporary one while its ability is running. Commander is exactly
    // that -- a standing firerate boost, and a larger one for the ten seconds Call to
    // Arms lasts. They are collected separately rather than one replacing the other,
    // so the stacking rules in `applyAuras` decide how they combine instead of this
    // function quietly picking a winner.
    const active = [];
    if (level.aura) active.push(level.aura);
    if (source.abilityActiveTicks > 0 && level.ability?.aura) active.push(level.ability.aura);
    if (active.length === 0) continue;

    for (const aura of active) {
      const radiusFixed = toFixed(aura.radius);
      if (distanceSquared(xFixed, yFixed, source.xFixed, source.yFixed) > radiusFixed * radiusFixed) {
        continue;
      }
      found.push(aura);
    }
  }
  return found;
}

/**
 * Apply every aura affecting one statistic to a base value.
 *
 * Additive auras sum, then multiplicative auras multiply the summed result, then a
 * "highest" aura wins outright if it would beat the lot. Documented here because the
 * order is an engine decision, not a fact copied from anywhere.
 * @param {number} base
 * @param {import('../../data/schema/types.js').AuraDef[]} auras
 * @param {import('../../data/schema/types.js').AuraDef['stat']} stat
 * @returns {number}
 */
export function applyAuras(base, auras, stat) {
  const relevant = auras.filter((a) => a.stat === stat);
  if (relevant.length === 0) return base;

  let additive = 0;
  let multiplicative = 1;
  let highest = 0;
  for (const aura of relevant) {
    if (aura.mode === 'additive') additive += aura.value;
    else if (aura.mode === 'multiplicative') multiplicative *= aura.value;
    else if (aura.mode === 'highest') highest = Math.max(highest, aura.value);
    else throw new Error('unknown aura mode: ' + aura.mode);
  }
  const combined = (base + additive) * multiplicative;
  const highestOnly = highest > 0 ? base * highest : 0;
  return Math.max(combined, highestOnly);
}

/**
 * The stats a tower actually fights with this tick.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @param {import('../state/match-state.js').Tower} tower
 * @returns {EffectiveStats}
 */
export function effectiveStats(state, gameData, tower) {
  const def = gameData.towers.get(tower.defId);
  if (!def) throw new Error('unknown tower def: ' + tower.defId);
  const level = def.levels[tower.level];
  if (!level) throw new Error('tower ' + tower.defId + ' has no level ' + tower.level);

  const auras = aurasReaching(state, gameData, tower.xFixed, tower.yFixed, tower.seq);
  return {
    damage: Math.trunc(applyAuras(level.damage, auras, 'damage')),
    fireRate: applyAuras(level.fireRate, auras, 'fireRate'),
    range: applyAuras(level.range, auras, 'range'),
    income: Math.trunc(applyAuras(level.incomePerWave ?? 0, auras, 'income')),
  };
}
