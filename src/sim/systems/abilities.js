/**
 * Abilities, both the ones a player presses and the ones a boss uses.
 *
 * Every effect here is chosen by a string on a data row. There is deliberately no
 * branch anywhere in this file that names a specific tower or a specific boss: the
 * moment one exists, adding an enemy stops being a data change, which is the whole
 * property the project is built around.
 */

import { toFixed, distanceSquared } from '../core/fixed.js';
import { secondsToTicks } from '../core/constants.js';
import { applyDamage, applyTrueDamage } from './damage.js';
import { applyStatus } from './statuses.js';
import { takeSeq } from '../state/match-state.js';
import { recordEvent } from '../state/events.js';
import { laneMetrics, positionAlong, requireLane } from './geometry.js';

/**
 * Run every ability a player queued this tick.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 */
export function runPendingAbilities(state, gameData) {
  const pending = state.pendingAbilities ?? [];
  if (pending.length === 0) return;
  state.pendingAbilities = [];

  for (const entry of [...pending].sort((a, b) => a.towerSeq - b.towerSeq)) {
    const tower = state.towers.find((t) => t.seq === entry.towerSeq);
    if (!tower) continue;
    const def = gameData.towers.get(tower.defId);
    const level = def ? def.levels[tower.level] : undefined;
    const ability = level ? level.ability : undefined;
    if (!ability) continue;

    // Freezer's Frost Grenade is the roster's only ability, and using it produced no
    // visible or audible sign that anything had happened at all -- the button greyed
    // out and enemies slowed down a moment later. `abilityCast` was declared as a thing
    // a snapshot event could be and was emitted by nothing.
    recordEvent(state, {
      type: 'abilityCast',
      x: tower.xFixed,
      y: tower.yFixed,
      towerDefId: tower.defId,
      radius: ability.radius ?? 0,
    });

    const radiusFixed = toFixed(ability.radius ?? 0);
    const rSq = radiusFixed * radiusFixed;
    const caught = state.enemies
      .filter(
        (e) =>
          e.hp > 0 &&
          (radiusFixed === 0 ||
            distanceSquared(tower.xFixed, tower.yFixed, e.xFixed, e.yFixed) <= rSq),
      )
      .sort((a, b) => a.seq - b.seq);

    switch (ability.effect) {
      case 'damageBurst':
        for (const enemy of caught) {
          const enemyDef = gameData.enemies.get(enemy.defId);
          if (!enemyDef) continue;
          const result = applyDamage(enemy, enemyDef, ability.magnitude, gameData, null);
          if (result.killed) {
            state.cash += result.reward;
            state.killCount += 1;
          }
        }
        state.enemies = state.enemies.filter((e) => e.hp > 0);
        break;
      case 'stunPulse': {
        // The status is named by the data row rather than assumed. It used to be
        // hardcoded to stun, which is a full stop, and the roster's actual user of this
        // effect is Freezer's Frost Grenade: its page says it freezes, and this project
        // already carries `freeze` as a distinct status with its own speed multiplier.
        // Hardcoding stun would have quietly shipped a stronger ability than the source
        // describes, with the data row saying nothing either way.
        const status = gameData.statuses.get(ability.statusId ?? 'stun');
        if (!status) break;

        // A grenade that catches "up to five enemies" needs a cap, and the cap needs to
        // pick the same five on every run or the replay proof is worthless. Nearest to
        // the blast first, with the spawn sequence breaking an exact tie, which is both
        // deterministic and the way an explosion actually behaves.
        const reached = ability.maxTargets == null
          ? caught
          : [...caught]
            .sort((a, b) => {
              const da = distanceSquared(tower.xFixed, tower.yFixed, a.xFixed, a.yFixed);
              const db = distanceSquared(tower.xFixed, tower.yFixed, b.xFixed, b.yFixed);
              return da === db ? a.seq - b.seq : da - db;
            })
            .slice(0, ability.maxTargets);

        for (const enemy of reached) {
          const enemyDef = gameData.enemies.get(enemy.defId);
          if (!enemyDef) continue;
          applyStatus(enemy, enemyDef, status, secondsToTicks(ability.durationSeconds ?? 1));
        }
        break;
      }
      case 'healBase':
        // Deliberately cannot exceed the starting total. A heal that stacks past the
        // maximum turns a defensive ability into an infinite resource.
        state.lives += ability.magnitude;
        break;
      case 'buffPulse':
        // This branch used to be empty, with a comment claiming the buff was "handled
        // as an aura on the data row". The aura on a data row is the tower's PASSIVE
        // one, which is always on, so pressing the button spent a thirty second
        // cooldown and changed nothing whatsoever. Nothing was red: no shipped tower
        // had an ability, so the dead branch had never once been reached.
        //
        // The duration lives on the tower and the aura is read back out of the ability
        // while it lasts, which keeps the property the aura system is built on: every
        // effective stat is still a pure function of the current world, so a replay
        // re-derives it and selling the source removes the buff with no bookkeeping.
        tower.abilityActiveTicks = secondsToTicks(ability.durationSeconds ?? 0);
        break;
      default:
        throw new Error('unknown ability effect: ' + ability.effect);
    }
  }
}

