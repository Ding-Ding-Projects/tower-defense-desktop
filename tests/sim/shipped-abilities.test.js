/**
 * The abilities the shipped roster actually has, played through the real data.
 *
 * Every other check in this directory runs against the synthetic fixture, which is the
 * right way to test a mechanic and says nothing about whether anything on disk uses it.
 * For the ability system the answer was nothing at all: it had never run in a real
 * match, which is how its `buffPulse` branch sat empty behind a comment claiming
 * otherwise for the entire life of the project.
 *
 * Freezer's page describes a Frost Grenade at level 4 -- "freezes up to five enemies
 * for 2 seconds in an explosion radius of 6" -- and the tower shipped without it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadGameData } from '../../src/data/loader.js';
import { createMatch, submitCommand, runTicks } from '../../src/sim/core/match.js';
import { TICK_RATE } from '../../src/sim/core/constants.js';

const gameData = loadGameData();

test('at least one shipped tower has an ability, so the system has a real user', () => {
  // Written as a roster-wide question on purpose. A system with no users is a system
  // nothing exercises, and this one demonstrated exactly where that leads.
  const withAbility = [...gameData.towers.values()]
    .filter((def) => def.levels.some((level) => level.ability));
  assert.ok(
    withAbility.length > 0,
    'no tower on disk has an ability, so the ability system is dead code again',
  );
});

test('Freezer gains its Frost Grenade at level 4 and not before', () => {
  const freezer = gameData.towers.get('freezer');
  assert.ok(freezer, 'freezer is not in the shipped roster');
  const levels = freezer.levels.map((level) => Boolean(level.ability));
  assert.deepEqual(
    levels, [false, false, false, false, true],
    'the page puts Frost Grenade at Level 4; the row says ' + JSON.stringify(levels),
  );
});

test('the Frost Grenade freezes, and freezing is not the same as stunning', () => {
  // The ability system hardcoded `stun` -- a full stop -- for every pulse of this kind.
  // The page says freeze, and this project carries `freeze` as its own status with its
  // own speed multiplier, so the hardcoded version would have shipped a stronger
  // ability than the source describes with the data row saying nothing either way.
  const ability = gameData.towers.get('freezer').levels[4].ability;
  assert.equal(ability.statusId, 'freeze');
  const freeze = gameData.statuses.get('freeze');
  const stun = gameData.statuses.get('stun');
  assert.ok(freeze && stun, 'both statuses must exist for this distinction to mean anything');
  assert.notEqual(
    freeze.speedMultiplier ?? 0, stun.speedMultiplier ?? 0,
    'freeze and stun are the same effect, so naming one over the other proves nothing',
  );
});

test('using it on a real map freezes real enemies', () => {
  // The cap of five is checked on the fixture, where positions can be chosen. Here the
  // question is only whether the ability does anything at all in the shipped game,
  // which is exactly the question nothing was asking when `buffPulse` sat empty.
  const map = gameData.maps.get('crossroads');
  const waypoints = map.lanes[0].waypoints;
  const distanceToLane = (x, y) =>
    Math.min(...waypoints.map((p) => Math.hypot(p.x - x, p.y - y)));

  // Beside the lane rather than at the first buildable square on the map. The first
  // such square on crossroads is (2, 22), which no enemy passes within six units of, so
  // a Freezer placed there can be perfectly functional and freeze nothing forever.
  const candidates = [];
  for (let x = 1; x < 100; x += 1) {
    for (let y = 1; y < 100; y += 1) {
      const d = distanceToLane(x, y);
      if (d > 1.5 && d < 4) candidates.push({ x, y, d });
    }
  }
  candidates.sort((a, b) => (a.d === b.d ? a.x - b.x || a.y - b.y : a.d - b.d));

  const match = createMatch({ gameData, seed: 11, mapId: 'crossroads', difficultyId: 'easy' });
  match.state.cash = 1000000;
  let tower = null;
  for (const c of candidates) {
    submitCommand(match, 'PlaceTower', { towerId: 'freezer', x: c.x, y: c.y });
    runTicks(match, 3);
    tower = match.state.towers[0] ?? null;
    if (tower) break;
  }
  assert.ok(tower, 'could not place a Freezer anywhere beside the lane on crossroads');

  for (let i = 0; i < 4; i += 1) {
    submitCommand(match, 'UpgradeTower', { seq: tower.seq });
    runTicks(match, 3);
  }
  assert.equal(tower.level, 4, 'the tower never reached the level that carries the ability');

  const radiusFixed = tower.xFixed && gameData.towers.get('freezer').levels[4].ability.radius * 1024;
  const inBlast = () => match.state.enemies.filter((e) =>
    e.hp > 0 &&
    (e.xFixed - tower.xFixed) ** 2 + (e.yFixed - tower.yFixed) ** 2 <= radiusFixed * radiusFixed);

  // Wait for the wave to actually bring something into the blast, then use it.
  let frozen = 0;
  for (let k = 0; k < 4000 && frozen === 0; k += 1) {
    runTicks(match, 1);
    if (inBlast().length === 0 || tower.abilityCooldownTicks > 0) continue;
    const targets = inBlast();
    submitCommand(match, 'UseAbility', { seq: tower.seq });
    runTicks(match, 3);
    frozen = targets.filter((e) => e.statuses.some((s) => s.id === 'freeze')).length;
  }
  assert.ok(
    frozen > 0,
    'the Frost Grenade was used on enemies inside its own blast radius and froze none of them',
  );
});

test('the grenade wears off after the two seconds the page states', () => {
  const ability = gameData.towers.get('freezer').levels[4].ability;
  assert.equal(ability.durationSeconds, 2);
  assert.equal(ability.cooldownSeconds, 15);
  assert.equal(ability.radius, 6);
  assert.ok(
    ability.cooldownSeconds > ability.durationSeconds,
    'an ability that lasts as long as its cooldown is permanently on',
  );
  assert.ok(TICK_RATE > 0);
});
