/**
 * Money.
 *
 * Kill rewards are paid where the kill happens, in the damage path, because that is
 * the only place that knows which blow landed last. Everything else is here.
 */

import { effectiveStats } from './buffs.js';

/**
 * Pay every economy tower for a completed wave.
 *
 * Income runs through the same aura pipeline as damage does, so a support tower that
 * boosts income is one data row rather than a special case in this file.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @returns {number} total paid
 */
export function payWaveIncome(state, gameData) {
  const difficulty = gameData.difficulties.get(state.difficultyId);
  const multiplier = difficulty ? difficulty.cashMultiplier : 1;

  let total = 0;
  // Sorted, because two economy towers buffing each other must be evaluated in a
  // fixed order or the totals differ between runs.
  for (const tower of [...state.towers].sort((a, b) => a.seq - b.seq)) {
    const stats = effectiveStats(state, gameData, tower);
    if (stats.income <= 0) continue;
    total += Math.trunc(stats.income * multiplier);
  }
  state.cash += total;
  return total;
}
