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
import { recordEvent } from '../state/events.js';
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

    // Some towers have no weapon of their own except while an ability is running.
    // Commander is the whole reason this exists: its levels 0 and 1 list no damage and
    // no firerate at all because it is purely a firerate aura, and from level 2 its
    // gun appears only for the ten seconds Call to Arms is up. Without the gate, a
    // tower like that shoots continuously at its ability's damage, which is a very
    // different tower from the one the source describes.
    if (level.firesOnlyDuringAbility && tower.abilityActiveTicks <= 0) continue;

    // The second weapon runs BEFORE the reload check and on its own clock, because it
    // is a separate weapon: a tower reloading its gun has not stopped carrying bombs.
    // Running it after the reload guard would have tied the two together and quietly
    // made the bomb fire less often than its own cooldown says.
    fireSecondary(state, gameData, tower, level);

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
        // The reload comes ON TOP of the last shot's own interval, not instead of it.
        //
        // This used to zero the cooldown, making the burst cycle one gap shorter than
        // the source's: Soldier fired three shots in 0.85 seconds where the source
        // takes 1.025, so it did 3.53 damage per second against a published 2.93, and
        // the same twenty percent overstatement rode on every burst tower in the game.
        // Nothing caught it until the pages' own damage-per-second column was scraped
        // and compared against, because 3.53 is a thoroughly plausible number.
        tower.reloadTicks = secondsToTicks(level.reloadSeconds ?? 1);
        tower.cooldownTicks = Math.max(1, Math.round(1 / (stats.fireRate * TICK_SECONDS)));
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
  const damage = damageForThisHit(tower, level, stats.damage);
  if (!level.projectileSpeed) {
    resolveHit(state, gameData, tower.seq, target, damage, level);
    return;
  }
  state.projectiles.push({
    seq: takeSeq(state),
    sourceSeq: tower.seq,
    xFixed: tower.xFixed,
    yFixed: tower.yFixed,
    targetSeq: target.seq,
    speedFixed: toFixed(level.projectileSpeed * TICK_SECONDS),
    damage,
    aoeRadiusFixed: level.aoeRadius ? toFixed(level.aoeRadius) : 0,
    splashDamage: level.splashDamage ?? null,
    pierceLeft: level.pierceCount ?? 1,
    appliesStatuses: level.appliesStatuses ?? [],
    statusTicks: level.statusDurationSeconds ? secondsToTicks(level.statusDurationSeconds) : 0,
    bonusVsTag: level.bonusVsTag ?? null,
  });
}

/**
 * Run a tower's second weapon, if it has one.
 *
 * Ace Pilot carries a gun and a bomb, and its published damage per second is the two
 * added together: at level 5, 14 every 0.12 seconds plus a 45 bomb every 1.5 seconds is
 * exactly the 146.67 its page states. Modelling that as one weapon means choosing which
 * half to ship and being wrong by the other.
 *
 * It picks its own target rather than sharing the gun's, because the gun may be
 * reloading, out of burst, or between shots at the moment the bomb comes up.
 *
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @param {import('../state/match-state.js').Tower} tower
 * @param {import('../../data/schema/types.js').TowerLevel} level
 */
function fireSecondary(state, gameData, tower, level) {
  const weapon = level.secondary;
  if (!weapon) return;

  if (tower.secondaryCooldownTicks > 0) {
    tower.secondaryCooldownTicks -= 1;
    return;
  }

  const stats = effectiveStats(state, gameData, tower);
  const inRange = candidates(state, gameData, tower, level, stats.range);
  if (inRange.length === 0) return;

  const target = selectTarget(inRange, /** @type {any} */ (tower.targeting), gameData, tower);
  if (!target) return;

  // Given its own level-shaped view, so the blast uses the bomb's radius rather than
  // the gun's, and the gun's statuses are not applied a second time by the bomb.
  const asLevel = /** @type {any} */ ({
    ...level,
    damage: weapon.damage,
    aoeRadius: weapon.aoeRadius,
    splashDamage: undefined,
    appliesStatuses: [],
    critDamage: undefined,
    critEveryNthHit: undefined,
  });
  resolveHit(state, gameData, tower.seq, target, weapon.damage, asLevel);
  tower.secondaryCooldownTicks = Math.max(1, secondsToTicks(weapon.cooldownSeconds));
}

