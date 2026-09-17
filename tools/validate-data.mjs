#!/usr/bin/env node
/**
 * Validate every data row.
 *
 * Two kinds of check, and the second matters more than the first.
 *
 * Shape checks catch a row that is wrong on its own: a negative cost, a fire rate of
 * zero, upgrade levels that skip a number. Cross-reference checks catch a row that is
 * wrong only in company: a wave that summons an enemy nobody defined, a difficulty
 * that bans a tower that does not exist, a boss whose summon points at a deleted id.
 * The second kind is what actually breaks a running match, and no amount of care with
 * a single file finds it.
 *
 * A missing wave table warns rather than fails, because the roster is meant to arrive
 * in tranches and a half-populated map should not stop the build.
 */

import { loadGameData, RAW } from '../src/data/loader.js';

const problems = [];
const warnings = [];

/**
 * @param {boolean} condition
 * @param {string} message
 */
function must(condition, message) {
  if (!condition) problems.push(message);
}

/**
 * Every row must say where it came from, and may not pretend.
 * @param {any} source
 * @param {string} where
 */
function checkSource(source, where) {
  if (!source || typeof source !== 'object') {
    problems.push(where + ': no source block at all');
    return;
  }
  if (source.origin === 'engine-default') {
    must(
      typeof source.reason === 'string' && source.reason.length > 20,
      where + ': an engine default must say why, in a sentence, not a word',
    );
    must(
      source.wikiUrl === undefined,
      where + ': an engine default must not also carry a citation it did not come from',
    );
    return;
  }
  must(typeof source.wikiUrl === 'string' && source.wikiUrl.startsWith('https://'),
    where + ': needs an https source URL, or an explicit engine-default origin');
  must(/^\d{4}-\d{2}-\d{2}$/.test(source.retrievedAt ?? ''),
    where + ': needs a retrievedAt date in yyyy-mm-dd form');
  if (/^\d{4}-\d{2}-\d{2}$/.test(source.retrievedAt ?? '')) {
    const today = new Date().toISOString().slice(0, 10);
    must(source.retrievedAt <= today, where + ': retrievedAt is in the future');
  }
}

const data = loadGameData();

// --- statuses ---------------------------------------------------------------
for (const raw of RAW.statuses) {
  /** @type {any} */ const status = raw;
  const where = 'status ' + status.id;
  checkSource(status.source, where);
  must(['stun', 'slow', 'dot', 'debuff', 'buff'].includes(status.category), where + ': unknown category');
  must(['refresh', 'stack', 'highest'].includes(status.stackingRule), where + ': unknown stacking rule');
  if (status.stackingRule === 'stack') {
    must(typeof status.maxStacks === 'number' && status.maxStacks > 1,
      where + ': a stacking status needs a cap above 1, or it is really a refresh');
  }
  if (status.speedMultiplier !== undefined) {
    must(status.speedMultiplier > 0, where + ': a speed multiplier of zero is a stun, not a slow');
  }
}

/**
 * The targeting modes the simulation implements.
 *
 * Hand-written here and deliberately not imported from anywhere. Six places name these
 * modes -- this list, the switch in `systems/targeting.js`, the `TargetingMode` typedef,
 * `ALL_TARGETING_MODES` and `LABELS` in the interface, and every tower row on disk --
 * and `tests/data/targeting-modes.test.js` holds all six against each other. A list
 * that read its expectations from one of the others could not notice that one drifting.
 */
const TARGETING_MODES = ['first', 'last', 'closest', 'strongest', 'weakest'];

