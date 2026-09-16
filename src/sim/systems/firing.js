/**
 * Towers shooting, and projectiles travelling.
 *
 * Two delivery models sit side by side here. A hitscan tower resolves its damage the
 * instant it fires. A projectile tower spawns something that travels, which means a
 * fast enemy can outrun a slow shot and a shot can arrive after its target is already
 * dead. Both of those are real behaviours rather than bugs, so a projectile whose
 * target has gone simply expires unless it has an area radius, in which case it still
 * lands where the target was.
 */

import { toFixed, distanceSquared, isqrt } from '../core/fixed.js';
import { TICK_SECONDS, secondsToTicks } from '../core/constants.js';
import { effectiveStats } from './buffs.js';
import { candidates, selectTarget, canTarget } from './targeting.js';
import { applyDamage } from './damage.js';
import { applyStatus } from './statuses.js';
import { takeSeq, findEnemy } from '../state/match-state.js';

/**
 * One tick of every tower deciding whether to shoot.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 */
export function fireTowers(state, gameData) {
  // Ordered by sequence so two towers firing on the same tick always resolve in the
  // same order, which decides who gets the kill and therefore the reward.
  const towers = [...state.towers].sort((a, b) => a.seq - b.seq);

  for (const tower of towers) {
    const def = gameData.towers.get(tower.defId);
    if (!def) continue;
    const level = def.levels[tower.level];
    if (!level) continue;

    if (tower.reloadTicks > 0) {
      tower.reloadTicks -= 1;
      continue;
    }
    if (tower.cooldownTicks > 0) {
      tower.cooldownTicks -= 1;
    }

    const stats = effectiveStats(state, gameData, tower);
    const inRange = candidates(state, gameData, tower, level, stats.range);

    if (inRange.length === 0) {
      // Losing contact resets the spin-up. A tower that could bank its wind-up
      // between waves would fire its first shot of a wave at full rate, which is not
      // what a spin-up means.
      tower.spinUpTicks = 0;
      continue;
    }

    const spinUpRequired = level.spinUpSeconds ? secondsToTicks(level.spinUpSeconds) : 0;
    if (tower.spinUpTicks < spinUpRequired) {
      tower.spinUpTicks += 1;
      continue;
    }

    if (tower.cooldownTicks > 0) continue;

    const target = selectTarget(inRange, /** @type {any} */ (tower.targeting), gameData, tower);
    if (!target) continue;

    shoot(state, gameData, tower, level, stats, target);

    // Burst handling: count down the burst, and when it empties, take the reload.
    if (level.burstCount && level.burstCount > 1) {
      if (tower.burstLeft <= 0) tower.burstLeft = level.burstCount;
      tower.burstLeft -= 1;
      if (tower.burstLeft <= 0) {
        tower.reloadTicks = secondsToTicks(level.reloadSeconds ?? 1);
        tower.cooldownTicks = 0;
      } else {
        tower.cooldownTicks = Math.max(1, Math.round(1 / (stats.fireRate * TICK_SECONDS)));
      }
    } else {
      tower.cooldownTicks = Math.max(1, Math.round(1 / (stats.fireRate * TICK_SECONDS)));
    }
  }
}

/**
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @param {import('../state/match-state.js').Tower} tower
 * @param {import('../../data/schema/types.js').TowerLevel} level
 * @param {import('./buffs.js').EffectiveStats} stats
 * @param {import('../state/match-state.js').Enemy} target
 */
function shoot(state, gameData, tower, level, stats, target) {
  if (!level.projectileSpeed) {
    resolveHit(state, gameData, tower.seq, target, stats.damage, level);
    return;
  }
  state.projectiles.push({
    seq: takeSeq(state),
    sourceSeq: tower.seq,
    xFixed: tower.xFixed,
    yFixed: tower.yFixed,
    targetSeq: target.seq,
    speedFixed: toFixed(level.projectileSpeed * TICK_SECONDS),
    damage: stats.damage,
    aoeRadiusFixed: level.aoeRadius ? toFixed(level.aoeRadius) : 0,
    pierceLeft: level.pierceCount ?? 1,
    appliesStatuses: level.appliesStatuses ?? [],
    statusTicks: level.statusDurationSeconds ? secondsToTicks(level.statusDurationSeconds) : 0,
    bonusVsTag: level.bonusVsTag ?? null,
  });
}

/**
 * Land one hit: the direct target, then area, then chain, then statuses.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @param {number} sourceSeq
 * @param {import('../state/match-state.js').Enemy} target
 * @param {number} damage
 * @param {import('../../data/schema/types.js').TowerLevel} level
 */
