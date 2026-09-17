/**
 * A tower whose whole contribution is a buff, and a tower whose weapon only exists
 * while its ability runs.
 *
 * Both of these are Commander, and both were engine gaps rather than data gaps. The
 * ability system's `buffPulse` branch was empty, with a comment saying the buff was
 * "handled as an aura on the data row" -- but the aura on a data row is the PASSIVE
 * one, always on, so pressing the button spent a thirty second cooldown and did
 * nothing at all. Nothing was red, because no shipped tower had an ability: the branch
 * had never once been reached in a real match.
 *
 * The firing gate is the other half. Commander's levels 0 and 1 list no damage and no
 * firerate, because the tower is purely an aura; from level 2 its gun exists only for
 * the ten seconds Call to Arms is up. Without a gate it shoots continuously at the
 * ability's damage, which is a straightforwardly better tower than the one the source
 * describes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMatch, submitCommand, runTicks } from '../../src/sim/core/match.js';
import { TICK_RATE } from '../../src/sim/core/constants.js';
import { effectiveStats } from '../../src/sim/systems/buffs.js';
import { makeGameData, placeEnemy } from '../fixtures/game-data.js';
import { loadGameData } from '../../src/data/loader.js';

const shippedGameData = loadGameData();

const ABILITY_SECONDS = 4;
const COOLDOWN_SECONDS = 20;

/**
 * Game data carrying a support tower shaped like Commander: a standing firerate aura,
 * an ability that adds a bigger one for a while, and a gun that only works during it.
 */
function dataWithCommander() {
  const gameData = makeGameData();
  const gunner = gameData.towers.get('gunner');
  gameData.towers.set('marshal', {
    id: 'marshal', displayName: 'Marshal', baseCost: 100, allowedTerrain: ['ground'],
    placementPool: 'default', maxCount: null, sellRefundFraction: 1 / 3, footprintRadius: 1,
    targetingModes: ['first'],
    levels: [{
      level: 0, cost: 0, damage: 50, fireRate: 2, range: 30,
      detectsHidden: false, hitsAir: false,
      firesOnlyDuringAbility: true,
      aura: { stat: 'fireRate', mode: 'multiplicative', radius: 30, value: 1.1 },
      ability: {
        id: 'call-to-arms', displayName: 'Call to Arms',
        cooldownSeconds: COOLDOWN_SECONDS, effect: 'buffPulse', magnitude: 0,
        durationSeconds: ABILITY_SECONDS,
        aura: { stat: 'fireRate', mode: 'multiplicative', radius: 30, value: 1.5 },
      },
      source: gunner.levels[0].source,
    }],
    source: gunner.source,
  });
  return gameData;
}

function matchWithBoth() {
  const match = createMatch({
    gameData: dataWithCommander(), seed: 5, mapId: 'proving-ground', difficultyId: 'standard',
  });
  match.state.cash = 100000;
  submitCommand(match, 'PlaceTower', { towerId: 'gunner', x: 60, y: 65 });
  submitCommand(match, 'PlaceTower', { towerId: 'marshal', x: 62, y: 65 });
  // Commands run at a tick boundary a couple of ticks out, and `submitCommand` returns
  // the queued command rather than a verdict, so the effect is what gets checked.
  runTicks(match, 3);
  const gunner = match.state.towers.find((t) => t.defId === 'gunner');
  const marshal = match.state.towers.find((t) => t.defId === 'marshal');
  assert.ok(gunner && marshal, 'both towers must be placed for any of this to mean anything');
  return { match, gunner, marshal };
}

const rateOn = (match, tower) => effectiveStats(match.state, match.gameData, tower).fireRate;

test('a passive aura reaches a neighbour without anyone pressing anything', () => {
  const { match, gunner } = matchWithBoth();
  const base = match.gameData.towers.get('gunner').levels[0].fireRate;
  assert.ok(
    rateOn(match, gunner) > base,
    'the standing aura did not reach the tower beside it: ' + rateOn(match, gunner) + ' vs ' + base,
  );
});

test('using the ability raises the buff further, and it expires on its own', () => {
  const { match, gunner, marshal } = matchWithBoth();
  const passive = rateOn(match, gunner);

  submitCommand(match, 'UseAbility', { seq: marshal.seq });
  runTicks(match, 3);
  const during = rateOn(match, gunner);
  assert.ok(
    during > passive,
    'pressing the ability changed nothing: ' + during + ' with it, ' + passive + ' without. ' +
      'This is the empty buffPulse branch again.',
  );

  // Past the stated duration, and well short of the cooldown.
  runTicks(match, TICK_RATE * ABILITY_SECONDS);
  assert.equal(
    rateOn(match, gunner), passive,
    'the ability buff outlived its own durationSeconds',
  );
});