/**
 * The damage this particular shot carries, counting critical hits.
 *
 * A crit lands on a fixed cadence rather than on a die roll. That is not a
 * simplification for determinism's sake -- the simulation has a seeded stream and could
 * roll -- it is what the source's own numbers describe. Warden lists 6 damage, a
 * critical hit of 9, and 10.77 damage per second at a 0.65 second swing; 6 over 0.65 is
 * 9.23, and the published figure is reached exactly when every third swing deals the 9.
 * The same holds at all five of its levels, which a probability would not do.
 *
 * Using the page's OWN critical damage rather than multiplying is deliberate: at level
 * 2 the listed crit is 23 where 15 times 1.5 is 22.5, and it is the 23 that reproduces
 * the published rate.
 *
 * @param {import('../state/match-state.js').Tower} tower
 * @param {import('../../data/schema/types.js').TowerLevel} level
 * @param {number} baseDamage  after auras and buffs
 * @returns {number}
 */
function damageForThisHit(tower, level, baseDamage) {
  tower.hitsLanded = (tower.hitsLanded ?? 0) + 1;
  const every = level.critEveryNthHit ?? 0;
  if (every < 2 || !level.critDamage) return baseDamage;
  if (tower.hitsLanded % every !== 0) return baseDamage;
  // Scaled by whatever the buffs did to the base, so a damage aura lifts a crit too
  // rather than being silently dropped on every third swing.
  const scale = level.damage > 0 ? baseDamage / level.damage : 1;
  return Math.round(level.critDamage * scale);
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
    // Same rule as the projectile path: the thing aimed at takes the full figure and
    // everything else caught in the blast takes the splash one, when the tower carries a
    // separate splash figure at all.
    const amount = enemy.seq === target.seq || level.splashDamage == null
      ? damage
      : level.splashDamage;
    const result = applyDamage(enemy, def, amount, gameData, level.bonusVsTag ?? null);
    if (result.dealt > 0) {
      recordEvent(state, {
        type: 'damageDealt', x: enemy.xFixed, y: enemy.yFixed, amount: result.dealt,
      });
    }
    if (result.killed) {
      state.cash += result.reward;
      state.killCount += 1;
      recordEvent(state, {
        type: 'kill', x: enemy.xFixed, y: enemy.yFixed, enemyDefId: enemy.defId,
      });
    }
    for (const statusId of level.appliesStatuses ?? []) {
      const status = gameData.statuses.get(statusId);
      if (!status) continue;
      const ticks = level.statusDurationSeconds ? secondsToTicks(level.statusDurationSeconds) : 1;
      applyStatus(enemy, def, status, ticks, level.statusDamagePerTick);
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
    // The thing that was aimed at takes the full figure; everything else caught in the
    // blast takes the splash one, when the tower carries a separate splash figure at
    // all. Ranger's top level deals 875 to what it hit and 375 around it, and 875 over
    // its 8 second interval plus 375 over the same is exactly the 156.25 its page
    // publishes. A tower with no splash figure applies its damage to the whole area, as
    // every splash tower in the roster did before this.
    const isDirectTarget = shot.targetSeq != null && enemy.seq === shot.targetSeq;
    const amount = isDirectTarget || shot.splashDamage == null ? shot.damage : shot.splashDamage;
    const result = applyDamage(enemy, def, amount, gameData, shot.bonusVsTag);
    if (result.dealt > 0) {
      recordEvent(state, {
        type: 'damageDealt', x: enemy.xFixed, y: enemy.yFixed, amount: result.dealt,
      });
    }
    if (result.killed) {
      state.cash += result.reward;
      state.killCount += 1;
      recordEvent(state, {
        type: 'kill', x: enemy.xFixed, y: enemy.yFixed, enemyDefId: enemy.defId,
      });
    }
  }
  state.enemies = state.enemies.filter((e) => e.hp > 0);
}
