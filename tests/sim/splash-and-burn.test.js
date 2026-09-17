/**
 * Two things the source's own arithmetic asked for, and the engine did not have.
 *
 * Both surfaced from the same place: the published damage-per-second column. Footnote
 * markers were being read as part of the number, so "19 [ 2 ]" was not a number and the
 * cell was thrown away. Fixing that widened the cross-check from 83 levels to 97, and
 * two of the newly visible rows disagreed immediately.
 *
 * Freezer publishes 19 where its direct damage alone is 16. The missing 3 is its chill,
 * a burn the engine could express only as a property of the status itself, identically
 * at every level. Freezer chills for 3 at one level and 5 at the next.
 *
 * Ranger's top level publishes 156.25 where 875 over its 8 second interval is 109.375.
 * The missing 46.875 is 375 over the same interval: it deals 875 to what it hit and 375
 * to everything else in the blast, and the engine applied one figure to the whole area.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createMatchState } from '../../src/sim/state/match-state.js';
import { fireTowers } from '../../src/sim/systems/firing.js';
import { applyStatus, damageOverTime } from '../../src/sim/systems/statuses.js';
import { makeGameData, placeEnemy } from '../fixtures/game-data.js';

test('a tower burns for its own figure, not the status definition\'s', () => {
  const gameData = makeGameData();
  const burn = gameData.statuses.get('burn');
  assert.equal(burn.damagePerTick, 2, 'the fixture burn deals 2, which is what is being overridden');

  const enemyDef = gameData.enemies.get('grunt');
  const scorched = /** @type {any} */ ({ statuses: [] });
  applyStatus(scorched, enemyDef, burn, 30, 7);
  assert.equal(damageOverTime(scorched, gameData.statuses), 7, 'the applier\'s figure should win');

  const plain = /** @type {any} */ ({ statuses: [] });
  applyStatus(plain, enemyDef, burn, 30);
  assert.equal(damageOverTime(plain, gameData.statuses), 2, 'with no override, the status definition stands');
});

test('a second application replaces the burn figure, rather than keeping the first', () => {
  // Two towers applying the same status for different amounts is the ordinary case:
  // one Freezer at level 3 and another at level 4 chill for 3 and 5.
  const gameData = makeGameData();
  const burn = gameData.statuses.get('burn');
  const enemyDef = gameData.enemies.get('grunt');
  const enemy = /** @type {any} */ ({ statuses: [] });

  applyStatus(enemy, enemyDef, burn, 30, 3);
  applyStatus(enemy, enemyDef, burn, 30, 5);
  assert.equal(
    damageOverTime(enemy, gameData.statuses) / enemy.statuses[0].stacks, 5,
    'the more recent applier should set the figure',
  );
});

/**
 * Fire once at a cluster and report what each enemy lost.
 * @param {{splashDamage?: number}} overrides
 */
function blastDamage(overrides) {
  const gameData = makeGameData();
  const def = gameData.towers.get('gunner');
  const level = def.levels[0];
  Object.assign(level, { fireRate: 1, range: 1000, damage: 100, aoeRadius: 30 }, overrides);

  const state = createMatchState(gameData, { seed: 4, mapId: 'proving-ground', difficultyId: 'standard' });
  state.towers.push(/** @type {any} */ ({
    seq: 1, defId: 'gunner', level: 0, xFixed: 100 * 1024, yFixed: 80 * 1024,
    targeting: 'first', cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0,
    reloadTicks: 0, abilityCooldownTicks: 0, totalSpent: 100, hitsLanded: 0,
  }));
  // Two enemies close enough that one shot catches both. The first along the lane is
  // what `first` targeting picks, so the other is the one in the blast.
  const lead = placeEnemy(state, 'grunt', 120 * 1024, { hp: 10000, maxHp: 10000 });
  const trailing = placeEnemy(state, 'grunt', 115 * 1024, { hp: 10000, maxHp: 10000 });

  fireTowers(state, gameData);
  return { lead: 10000 - lead.hp, trailing: 10000 - trailing.hp };
}

