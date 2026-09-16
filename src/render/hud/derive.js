/**
 * Pure derivation of every piece of "can I do this, and if not, why not" text
 * the in-canvas interface layer shows: shop affordability, upgrade
 * availability and its stat diff, sell value, and the targeting-mode cycle.
 *
 * This is an intentional, self-contained copy of the same contract src/ui's
 * affordability.js and targeting.js implement, kept inside this owned
 * directory rather than imported from src/ui. Two lanes read the same rules
 * in parallel here; keeping this copy local means this directory never
 * breaks because an unrelated lane reshaped a file it does not own, and the
 * shop/tower-panel modules below can be developed and tested against this
 * file alone. Every function is pure: same inputs, same output, no canvas,
 * no DOM.
 */

/** @type {import('../../data/schema/types.js').TargetingMode[]} */
export const ALL_TARGETING_MODES = ['first', 'last', 'closest', 'strongest', 'weakest'];

const TARGETING_LABELS = {
  first: 'First',
  last: 'Last',
  closest: 'Closest',
  strongest: 'Strongest',
  weakest: 'Weakest',
};

/**
 * @param {import('../../data/schema/types.js').TargetingMode} currentMode
 * @param {import('../../data/schema/types.js').TargetingMode[]} [allowedModes]
 * @param {1|-1} [direction]
 * @returns {import('../../data/schema/types.js').TargetingMode}
 */
export function cycleTargetingMode(currentMode, allowedModes = ALL_TARGETING_MODES, direction = 1) {
  if (!allowedModes || allowedModes.length === 0) {
    throw new Error('cycleTargetingMode: allowedModes must be non-empty');
  }
  const currentIndex = allowedModes.indexOf(currentMode);
  const fromIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex = (fromIndex + direction + allowedModes.length) % allowedModes.length;
  return allowedModes[nextIndex];
}

/**
 * @param {import('../../data/schema/types.js').TargetingMode} mode
 * @returns {string}
 */
export function targetingModeLabel(mode) {
  return TARGETING_LABELS[mode] ?? mode;
}

/** Display labels for every stat field a level diff or stat readout can name. */
export const FIELD_LABELS = {
  damage: 'Damage',
  fireRate: 'Fire rate',
  range: 'Range',
  aoeRadius: 'Blast radius',
  pierceCount: 'Pierce',
  chainCount: 'Chain',
  burstCount: 'Burst shots',
};

/**
 * @param {import('../../data/schema/types.js').TowerDef} towerDef
 * @param {number} cash
 * @param {Map<string, number>} placementPoolCounts  currently placed towers, keyed by placementPool
 * @param {string[]} [disallowedTowerIds]  the active difficulty's disallowedTowers
 * @returns {{ affordable: boolean, disabledReason: string|null }}
 */
export function deriveShopEntryState(towerDef, cash, placementPoolCounts, disallowedTowerIds = []) {
  if (disallowedTowerIds.includes(towerDef.id)) {
    return { affordable: false, disabledReason: 'Not allowed on this difficulty' };
  }
  if (towerDef.maxCount != null) {
    const currentCount = placementPoolCounts.get(towerDef.placementPool) ?? 0;
    if (currentCount >= towerDef.maxCount) {
      return { affordable: false, disabledReason: `Pool limit reached (${towerDef.maxCount})` };
    }
  }
  if (cash < towerDef.baseCost) {
    return { affordable: false, disabledReason: `Need ${towerDef.baseCost - cash} more cash` };
  }
  return { affordable: true, disabledReason: null };
}

const DIFFABLE_FIELDS = ['damage', 'fireRate', 'range', 'aoeRadius', 'pierceCount', 'chainCount', 'burstCount'];

/**
 * @param {import('../../data/schema/types.js').TowerLevel} currentLevelDef
 * @param {import('../../data/schema/types.js').TowerLevel} nextLevelDef
 * @returns {{ field: string, before: number, after: number }[]}
 */
export function diffLevels(currentLevelDef, nextLevelDef) {
  const changes = [];
  for (const field of DIFFABLE_FIELDS) {
    const before = currentLevelDef?.[field];
    const after = nextLevelDef?.[field];
    if (after != null && after !== before) {
      changes.push({ field, before: before ?? 0, after });
    }
  }
  return changes;
}

/**
 * @param {import('../../data/schema/types.js').TowerDef} towerDef
 * @param {number} currentLevel
 * @param {number} cash
 * @returns {{ available: boolean, disabledReason: string|null, cost: number, changes: { field: string, before: number, after: number }[] }}
 */
export function deriveUpgradeState(towerDef, currentLevel, cash) {
  const nextLevelDef = towerDef.levels.find((l) => l.level === currentLevel + 1);
  if (!nextLevelDef) {
    return { available: false, disabledReason: 'Max level', cost: 0, changes: [] };
  }
  const currentLevelDef = towerDef.levels.find((l) => l.level === currentLevel);
  const changes = diffLevels(currentLevelDef, nextLevelDef);
  if (cash < nextLevelDef.cost) {
    return { available: false, disabledReason: `Need ${nextLevelDef.cost - cash} more cash`, cost: nextLevelDef.cost, changes };
  }
  return { available: true, disabledReason: null, cost: nextLevelDef.cost, changes };
}

/**
 * @param {import('../../data/schema/types.js').TowerDef} towerDef
 * @param {number} currentLevel
 * @returns {number}
 */
export function deriveSellValue(towerDef, currentLevel) {
  // Two things here were wrong at once and produced the same visible answer: a
  // freshly placed tower offering to sell for nothing.
  //
  // First, what was spent. Level 0 is the placed tower and its `cost` is zero,
  // because the price of putting it down lives in `baseCost`. Summing level costs
  // alone therefore came to zero for a tower nobody had upgraded yet.
  //
  // Second, the refund. `sellRefundFraction` is a FRACTION between 0 and 1, not a
  // number out of a hundred, so dividing by 100 again scaled the refund down by a
  // further hundredfold. Either mistake alone rounds a small refund to zero; together
  // they guaranteed it.
  const spentOnUpgrades = towerDef.levels
    .filter((l) => l.level > 0 && l.level <= currentLevel)
    .reduce((sum, l) => sum + l.cost, 0);
  const spent = towerDef.baseCost + spentOnUpgrades;

  // Math.trunc, and the same multiplication, as the simulation's own sell handler.
  //
  // This number is a PROMISE on a button. Whatever arithmetic it uses, the simulation
  // will use its own when the button is pressed, and a panel that computes a more
  // defensible answer than the simulation pays is simply a panel that lies. Note that
  // 180 times 0.7 floors to 125 rather than 126, because 0.7 has no exact binary
  // representation; being consistent with the payer matters more than being nicer.
  return Math.trunc(spent * towerDef.sellRefundFraction);
}

/**
 * @param {number} cooldownRemainingSeconds
 * @returns {boolean}
 */
export function isAbilityReady(cooldownRemainingSeconds) {
  return !(cooldownRemainingSeconds > 0);
}