test('the ability buff stacks on top of the passive one rather than replacing it', () => {
  // Two multiplicative auras from one tower, which is what a tower with both a standing
  // buff and a temporary one is. Collecting only the stronger would quietly make the
  // ability worth less than the page says.
  const { match, gunner, marshal } = matchWithBoth();
  const base = match.gameData.towers.get('gunner').levels[0].fireRate;
  submitCommand(match, 'UseAbility', { seq: marshal.seq });
  runTicks(match, 3);
  assert.ok(
    Math.abs(rateOn(match, gunner) - base * 1.1 * 1.5) < 1e-9,
    'expected both auras to apply, got ' + rateOn(match, gunner) + ' from a base of ' + base,
  );
});

test('a tower whose weapon only exists during its ability does not shoot otherwise', () => {
  const { match, marshal } = matchWithBoth();
  // Removing the gunner so anything that takes damage can only have been shot by the
  // marshal.
  match.state.towers = match.state.towers.filter((t) => t.seq === marshal.seq);

  // A fresh target for each phase, and each one measured over the same short window.
  // Reusing one enemy across all three looked simpler and was wrong: a grunt walks ten
  // units a second, so it had left the tower's range before the ability was ever
  // pressed, and the check then read a tower that could not reach anything as a tower
  // that had been correctly stopped from firing.
  const shotOver = (ticks) => {
    placeEnemy(match.state, 'grunt', 62 * 1024, { hp: 10000, maxHp: 10000 });
    const enemy = match.state.enemies[match.state.enemies.length - 1];
    runTicks(match, ticks);
    const dealt = 10000 - enemy.hp;
    match.state.enemies = match.state.enemies.filter((e) => e !== enemy);
    return dealt;
  };

  assert.equal(
    shotOver(TICK_RATE), 0,
    'a tower with firesOnlyDuringAbility shot without its ability',
  );

  submitCommand(match, 'UseAbility', { seq: marshal.seq });
  runTicks(match, 3);
  assert.ok(
    marshal.abilityActiveTicks > 0,
    'the ability did not start, so the rest of this would prove nothing',
  );
  assert.ok(
    shotOver(TICK_RATE) > 0,
    'the ability came up and the tower still did not shoot, so the gate never opens',
  );

  // And it closes again, well before the ability could come off cooldown.
  runTicks(match, TICK_RATE * ABILITY_SECONDS);
  assert.equal(marshal.abilityActiveTicks, 0, 'the ability outlived its own duration');
  assert.equal(shotOver(TICK_RATE), 0, 'the tower kept shooting after its ability ended');
});

test('selling the source takes its buff away immediately', () => {
  // The aura system's whole design claim: effective stats are re-derived every tick
  // from the towers that exist, so nothing has to be unwound.
  const { match, gunner, marshal } = matchWithBoth();
  const buffed = rateOn(match, gunner);
  submitCommand(match, 'SellTower', { seq: marshal.seq });
  runTicks(match, 3);
  assert.ok(
    match.state.towers.every((t) => t.seq !== marshal.seq),
    'the sell command did not remove the tower, so this proves nothing',
  );
  assert.ok(rateOn(match, gunner) < buffed, 'the buff outlived the tower projecting it');
});