test('the direct target takes full damage and the blast takes the splash figure', () => {
  const hit = blastDamage({ splashDamage: 40 });
  assert.equal(hit.lead, 100, 'the thing aimed at should take the full figure');
  assert.equal(hit.trailing, 40, 'everything else in the blast should take the splash figure');
});

test('a tower with no splash figure still hits the whole area for its damage', () => {
  // Demoman, Mortar and Paintballer have one damage column and always have. This is the
  // behaviour every splash tower in the roster had before a separate figure existed, and
  // adding one must not have quietly changed it.
  const hit = blastDamage({});
  assert.equal(hit.lead, 100);
  assert.equal(hit.trailing, 100, 'without a splash figure the blast deals full damage');
});

test('a second weapon fires on its own clock, not the tower\'s', () => {
  // Ace Pilot carries a gun and a bomb, and its published damage per second is the two
  // added together. Modelling it as one weapon means choosing which half to ship and
  // being wrong by the other.
  const gameData = makeGameData();
  const def = gameData.towers.get('gunner');
  const level = def.levels[0];
  Object.assign(level, {
    fireRate: 10, range: 1000, damage: 1, aoeRadius: 0,
    secondary: { damage: 50, cooldownSeconds: 1 },
  });

  const state = createMatchState(gameData, { seed: 6, mapId: 'proving-ground', difficultyId: 'standard' });
  state.towers.push(/** @type {any} */ ({
    seq: 1, defId: 'gunner', level: 0, xFixed: 100 * 1024, yFixed: 80 * 1024,
    targeting: 'first', cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0,
    reloadTicks: 0, abilityCooldownTicks: 0, totalSpent: 100, hitsLanded: 0,
    secondaryCooldownTicks: 0,
  }));
  const enemy = placeEnemy(state, 'grunt', 100 * 1024, { hp: 1e9, maxHp: 1e9 });

  // Three seconds: the gun should land about thirty 1s and the bomb about three 50s.
  const before = enemy.hp;
  for (let tick = 0; tick < 90; tick += 1) fireTowers(state, gameData);
  const dealt = before - enemy.hp;

  // Gun alone would be roughly 30. Bomb alone would be roughly 150. Both is the point.
  assert.ok(dealt > 150, 'only ' + dealt + ' damage in three seconds; the bomb did not fire');
  assert.ok(dealt < 220, dealt + ' damage in three seconds; the bomb fired more often than its cooldown');
});

test('a tower with no second weapon is untouched by any of it', () => {
  const gameData = makeGameData();
  const def = gameData.towers.get('gunner');
  Object.assign(def.levels[0], { fireRate: 10, range: 1000, damage: 1, aoeRadius: 0, secondary: undefined });

  const state = createMatchState(gameData, { seed: 6, mapId: 'proving-ground', difficultyId: 'standard' });
  state.towers.push(/** @type {any} */ ({
    seq: 1, defId: 'gunner', level: 0, xFixed: 100 * 1024, yFixed: 80 * 1024,
    targeting: 'first', cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0,
    reloadTicks: 0, abilityCooldownTicks: 0, totalSpent: 100, hitsLanded: 0,
    secondaryCooldownTicks: 0,
  }));
  const enemy = placeEnemy(state, 'grunt', 100 * 1024, { hp: 1e9, maxHp: 1e9 });

  const before = enemy.hp;
  for (let tick = 0; tick < 90; tick += 1) fireTowers(state, gameData);
  const dealt = before - enemy.hp;
  assert.ok(dealt > 25 && dealt < 35, 'expected about thirty shots of 1, got ' + dealt);
});

/**
 * Fire once into a crowd and report how many enemies took anything at all.
 * @param {{maxSplashTargets?: number}} overrides
 * @param {number} crowd
 */