// --- towers -----------------------------------------------------------------
for (const raw of RAW.towers) {
  /** @type {any} */ const tower = raw;
  const where = 'tower ' + tower.id;
  checkSource(tower.source, where);
  must(tower.baseCost >= 0, where + ': negative cost');
  must(tower.footprintRadius > 0, where + ': a tower with no footprint could stack infinitely');
  must(tower.allowedTerrain.length > 0, where + ': cannot be placed anywhere at all');
  for (const terrain of tower.allowedTerrain) {
    must(['ground', 'water', 'cliff'].includes(terrain), where + ': unknown terrain ' + terrain);
  }
  must(tower.targetingModes.length > 0, where + ': has no targeting modes');
  for (const mode of tower.targetingModes) {
    // The simulation throws on a mode it does not implement, which is the right
    // behaviour and the wrong moment: the throw happens the first time a tower carrying
    // that mode picks a target, so a typo in a data row is a crash several waves into a
    // match in front of whoever is playing, rather than a file that failed to validate.
    // The terrain list two lines up has been checked this way all along.
    must(TARGETING_MODES.includes(mode), where + ': unknown targeting mode ' + mode);
  }
  // A FRACTION between 0 and 1, never a number out of a hundred. The field used to
  // be called sellRefundPercent while holding 0.7, so the simulation read it as a
  // fraction and the interface read it as a percentage. Both were reasonable given
  // the name, and the visible result was a tower offering to sell for nothing.
  must(typeof tower.sellRefundFraction === 'number' && tower.sellRefundFraction >= 0 && tower.sellRefundFraction <= 1,
    where + ': sellRefundFraction is ' + tower.sellRefundFraction + '; it must be a fraction between 0 and 1, not a percentage');
  must(tower.levels.length > 0, where + ': has no levels');

  tower.levels.forEach((level, i) => {
    const lw = where + ' level ' + level.level;
    checkSource(level.source, lw);
    must(level.level === i, lw + ': levels must run 0,1,2 with no gaps, found index ' + i);
    must(level.damage >= 0, lw + ': negative damage');
    must(level.range >= 0, lw + ': negative range');
    must(level.cost >= 0, lw + ': negative cost');
    must(i === 0 || level.cost > 0, lw + ': an upgrade that costs nothing is free power');
    // A support tower earns money and never fires, so zero is its honest rate. The rule
    // still bites for anything that is supposed to shoot: a gun with a rate of zero is
    // a gun that silently does nothing, which is exactly what this was written to catch.
    const earnsInsteadOfShooting = (level.incomePerWave ?? 0) > 0 && level.damage === 0;
    must(
      earnsInsteadOfShooting || level.fireRate > 0,
      lw + ': a fire rate of zero never shoots, and this tower has no income to earn instead',
    );
    // Half a critical-hit specification is the dangerous shape: a crit figure with no
    // cadence, or a cadence with no figure, is a row that silently does nothing or
    // silently crits on every swing depending on which half is missing.
    const hasCritDamage = level.critDamage != null;
    const hasCritCadence = level.critEveryNthHit != null;
    must(
      hasCritDamage === hasCritCadence,
      lw + ': a critical hit needs both its damage and how often it lands, and has only one',
    );
    if (hasCritDamage && hasCritCadence) {
      must(level.critDamage > level.damage, lw + ': a critical hit that deals no more than an ordinary one');
      must(level.critEveryNthHit >= 2, lw + ': a critical hit every hit is not a critical hit');
    }

    must(
      !earnsInsteadOfShooting || level.range === 0,
      lw + ': a tower that earns rather than shoots should have no range; it never acquires a target',
    );
    for (const statusId of level.appliesStatuses ?? []) {
      must(data.statuses.has(statusId), lw + ': applies unknown status ' + statusId);
    }
    if (level.ability) {
      // An ability naming a status that does not exist fails in total silence: the
      // simulation looks it up, gets nothing, and returns having spent the cooldown.
      // The player presses a button, watches it go grey, and nothing happens. That is
      // exactly how this system's buffPulse branch went unnoticed for the whole life
      // of the project, so it is a validation failure rather than a runtime shrug.
      if (level.ability.statusId !== undefined) {
        must(
          data.statuses.has(level.ability.statusId),
          lw + ': ability ' + level.ability.id + ' applies unknown status ' + level.ability.statusId,
        );
      }
      must(
        level.ability.cooldownSeconds > (level.ability.durationSeconds ?? 0),
        lw + ': ability ' + level.ability.id + ' lasts at least as long as its own cooldown, so it is permanently on',
      );
      must(
        level.ability.maxTargets === undefined || level.ability.maxTargets > 0,
        lw + ': ability ' + level.ability.id + ' may catch ' + level.ability.maxTargets + ' enemies',
      );
    }
    if (level.bonusVsTag) {
      const tagExists = RAW.statuses.some((s) => /** @type {any} */ (s).tag === level.bonusVsTag.tag);
      must(tagExists, lw + ': bonus against tag ' + level.bonusVsTag.tag + ', which no status carries');
    }
  });
}

// --- enemies ----------------------------------------------------------------
for (const raw of RAW.enemies) {
  /** @type {any} */ const enemy = raw;
  const where = 'enemy ' + enemy.id;
  checkSource(enemy.source, where);
  must(enemy.maxHp > 0, where + ': needs at least one hit point');
  must(enemy.speed > 0, where + ': a speed of zero never reaches the end');
  must(enemy.leakDamage > 0, where + ': leaking for nothing makes it harmless');
  must(enemy.killReward >= 0, where + ': negative reward');
  must(enemy.shieldHp >= 0 && enemy.defense >= 0, where + ': negative mitigation');
  for (const statusId of enemy.immunities) {
    must(data.statuses.has(statusId), where + ': immune to unknown status ' + statusId);
  }
  for (const ability of enemy.abilities) {
    const aw = where + ' ability ' + ability.kind;
    must(['summon', 'stun', 'shieldPhase', 'heal', 'speedPhase'].includes(ability.kind),
      aw + ': unknown kind');
    if (ability.kind === 'summon') {
      must(typeof ability.summonEnemyId === 'string' && data.enemies.has(ability.summonEnemyId),
        aw + ': summons unknown enemy ' + ability.summonEnemyId);
      must((ability.count ?? 1) > 0, aw + ': summons nothing');
      must(ability.summonEnemyId !== enemy.id, aw + ': summons itself, which never ends');
    }
    if (ability.hpThreshold !== undefined) {
      must(ability.hpThreshold > 0 && ability.hpThreshold < 1,
        aw + ': a health threshold outside 0..1 either never fires or fires at once');
    }
  }
}