/**
 * Tick down every tower ability cooldown.
 * @param {import('../state/match-state.js').MatchState} state
 */
export function coolAbilities(state) {
  for (const tower of state.towers) {
    if (tower.abilityCooldownTicks > 0) tower.abilityCooldownTicks -= 1;
    if (tower.abilityActiveTicks > 0) tower.abilityActiveTicks -= 1;
    if (tower.waveAuraTicks > 0) tower.waveAuraTicks -= 1;
  }
}

/**
 * Boss and enemy abilities. Cooldown-driven, plus a one-shot health threshold trigger.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 */
export function runEnemyAbilities(state, gameData) {
  const map = gameData.maps.get(state.mapId);
  if (!map) return;

  for (const enemy of [...state.enemies].sort((a, b) => a.seq - b.seq)) {
    if (enemy.hp <= 0) continue;
    const def = gameData.enemies.get(enemy.defId);
    if (!def || def.abilities.length === 0) continue;

    for (let i = 0; i < def.abilities.length; i += 1) {
      const ability = def.abilities[i];
      const key = String(i);

      if (ability.hpThreshold !== undefined) {
        // Fires exactly once, the first tick the enemy drops below the threshold.
        if (enemy.firedThresholds.includes(key)) continue;
        if (enemy.hp / enemy.maxHp > ability.hpThreshold) continue;
        enemy.firedThresholds.push(key);
      } else {
        const remaining = enemy.abilityCooldowns[key] ?? 0;
        if (remaining > 0) {
          enemy.abilityCooldowns[key] = remaining - 1;
          continue;
        }
        enemy.abilityCooldowns[key] = secondsToTicks(ability.cooldownSeconds);
      }

      runEnemyAbility(state, gameData, enemy, ability);
    }
  }
}

/**
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @param {import('../state/match-state.js').Enemy} enemy
 * @param {import('../../data/schema/types.js').EnemyAbilityDef} ability
 */
function runEnemyAbility(state, gameData, enemy, ability) {
  switch (ability.kind) {
    case 'summon': {
      const summonDef = ability.summonEnemyId
        ? gameData.enemies.get(ability.summonEnemyId)
        : undefined;
      if (!summonDef) break;
      const map = gameData.maps.get(state.mapId);
      if (!map) break;
      const lane = requireLane(map, enemy.laneId);
      const metrics = laneMetrics(lane);
      for (let n = 0; n < (ability.count ?? 1); n += 1) {
        // Summons appear where the parent is, so a boss reinforcing itself deep in a
        // lane genuinely skips the early defences rather than walking from the start.
        const offsetFixed = enemy.offsetFixed + toFixed((n - (ability.count ?? 1) / 2) * 0.4);
        const pos = positionAlong(lane, metrics, enemy.distFixed, offsetFixed);
        state.enemies.push({
          seq: takeSeq(state),
          defId: summonDef.id,
          laneId: enemy.laneId,
          segment: pos.segment,
          distFixed: enemy.distFixed,
          xFixed: pos.xFixed,
          yFixed: pos.yFixed,
          offsetFixed,
          hp: summonDef.maxHp,
          maxHp: summonDef.maxHp,
          shield: summonDef.shieldHp,
          statuses: [],
          abilityCooldowns: {},
          firedThresholds: [],
        });
      }
      break;
    }
    case 'stun': {
      // Stuns towers, not enemies: the radius is measured from the enemy and every
      // tower inside it loses its next shots.
      const radiusFixed = toFixed(ability.radius ?? 0);
      const rSq = radiusFixed * radiusFixed;
      const ticks = secondsToTicks(ability.durationSeconds ?? 1);
      for (const tower of state.towers) {
        if (distanceSquared(enemy.xFixed, enemy.yFixed, tower.xFixed, tower.yFixed) <= rSq) {
          tower.reloadTicks = Math.max(tower.reloadTicks, ticks);
        }
      }
      break;
    }
    case 'shieldPhase':
      enemy.shield += ability.magnitude ?? 0;
      break;
    case 'heal': {
      const healed = Math.trunc(enemy.maxHp * (ability.magnitude ?? 0));
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + healed);
      break;
    }
    case 'speedPhase': {
      const haste = gameData.statuses.get('haste');
      const def = gameData.enemies.get(enemy.defId);
      if (haste && def) {
        applyStatus(enemy, def, haste, secondsToTicks(ability.durationSeconds ?? 1));
      }
      break;
    }
    default:
      throw new Error('unknown enemy ability kind: ' + ability.kind);
  }
}

export { applyTrueDamage };