function blastSpread(overrides, crowd = 10) {
  const gameData = makeGameData();
  const level = gameData.towers.get('gunner').levels[0];
  Object.assign(level, { fireRate: 1, range: 1000, damage: 100, aoeRadius: 60 }, overrides);

  const state = createMatchState(gameData, { seed: 4, mapId: 'proving-ground', difficultyId: 'standard' });
  state.towers.push(/** @type {any} */ ({
    seq: 1, defId: 'gunner', level: 0, xFixed: 100 * 1024, yFixed: 80 * 1024,
    targeting: 'first', cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0,
    reloadTicks: 0, abilityCooldownTicks: 0, abilityActiveTicks: 0,
    totalSpent: 100, hitsLanded: 0, secondaryCooldownTicks: 0,
  }));
  // Spread along the lane so "nearest to the blast" is a real ordering, not a tie.
  const planted = [];
  for (let i = 0; i < crowd; i += 1) {
    planted.push(placeEnemy(state, 'grunt', (100 + i * 3) * 1024, { hp: 100000, maxHp: 100000 }));
  }
  fireTowers(state, gameData);
  return planted.filter((e) => e.hp < 100000).length;
}

test('an uncapped blast damages everything standing in it', () => {
  // The behaviour every splash tower had, kept explicit so the cap below is measured
  // against something rather than asserted on its own.
  assert.ok(blastSpread({}) > 5, 'the crowd is not packed into the blast, so this proves nothing');
});

test('a blast with a stated Max Hits damages exactly that many', () => {
  // Paintballer's page lists Max Hits 8 at every level and Ranger's top level lists 3,
  // and both shipped uncapped, hitting everything in radius. On a packed lane that is a
  // strictly stronger tower than the source describes, and nothing could see it: the
  // damage per enemy was right, there were simply more enemies than the page allows.
  //
  // The page proves the reading on its own. Paintballer prints a DPS and a Max DPS, and
  // the second is the first times eight, at every level.
  assert.equal(blastSpread({ maxSplashTargets: 3 }), 3);
  assert.equal(blastSpread({ maxSplashTargets: 8 }), 8);
});

test('the cap never denies the enemy that was actually aimed at', () => {
  // A cap of one means the blast hits nothing but the target. Dropping the direct hit
  // to make room for a nearer bystander would turn a capped splash tower into one that
  // sometimes fires at nobody.
  const gameData = makeGameData();
  const level = gameData.towers.get('gunner').levels[0];
  Object.assign(level, {
    fireRate: 1, range: 1000, damage: 100, aoeRadius: 60, splashDamage: 40, maxSplashTargets: 1,
  });
  const state = createMatchState(gameData, { seed: 4, mapId: 'proving-ground', difficultyId: 'standard' });
  state.towers.push(/** @type {any} */ ({
    seq: 1, defId: 'gunner', level: 0, xFixed: 100 * 1024, yFixed: 80 * 1024,
    targeting: 'first', cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0,
    reloadTicks: 0, abilityCooldownTicks: 0, abilityActiveTicks: 0,
    totalSpent: 100, hitsLanded: 0, secondaryCooldownTicks: 0,
  }));
  const lead = placeEnemy(state, 'grunt', 130 * 1024, { hp: 100000, maxHp: 100000 });
  const bystander = placeEnemy(state, 'grunt', 101 * 1024, { hp: 100000, maxHp: 100000 });

  fireTowers(state, gameData);
  assert.equal(100000 - lead.hp, 100, 'the enemy that was aimed at took nothing');
  assert.equal(100000 - bystander.hp, 0, 'a cap of one damaged a bystander as well');
});

test('the shipped rows carry the caps their pages state', () => {
  // Read off disk rather than from the scraper, because the question is what the game
  // actually ships with.
  const paintballer = JSON.parse(
    readFileSync(new URL('../../src/data/towers/paintballer.json', import.meta.url), 'utf8'));
  assert.deepEqual(
    paintballer.levels.map((l) => l.maxSplashTargets), [8, 8, 8, 8, 8, 8],
    'Paintballer lists Max Hits 8 at every level',
  );
  const ranger = JSON.parse(
    readFileSync(new URL('../../src/data/towers/ranger.json', import.meta.url), 'utf8'));
  assert.equal(ranger.levels[4].maxSplashTargets, 3, 'Ranger lists Max Hits 3 at level 4');
  assert.equal(ranger.levels[3].maxSplashTargets, undefined, 'Ranger lists no Max Hits below level 4');
});
