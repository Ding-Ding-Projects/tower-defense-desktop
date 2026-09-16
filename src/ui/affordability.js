/**
 * Pure derivation of shop and upgrade affordability. Every entry the shop panel
 * and the selected-tower panel render comes from these functions, never from a
 * component deciding "can I afford this" inline — that is what makes the
 * disabled-reason text testable without a DOM.
 */

/**
 * @param {import('../data/schema/types.js').TowerDef} towerDef
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

/**
 * The stat fields an upgrade can change.
 *
 * Typed as keys of TowerLevel rather than as plain strings, so a field renamed in
 * the schema turns this red instead of quietly diffing a property that no longer
 * exists and reporting that nothing changed.
 * Each name is also asserted to be a real key of TowerLevel, so a field renamed in
 * the schema turns this red rather than quietly diffing a property that no longer
 * exists and reporting that nothing changed.
 * @type {Array<Extract<keyof import('../data/schema/types.js').TowerLevel,
 *   'damage'|'fireRate'|'range'|'aoeRadius'|'pierceCount'|'chainCount'|'burstCount'>>}
 */
const DIFFABLE_FIELDS = ['damage', 'fireRate', 'range', 'aoeRadius', 'pierceCount', 'chainCount', 'burstCount'];

/**
 * @param {import('../data/schema/types.js').TowerLevel} currentLevelDef
 * @param {import('../data/schema/types.js').TowerLevel} nextLevelDef
 * @returns {{ field: string, before: number, after: number }[]}
 */
/**
 * @param {import('../data/schema/types.js').TowerLevel|null|undefined} currentLevelDef
 * @param {import('../data/schema/types.js').TowerLevel} nextLevelDef
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
 * @param {import('../data/schema/types.js').TowerDef} towerDef
 * @param {number} currentLevel
 * @param {number} cash
 * @returns {{ available: boolean, disabledReason: string|null, cost: number, changes: { field: string, before: number, after: number }[] }}
 */
export function deriveUpgradeState(towerDef, currentLevel, cash) {
  const nextLevelDef = towerDef.levels.find((l) => l.level === currentLevel + 1);
  if (!nextLevelDef) {
    return { available: false, disabledReason: 'Max level', cost: 0, changes: [] };
  }
  // May genuinely be absent; diffLevels treats a missing current level as "everything
  // is new" rather than throwing.
  const currentLevelDef = towerDef.levels.find((l) => l.level === currentLevel) ?? null;
  const changes = diffLevels(currentLevelDef, nextLevelDef);
  if (cash < nextLevelDef.cost) {
    return { available: false, disabledReason: `Need ${nextLevelDef.cost - cash} more cash`, cost: nextLevelDef.cost, changes };
  }
  return { available: true, disabledReason: null, cost: nextLevelDef.cost, changes };
}

/**
 * @param {import('../data/schema/types.js').TowerDef} towerDef
 * @param {number} currentLevel
 * @returns {number}
 */
export function deriveSellValue(towerDef, currentLevel) {
  const spent = towerDef.levels
    .filter((l) => l.level <= currentLevel)
    .reduce((sum, l) => sum + l.cost, 0);
  // spent and sellRefundFraction are both integers, so multiply before dividing:
  // Math.floor(spent * (percent / 100)) looks equivalent but is not — 70 / 100 is
  // 0.6999999999999999556 in a double, and 180 * that floors to 125 instead of
  // the true 126. Keeping the multiplication in integers first sidesteps the
  // representation error entirely rather than trying to round it away after.
  return Math.floor((spent * towerDef.sellRefundFraction) / 100);
}
