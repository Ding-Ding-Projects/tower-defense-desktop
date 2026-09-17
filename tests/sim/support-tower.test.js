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
