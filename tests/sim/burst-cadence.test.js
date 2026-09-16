/**
 * How long a burst tower's whole cycle takes.
 *
 * Nothing checked this, which is how the simulation spent its whole life firing every
 * burst tower one shot-interval too fast. Three shots 0.175 seconds apart followed by a
 * 0.5 second reload is 1.025 seconds in the source and was 0.85 here, so Soldier did
 * 3.53 damage per second against a published 2.93, and the same twenty percent rode on
 * every burst tower in the game. It surfaced only when the pages' own damage-per-second
 * column was scraped and compared against, because 3.53 is a perfectly believable number
 * to see in a data file.
 *
 * The rule, stated once: every shot is followed by its own interval, and the reload is
 * added after the last one. A burst of N at interval I with reload R takes N*I + R.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMatchState } from '../../src/sim/state/match-state.js';
import { fireTowers } from '../../src/sim/systems/firing.js';
import { makeGameData, placeEnemy } from '../fixtures/game-data.js';
import { TICK_RATE } from '../../src/sim/core/constants.js';

/**
 * Run the firing system for `ticks` and report the tick each shot landed on.
 * @param {{ burstCount?: number, reloadSeconds?: number, fireRate: number }} shape
 * @param {number} ticks
 * @returns {number[]}
 */
function shotTicks(shape, ticks) {
  const gameData = makeGameData();
  const def = gameData.towers.get('gunner');
  const level = def.levels[0];
  level.fireRate = shape.fireRate;
  if (shape.burstCount) level.burstCount = shape.burstCount;
  if (shape.reloadSeconds != null) level.reloadSeconds = shape.reloadSeconds;
  // Hitscan and enormous range, so nothing about travel time or target selection can
  // change the cadence being measured.
  level.range = 1000;
  level.damage = 1;

  const state = createMatchState(gameData, { seed: 1, mapId: 'proving-ground', difficultyId: 'standard' });
  state.towers.push(/** @type {any} */ ({
    seq: 1, defId: 'gunner', level: 0, xFixed: 100 * 1024, yFixed: 80 * 1024,
    targeting: 'first', cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0,
    reloadTicks: 0, abilityCooldownTicks: 0, totalSpent: 100,
  }));
  // One enemy with enough health to outlast the measurement, so the tower never runs
  // out of things to shoot at and go quiet for a reason unrelated to its cadence.
  const enemy = placeEnemy(state, 'grunt', 100 * 1024, { hp: 1e9, maxHp: 1e9 });

  const fired = [];
  let lastHp = enemy.hp;
  for (let tick = 0; tick < ticks; tick += 1) {
    fireTowers(state, gameData);
    if (enemy.hp < lastHp) {
      fired.push(tick);
      lastHp = enemy.hp;
    }
  }
  return fired;
}

test('a burst is followed by the reload PLUS the last shot own interval', () => {
  // Three shots, a tenth of a second apart, then half a second of reload.
  const fireRate = 10;
  const reloadSeconds = 0.5;
  const ticks = shotTicks({ burstCount: 3, reloadSeconds, fireRate }, 90);

  assert.ok(ticks.length >= 6, 'expected at least two full bursts, got ' + ticks.length);

  // Inside a burst: one interval apart.
  const gapTicks = Math.round(TICK_RATE / fireRate);
  assert.equal(ticks[1] - ticks[0], gapTicks, 'shots inside a burst are one interval apart');
  assert.equal(ticks[2] - ticks[1], gapTicks, 'shots inside a burst are one interval apart');

  // Across the burst boundary: the reload AND one more interval.
  const expectedCycle = 3 * gapTicks + Math.round(reloadSeconds * TICK_RATE);
  assert.equal(
    ticks[3] - ticks[0], expectedCycle,
    'a burst of 3 at ' + gapTicks + ' ticks with a ' + reloadSeconds + 's reload should cycle every ' +
      expectedCycle + ' ticks',
  );
  assert.equal(ticks[4] - ticks[1], expectedCycle, 'and the cycle repeats at the same length');
});

test('a tower with no burst fires at its plain interval', () => {
  const ticks = shotTicks({ fireRate: 5 }, 60);
  const gapTicks = Math.round(TICK_RATE / 5);
  assert.ok(ticks.length >= 3);
  assert.equal(ticks[1] - ticks[0], gapTicks);
  assert.equal(ticks[2] - ticks[1], gapTicks);
});

test('the shipped Soldier takes as long over a burst as its page says', () => {
  // The concrete case the correction came from, in the simulation rather than on paper.
  // Level 0: 3 shots at 0.175 seconds, half a second of reload, 1.025 seconds a cycle.
  const ticks = shotTicks({ burstCount: 3, reloadSeconds: 0.5, fireRate: 1 / 0.175 }, 120);
  assert.ok(ticks.length >= 4);
  const cycleTicks = ticks[3] - ticks[0];
  const cycleSeconds = cycleTicks / TICK_RATE;
  assert.ok(
    Math.abs(cycleSeconds - 1.025) < 1 / TICK_RATE,
    'the cycle should be about 1.025 seconds, and it is ' + cycleSeconds.toFixed(3),
  );
});