test('an ability that catches "up to" a number of enemies stops at that number', () => {
  // Freezer's Frost Grenade is the shipped user: its page says it "freezes up to five
  // enemies", and without a cap a pulse catches everything inside its radius, which on
  // a packed lane is a very different ability.
  const gameData = makeGameData();
  const gunner = gameData.towers.get('gunner');
  gameData.towers.set('bomber', {
    id: 'bomber', displayName: 'Bomber', baseCost: 100, allowedTerrain: ['ground'],
    placementPool: 'default', maxCount: null, sellRefundFraction: 1 / 3, footprintRadius: 1,
    targetingModes: ['first'],
    levels: [{
      level: 0, cost: 0, damage: 0, fireRate: 0, range: 0,
      detectsHidden: false, hitsAir: false,
      ability: {
        id: 'grenade', displayName: 'Grenade', cooldownSeconds: 15, effect: 'stunPulse',
        magnitude: 0, statusId: 'slow', durationSeconds: 2, radius: 20, maxTargets: 5,
      },
      source: gunner.levels[0].source,
    }],
    source: gunner.source,
  });

  // An ability naming a status the data does not carry fails in silence: the lookup
  // returns nothing and the pulse returns having spent its cooldown. That is a
  // validation failure on real data, and here it would just make this check vacuous.
  assert.ok(gameData.statuses.has('slow'), 'the fixture lost the status this check uses');

  const match = createMatch({
    gameData, seed: 7, mapId: 'proving-ground', difficultyId: 'standard',
  });
  match.state.cash = 100000;
  // The fixture map's buildable band sits about fifteen units off the lane, so the
  // ability's radius is what puts the crowd inside the blast, not the placement.
  submitCommand(match, 'PlaceTower', { towerId: 'bomber', x: 62, y: 65 });
  runTicks(match, 3);
  const bomber = match.state.towers.find((t) => t.defId === 'bomber');
  assert.ok(bomber, 'the tower was not placed, so this proves nothing');

  for (let i = 0; i < 12; i += 1) {
    placeEnemy(match.state, 'grunt', 62 * 1024, { hp: 100000, maxHp: 100000 });
  }
  const crowd = match.state.enemies.slice(-12);
  const radiusFixed = 20 * 1024;
  const inBlast = crowd.filter((e) =>
    (e.xFixed - bomber.xFixed) ** 2 + (e.yFixed - bomber.yFixed) ** 2 <= radiusFixed * radiusFixed);
  assert.ok(
    inBlast.length > 5,
    'only ' + inBlast.length + ' enemies are inside the blast, so a cap of five cannot bind',
  );

  submitCommand(match, 'UseAbility', { seq: bomber.seq });
  runTicks(match, 2);
  const frozen = crowd.filter((e) => e.statuses.some((s) => s.id === 'slow'));
  assert.equal(
    frozen.length, 5,
    'the cap is five and it froze ' + frozen.length + ' of ' + inBlast.length + ' in range',
  );
});

test('the capped five are the nearest five, and the same five every run', () => {
  // A cap has to choose, and a choice that is not deterministic makes the replay proof
  // worthless: two runs would freeze different enemies and the hash would diverge.
  const pick = () => {
    const gameData = makeGameData();
    const gunner = gameData.towers.get('gunner');
    gameData.towers.set('bomber', {
      id: 'bomber', displayName: 'Bomber', baseCost: 100, allowedTerrain: ['ground'],
      placementPool: 'default', maxCount: null, sellRefundFraction: 1 / 3, footprintRadius: 1,
      targetingModes: ['first'],
      levels: [{
        level: 0, cost: 0, damage: 0, fireRate: 0, range: 0,
        detectsHidden: false, hitsAir: false,
        ability: {
          id: 'grenade', displayName: 'Grenade', cooldownSeconds: 15, effect: 'stunPulse',
          magnitude: 0, statusId: 'slow', durationSeconds: 2, radius: 40, maxTargets: 5,
        },
        source: gunner.levels[0].source,
      }],
      source: gunner.source,
    });
    const match = createMatch({
      gameData, seed: 7, mapId: 'proving-ground', difficultyId: 'standard',
    });
    match.state.cash = 100000;
    submitCommand(match, 'PlaceTower', { towerId: 'bomber', x: 62, y: 65 });
    runTicks(match, 3);
    const bomber = match.state.towers.find((t) => t.defId === 'bomber');
    // Spread down the lane, so "nearest" is a real ordering rather than a tie.
    for (let i = 0; i < 10; i += 1) {
      placeEnemy(match.state, 'grunt', (50 + i * 3) * 1024, { hp: 100000, maxHp: 100000 });
    }
    // Measured before the pulse resolves. Everything here walks the same lane at the
    // same speed, so the ordering by distance does not change over the two ticks in
    // between; only the absolute distances do.
    const expected = [...match.state.enemies]
      .map((e) => ({
        seq: e.seq,
        d: (e.xFixed - bomber.xFixed) ** 2 + (e.yFixed - bomber.yFixed) ** 2,
      }))
      .sort((a, b) => (a.d === b.d ? a.seq - b.seq : a.d - b.d))
      .slice(0, 5)
      .map((e) => e.seq)
      .sort((a, b) => a - b);

    submitCommand(match, 'UseAbility', { seq: bomber.seq });
    runTicks(match, 2);
    const caught = match.state.enemies
      .filter((e) => e.statuses.some((s) => s.id === 'slow'))
      .map((e) => e.seq)
      .sort((a, b) => a - b);
    return { caught, expected };
  };

  const first = pick();
  assert.equal(first.caught.length, 5, 'expected five caught, got ' + first.caught.length);
  assert.deepEqual(
    first.caught, first.expected,
    'the cap did not take the nearest five: caught ' + first.caught.join(',') +
      ', nearest were ' + first.expected.join(','),
  );
  assert.deepEqual(pick().caught, first.caught, 'two identical runs caught different enemies');
});