// --- maps -------------------------------------------------------------------
for (const raw of RAW.maps) {
  /** @type {any} */ const map = raw;
  const where = 'map ' + map.id;
  checkSource(map.source, where);
  must(map.baseLives > 0, where + ': starts already lost');
  must(map.lanes.length > 0, where + ': has no lanes');
  for (const lane of map.lanes) {
    const lw = where + ' lane ' + lane.id;
    must(lane.waypoints.length >= 2, lw + ': needs at least two waypoints to be a path');
    for (let i = 1; i < lane.waypoints.length; i += 1) {
      const a = lane.waypoints[i - 1];
      const b = lane.waypoints[i];
      must(a.x !== b.x || a.y !== b.y, lw + ': zero-length segment at waypoint ' + i);
    }
  }
  for (const zone of map.placementZones) {
    const zw = where + ' zone ' + zone.id;
    must(['ground', 'water', 'cliff'].includes(zone.terrain), zw + ': unknown terrain');
    must(zone.polygon.length >= 3, zw + ': a polygon needs three corners');
    must(!selfIntersects(zone.polygon), zw + ': polygon crosses itself, so point-in-polygon lies');
  }
}

// --- difficulties -----------------------------------------------------------
for (const raw of RAW.difficulties) {
  /** @type {any} */ const difficulty = raw;
  const where = 'difficulty ' + difficulty.id;
  checkSource(difficulty.source, where);
  must(difficulty.startingCash >= 0, where + ': negative starting cash');
  must(difficulty.enemyHpMultiplier > 0, where + ': enemies would start dead');
  must(difficulty.enemySpeedMultiplier > 0, where + ': enemies would never move');
  must(difficulty.cashMultiplier >= 0, where + ': negative cash multiplier');
  if (difficulty.livesOverride !== null) {
    must(difficulty.livesOverride > 0, where + ': starts already lost');
  }
  for (const towerId of difficulty.disallowedTowers) {
    must(data.towers.has(towerId), where + ': bans unknown tower ' + towerId);
  }
}

// --- wave tables ------------------------------------------------------------
for (const raw of RAW.waveTables) {
  /** @type {any} */ const table = raw;
  const where = 'waves ' + table.mapId + ':' + table.difficultyId;
  checkSource(table.source, where);
  const map = data.maps.get(table.mapId);
  must(Boolean(map), where + ': references unknown map');
  must(data.difficulties.has(table.difficultyId), where + ': references unknown difficulty');
  must(table.waves.length > 0, where + ': has no waves');
  table.waves.forEach((wave, i) => {
    const ww = where + ' wave ' + wave.index;
    must(wave.index === i + 1, ww + ': waves must run 1,2,3 with no gaps');
    must(wave.intermissionSeconds >= 0, ww + ': negative intermission');
    must(wave.completionBonus >= 0, ww + ': negative bonus');
    must(wave.groups.length > 0, ww + ': spawns nothing, so the wave never ends');
    for (const group of wave.groups) {
      must(data.enemies.has(group.enemyId), ww + ': spawns unknown enemy ' + group.enemyId);
      must(group.count > 0, ww + ': a group of zero');
      must(group.spawnIntervalSeconds >= 0, ww + ': negative spawn interval');
      must(group.startDelaySeconds >= 0, ww + ': negative start delay');
      if (map) {
        must(map.lanes.some((l) => l.id === group.lane), ww + ': spawns on unknown lane ' + group.lane);
      }
    }
  });
}

// Missing tables warn rather than fail: the roster arrives in tranches on purpose.
for (const map of RAW.maps) {
  for (const difficulty of RAW.difficulties) {
    if (!data.waveTables.has(map.id + ':' + difficulty.id)) {
      warnings.push('no wave table for ' + map.id + ' on ' + difficulty.id + ' (pending, not a failure)');
    }
  }
}

/**
 * @param {Array<[number, number]>} polygon
 * @returns {boolean}
 */
function selfIntersects(polygon) {
  const n = polygon.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      // Adjacent edges share a corner, which is not an intersection.
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsCross(polygon[i], polygon[(i + 1) % n], polygon[j], polygon[(j + 1) % n])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * @param {[number, number]} p1 @param {[number, number]} p2
 * @param {[number, number]} p3 @param {[number, number]} p4
 */
function segmentsCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

const counts =
  RAW.towers.length + ' tower(s), ' + RAW.enemies.length + ' enemy(ies), ' +
  RAW.statuses.length + ' status(es), ' + RAW.maps.length + ' map(s), ' +
  RAW.difficulties.length + ' difficulty(ies), ' + RAW.waveTables.length + ' wave table(s)';

for (const warning of warnings) console.warn('warn: ' + warning);

if (problems.length > 0) {
  console.error('\ndata validation FAILED with ' + problems.length + ' problem(s):');
  for (const problem of problems) console.error('  - ' + problem);
  process.exit(1);
}

console.log('data validation passed: ' + counts + (warnings.length ? ', ' + warnings.length + ' pending' : ''));
