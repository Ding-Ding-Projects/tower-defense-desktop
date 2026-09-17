/**
 * Status effects: applying, stacking, ticking and expiry.
 *
 * Three stacking rules, and the difference between them is the whole reason this is
 * data rather than code. "refresh" resets the clock on a single instance, "stack"
 * adds an independent stack up to a cap, and "highest" keeps whichever application
 * is strongest and discards the weaker one.
 */

/**
 * @param {import('../state/match-state.js').Enemy} enemy
 * @param {import('../../data/schema/types.js').EnemyDef} def
 * @param {import('../../data/schema/types.js').StatusDef} status
 * @param {number} ticks
 * @param {number} [damagePerTick]  the applier's own burn figure, if it carries one
 * @returns {boolean} whether it was applied
 */
export function applyStatus(enemy, def, status, ticks, damagePerTick) {
  if (def.immunities.includes(status.id)) return false;
  const existing = enemy.statuses.find((s) => s.id === status.id);
  if (!existing) {
    enemy.statuses.push({ id: status.id, ticksLeft: ticks, stacks: 1, damagePerTick });
    return true;
  }
  // A refreshed status takes the new applier's figure. Two towers applying the same
  // status for different amounts is the normal case, not an edge one: Freezer's chill
  // burns for 3 at one level and 5 at the next, and the status itself has no opinion.
  if (damagePerTick !== undefined) existing.damagePerTick = damagePerTick;
  switch (status.stackingRule) {
    case 'refresh':
      existing.ticksLeft = Math.max(existing.ticksLeft, ticks);
      return true;
    case 'stack': {
      const cap = status.maxStacks ?? 1;
      if (existing.stacks < cap) existing.stacks += 1;
      existing.ticksLeft = Math.max(existing.ticksLeft, ticks);
      return true;
    }
    case 'highest':
      // The longer application wins outright; the shorter one is discarded rather
      // than quietly extending the stronger one.
      if (ticks > existing.ticksLeft) existing.ticksLeft = ticks;
      return true;
    default:
      throw new Error('unknown stacking rule: ' + status.stackingRule);
  }
}

/**
 * Combined speed multiplier from every active slowing status.
 *
 * Multiplicative, so two independent slows compound rather than the stronger one
 * silently cancelling the weaker.
 * @param {import('../state/match-state.js').Enemy} enemy
 * @param {Map<string, import('../../data/schema/types.js').StatusDef>} statuses
 * @returns {number}
 */
export function speedMultiplier(enemy, statuses) {
  let multiplier = 1;
  for (const active of enemy.statuses) {
    const def = statuses.get(active.id);
    if (!def || def.speedMultiplier === undefined) continue;
    multiplier *= def.speedMultiplier;
  }
  return multiplier;
}

/**
 * @param {import('../state/match-state.js').Enemy} enemy
 * @param {Map<string, import('../../data/schema/types.js').StatusDef>} statuses
 * @returns {boolean}
 */
export function isStunned(enemy, statuses) {
  for (const active of enemy.statuses) {
    const def = statuses.get(active.id);
    if (def && def.preventsAction === true) return true;
  }
  return false;
}

/**
 * Whether something has stripped this enemy of its concealment.
 * @param {import('../state/match-state.js').Enemy} enemy
 * @param {Map<string, import('../../data/schema/types.js').StatusDef>} statuses
 * @returns {boolean}
 */
export function isRevealed(enemy, statuses) {
  for (const active of enemy.statuses) {
    const def = statuses.get(active.id);
    if (def && def.revealsHidden === true) return true;
  }
  return false;
}

/**
 * Whether the enemy carries a status bearing a given synergy tag. This is the whole
 * mark-and-consume mechanism: one tower applies a tagged status, another declares a
 * bonus against that tag, and neither of them knows the other exists.
 * @param {import('../state/match-state.js').Enemy} enemy
 * @param {Map<string, import('../../data/schema/types.js').StatusDef>} statuses
 * @param {string} tag
 * @returns {boolean}
 */
export function hasTag(enemy, statuses, tag) {
  for (const active of enemy.statuses) {
    const def = statuses.get(active.id);
    if (def && def.tag === tag) return true;
  }
  return false;
}

/**
 * Damage from every active status this tick, before mitigation.
 * @param {import('../state/match-state.js').Enemy} enemy
 * @param {Map<string, import('../../data/schema/types.js').StatusDef>} statuses
 * @returns {number}
 */
export function damageOverTime(enemy, statuses) {
  let total = 0;
  for (const active of enemy.statuses) {
    const def = statuses.get(active.id);
    if (!def) continue;
    // The applier's own figure wins when it has one, and the status definition is the
    // fallback. Without this a tower's burn is whatever the status says, identically at
    // every level, which is not what any of the sourced numbers describe.
    const perTick = active.damagePerTick ?? def.damagePerTick;
    if (perTick) total += perTick * active.stacks;
    if (def.percentMaxHpPerTick) {
      total += Math.trunc(enemy.maxHp * def.percentMaxHpPerTick) * active.stacks;
    }
  }
  return total;
}

/**
 * Count every status down and drop the expired ones.
 *
 * Runs once per tick, after the damage they deal has been applied, so a status always
 * deals damage on its final tick rather than being cut one tick short.
 * @param {import('../state/match-state.js').Enemy} enemy
 */
export function expireStatuses(enemy) {
  for (const active of enemy.statuses) active.ticksLeft -= 1;
  enemy.statuses = enemy.statuses.filter((a) => a.ticksLeft > 0);
}