export function resolveHit(state, gameData, sourceSeq, target, damage, level) {
  /** @type {import('../state/match-state.js').Enemy[]} */
  const struck = [target];

  if (level.aoeRadius) {
    const rFixed = toFixed(level.aoeRadius);
    const rSq = rFixed * rFixed;
    for (const other of state.enemies) {
      if (other.seq === target.seq || other.hp <= 0) continue;
      const otherDef = gameData.enemies.get(other.defId);
      if (!otherDef) continue;
      if (!canTarget(other, otherDef, level, gameData.statuses)) continue;
      if (distanceSquared(target.xFixed, target.yFixed, other.xFixed, other.yFixed) <= rSq) {
        struck.push(other);
      }
    }
  }

  if (level.chainCount && level.chainRadius) {
    const rFixed = toFixed(level.chainRadius);
    const rSq = rFixed * rFixed;
    let remaining = level.chainCount;
    let from = target;
    const already = new Set(struck.map((e) => e.seq));
    while (remaining > 0) {
      const next = state.enemies
        .filter((e) => !already.has(e.seq) && e.hp > 0)
        .filter((e) => {
          const d = gameData.enemies.get(e.defId);
          return d ? canTarget(e, d, level, gameData.statuses) : false;
        })
        .filter(
          (e) => distanceSquared(from.xFixed, from.yFixed, e.xFixed, e.yFixed) <= rSq,
        )
        .sort(
          (a, b) =>
            distanceSquared(from.xFixed, from.yFixed, a.xFixed, a.yFixed) -
              distanceSquared(from.xFixed, from.yFixed, b.xFixed, b.yFixed) || a.seq - b.seq,
        )[0];
      if (!next) break;
      struck.push(next);
      already.add(next.seq);
      from = next;
      remaining -= 1;
    }
  }

  // Sorted so a multi-target hit always resolves in the same order.
  struck.sort((a, b) => a.seq - b.seq);

  for (const enemy of struck) {
    const def = gameData.enemies.get(enemy.defId);
    if (!def) continue;
    const result = applyDamage(enemy, def, damage, gameData, level.bonusVsTag ?? null);
    if (result.killed) {
      state.cash += result.reward;
      state.killCount += 1;
    }
    for (const statusId of level.appliesStatuses ?? []) {
      const status = gameData.statuses.get(statusId);
      if (!status) continue;
      const ticks = level.statusDurationSeconds ? secondsToTicks(level.statusDurationSeconds) : 1;
      applyStatus(enemy, def, status, ticks);
    }
  }

  state.enemies = state.enemies.filter((e) => e.hp > 0);
}

/**
 * Move every projectile, and land the ones that arrive.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 */
export function advanceProjectiles(state, gameData) {
  /** @type {import('../state/match-state.js').Projectile[]} */
  const surviving = [];

  for (const shot of [...state.projectiles].sort((a, b) => a.seq - b.seq)) {
    const target = findEnemy(state, shot.targetSeq);
    if (!target || target.hp <= 0) {
      // The target died in flight. A plain shot is wasted; an area shot still lands.
      if (shot.aoeRadiusFixed > 0) landAreaOnly(state, gameData, shot);
      continue;
    }

    const dx = target.xFixed - shot.xFixed;
    const dy = target.yFixed - shot.yFixed;
    const dist = isqrt(dx * dx + dy * dy);

    if (dist <= shot.speedFixed) {
      shot.xFixed = target.xFixed;
      shot.yFixed = target.yFixed;
      landProjectile(state, gameData, shot, target);
      continue;
    }

    shot.xFixed += Math.trunc((dx * shot.speedFixed) / dist);
    shot.yFixed += Math.trunc((dy * shot.speedFixed) / dist);
    surviving.push(shot);
  }

  state.projectiles = surviving;
}

/**
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @param {import('../state/match-state.js').Projectile} shot
 * @param {import('../state/match-state.js').Enemy} target
 */
function landProjectile(state, gameData, shot, target) {
  /** @type {import('../../data/schema/types.js').TowerLevel} */
  const pseudoLevel = /** @type {any} */ ({
    aoeRadius: shot.aoeRadiusFixed > 0 ? shot.aoeRadiusFixed / 1024 : undefined,
    appliesStatuses: shot.appliesStatuses,
    statusDurationSeconds: shot.statusTicks > 0 ? shot.statusTicks / 30 : undefined,
    bonusVsTag: shot.bonusVsTag ?? undefined,
    detectsHidden: true,
    hitsAir: true,
  });
  resolveHit(state, gameData, shot.sourceSeq, target, shot.damage, pseudoLevel);
}

/**
 * An area shot whose target died in flight still detonates where it was aimed.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @param {import('../state/match-state.js').Projectile} shot
 */
function landAreaOnly(state, gameData, shot) {
  const rSq = shot.aoeRadiusFixed * shot.aoeRadiusFixed;
  const caught = state.enemies
    .filter(
      (e) => e.hp > 0 && distanceSquared(shot.xFixed, shot.yFixed, e.xFixed, e.yFixed) <= rSq,
    )
    .sort((a, b) => a.seq - b.seq);
  for (const enemy of caught) {
    const def = gameData.enemies.get(enemy.defId);
    if (!def) continue;
    const result = applyDamage(enemy, def, shot.damage, gameData, shot.bonusVsTag);
    if (result.killed) {
      state.cash += result.reward;
      state.killCount += 1;
    }
  }
  state.enemies = state.enemies.filter((e) => e.hp > 0);
}