test('a wave-start aura comes up when the wave does, and times out inside it', () => {
  // Ranger, and the shipped roster's only aura. Its page: "At Level 2, it gains the
  // ability to give towers a 10% Range Buff within its inner radius at the start of
  // every wave for 20 seconds." Neither standing nor player-pressed, so it needed its
  // own clock; approximating it with a permanent aura would have been an interpretation
  // rather than a reading, and a generous one, since twenty seconds is a fraction of a
  // wave.
  const gameData = makeGameData();
  const gunner = gameData.towers.get('gunner');
  const BUFF_SECONDS = 3;
  gameData.towers.set('herald', {
    id: 'herald', displayName: 'Herald', baseCost: 100, allowedTerrain: ['ground'],
    placementPool: 'default', maxCount: null, sellRefundFraction: 1 / 3, footprintRadius: 1,
    targetingModes: ['first'],
    levels: [{
      level: 0, cost: 0, damage: 0, fireRate: 0, range: 0,
      detectsHidden: false, hitsAir: false,
      waveStartAura: { stat: 'range', mode: 'multiplicative', radius: 30, value: 1.1 },
      waveStartAuraSeconds: BUFF_SECONDS,
      source: gunner.levels[0].source,
    }],
    source: gunner.source,
  });

  const match = createMatch({
    gameData, seed: 5, mapId: 'proving-ground', difficultyId: 'standard',
  });
  match.state.cash = 100000;
  submitCommand(match, 'PlaceTower', { towerId: 'gunner', x: 60, y: 65 });
  submitCommand(match, 'PlaceTower', { towerId: 'herald', x: 62, y: 65 });
  runTicks(match, 3);
  const buffed = match.state.towers.find((t) => t.defId === 'gunner');
  const herald = match.state.towers.find((t) => t.defId === 'herald');
  assert.ok(buffed && herald, 'both towers must be placed for any of this to mean anything');

  const rangeOf = () => effectiveStats(match.state, match.gameData, buffed).range;
  const base = gameData.towers.get('gunner').levels[0].range;
  assert.equal(rangeOf(), base, 'the aura is up before a wave has started');

  // Run until the director actually starts a wave, rather than assuming a tick count.
  let started = false;
  for (let i = 0; i < TICK_RATE * 120 && !started; i += 1) {
    runTicks(match, 1);
    started = herald.waveAuraTicks > 0;
  }
  assert.ok(started, 'no wave ever began, so this proves nothing');
  assert.ok(rangeOf() > base, 'the wave began and the aura did not: ' + rangeOf() + ' vs ' + base);

  runTicks(match, TICK_RATE * BUFF_SECONDS);
  assert.equal(herald.waveAuraTicks, 0, 'the aura outlived its own stated duration');
  assert.equal(rangeOf(), base, 'the aura expired and the range stayed buffed');
});

test('the shipped Ranger carries the wave-start aura its page states', () => {
  const ranger = shippedGameData.towers.get('ranger');
  assert.ok(ranger, 'ranger is not in the shipped roster');
  const from = ranger.levels.findIndex((l) => l.waveStartAura);
  assert.equal(from, 2, 'the page puts the Range Buff at Level 2, the row puts it at ' + from);
  for (const level of ranger.levels.slice(2)) {
    assert.equal(level.waveStartAura.stat, 'range');
    assert.equal(level.waveStartAura.radius, 12, 'the page lists a Buff Range of 12');
    // 10% more range, which is 1.1 times it. Written as a multiplier because that is
    // what the aura system applies; as an additive value it would mean ten map units.
    assert.ok(
      Math.abs(level.waveStartAura.value - 1.1) < 1e-9,
      'the page lists a 10% Range Buff, the row says ' + level.waveStartAura.value,
    );
    assert.equal(level.waveStartAuraSeconds, 20, 'the page lists a Buff Time of 20');
  }
});
