import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMatch, submitCommand, tick, runTicks, TICK_RATE } from '../../src/sim/core/match.js';
import { snapshot } from '../../src/sim/state/snapshot.js';
import { makeGameData } from '../fixtures/game-data.js';

const newMatch = (difficultyId = 'standard', seed = 42) =>
  createMatch({ gameData: makeGameData(), seed, mapId: 'proving-ground', difficultyId });

test('a match begins in an intermission with the difficulty starting cash', () => {
  const match = newMatch();
  assert.equal(match.state.phase, 'intermission');
  assert.equal(match.state.cash, 500);
  assert.equal(match.state.lives, 20);
  assert.equal(match.state.waveIndex, 0);
});

test('a difficulty override replaces the map base lives', () => {
  const match = newMatch('brutal');
  assert.equal(match.state.lives, 5, 'brutal overrides 20 down to 5');
  assert.equal(match.state.cash, 300);
});

test('a command takes effect on a later tick, not the instant it is submitted', () => {
  const match = newMatch();
  submitCommand(match, 'PlaceTower', { towerId: 'gunner', x: 50, y: 80 });
  assert.equal(match.state.towers.length, 0, 'nothing has happened yet');
  tick(match);
  assert.equal(match.state.towers.length, 0, 'still inside the input delay');
  tick(match);
  assert.equal(match.state.towers.length, 1, 'and now it lands');
  assert.equal(match.state.cash, 400);
});

test('an illegal command is refused with a reason and changes nothing', () => {
  const match = newMatch();
  const before = match.state.cash;
  submitCommand(match, 'PlaceTower', { towerId: 'gunner', x: 100, y: 50 });
  tick(match);
  const applied = tick(match);
  const refusal = applied.find((a) => !a.result.accepted);
  assert.ok(refusal, 'the command should have been refused');
  assert.match(/** @type {any} */ (refusal.result).reason, /cannot build here/);
  assert.equal(match.state.cash, before, 'and no money moved');
  assert.equal(match.state.towers.length, 0);
});

test('an unknown command is refused rather than throwing', () => {
  const match = newMatch();
  submitCommand(match, 'SummonDragon', {});
  runTicks(match, 3);
  assert.equal(match.state.towers.length, 0);
});

test('the wave starts, enemies spawn, and they walk', () => {
  const match = newMatch();
  runTicks(match, TICK_RATE * 11);
  assert.equal(match.state.phase, 'wave');
  assert.equal(match.state.waveIndex, 1);
  assert.ok(match.state.enemies.length > 0, 'something should be on the map');

  const before = match.state.enemies[0].distFixed;
  runTicks(match, TICK_RATE);
  const after = match.state.enemies.find((e) => e.seq === 1);
  if (after) assert.ok(after.distFixed > before, 'and it should have moved');
});

test('an undefended match leaks every single enemy', () => {
  const match = newMatch();
  runTicks(match, TICK_RATE * 200);
  // The fixture has five enemies against twenty lives, so surviving is the honest
  // outcome. What is being checked is that every one of them got through.
  assert.equal(match.state.leakCount, 5, 'all five reached the end');
  assert.equal(match.state.lives, 15, 'one life each');
  assert.equal(match.state.killCount, 0, 'nothing was there to kill them');
});

test('running out of lives ends the match as a loss', () => {
  const match = newMatch();
  match.state.lives = 2;
  runTicks(match, TICK_RATE * 200);
  assert.equal(match.state.phase, 'lost');
  assert.equal(match.state.lives, 0);
  assert.ok(match.state.leakCount >= 2, 'and leaks are what did it');
});

test('defending genuinely reduces the leaks, and the match is won', () => {
  const match = newMatch();
  // Four basic gunners against 100 health enemies is deliberately marginal: a wall
  // that stopped everything would prove nothing about whether the numbers are wired
  // through. Some get past, and far fewer than with no defence at all.
  for (const x of [20, 60, 120, 170]) {
    submitCommand(match, 'PlaceTower', { towerId: 'gunner', x, y: 65 });
  }
  runTicks(match, TICK_RATE * 200);
  assert.equal(match.state.phase, 'won');
  assert.ok(match.state.killCount > 0, 'towers actually killed things');
  assert.ok(match.state.leakCount < 5, 'and fewer got through than with no towers');
  assert.ok(match.state.lives > 15, 'so more lives survived than an undefended run');
  assert.ok(match.state.cash > 100, 'kill rewards and wave bonuses were paid');
});

test('an economy tower pays on the wave boundary, not continuously', () => {
  const match = newMatch();
  for (const x of [20, 60, 120, 170]) {
    submitCommand(match, 'PlaceTower', { towerId: 'gunner', x, y: 65 });
  }
  submitCommand(match, 'PlaceTower', { towerId: 'bank', x: 90, y: 90 });
  runTicks(match, TICK_RATE * 11);
  const duringWave = match.state.cash;
  runTicks(match, 2);
  assert.equal(match.state.cash, duringWave, 'a bank pays nothing mid-wave');

  runTicks(match, TICK_RATE * 200);
  assert.equal(match.state.phase, 'won');
});

test('selling refunds a percentage of everything spent, including upgrades', () => {
  const match = newMatch();
  submitCommand(match, 'PlaceTower', { towerId: 'gunner', x: 50, y: 80 });
  runTicks(match, 3);
  const seq = match.state.towers[0].seq;

  submitCommand(match, 'UpgradeTower', { seq });
  runTicks(match, 3);
  assert.equal(match.state.towers[0].level, 1);
  assert.equal(match.state.towers[0].totalSpent, 250, '100 placed plus 150 upgraded');

  const before = match.state.cash;
  submitCommand(match, 'SellTower', { seq });
  runTicks(match, 3);
  assert.equal(match.state.towers.length, 0);
  assert.equal(match.state.cash, before + 175, '70 percent of 250');
});

test('targeting can only be set to a mode the tower actually has', () => {
  const match = newMatch();
  submitCommand(match, 'PlaceTower', { towerId: 'spotter', x: 50, y: 20 });
  runTicks(match, 3);
  const seq = match.state.towers[0].seq;

  submitCommand(match, 'SetTargeting', { seq, mode: 'closest' });
  runTicks(match, 3);
  assert.equal(match.state.towers[0].targeting, 'closest');

  submitCommand(match, 'SetTargeting', { seq, mode: 'strongest' });
  runTicks(match, 3);
  assert.equal(match.state.towers[0].targeting, 'closest', 'a spotter has no strongest mode');
});

test('skipping an intermission actually skips it', () => {
  const match = newMatch();
  runTicks(match, 2);
  assert.equal(match.state.phase, 'intermission');
  submitCommand(match, 'SkipIntermission', {});
  runTicks(match, 4);
  assert.equal(match.state.phase, 'wave', 'the wave should have started early');
});

test('the snapshot renames phases for the interface and hides the internals', () => {
  const match = newMatch();
  const view = snapshot(match.state);
  assert.equal(view.phase, 'intermission');
  assert.equal(view.cash, 500);
  assert.ok(!('rng' in view), 'the generator never reaches the interface');
  assert.ok(!('spawnQueue' in view), 'nor does the spawn schedule');

  runTicks(match, TICK_RATE * 11);
  assert.equal(snapshot(match.state).phase, 'active', 'wave becomes active for the interface');
});

test('the snapshot gives every entity a stable identity to interpolate against', () => {
  const match = newMatch();
  runTicks(match, TICK_RATE * 11);
  const first = snapshot(match.state);
  runTicks(match, 2);
  const second = snapshot(match.state);

  assert.ok(first.enemies.length > 0);
  const shared = first.enemies.filter((e) => second.enemies.some((o) => o.id === e.id));
  assert.ok(shared.length > 0, 'the same enemy must be recognisable across two frames');
  for (const enemy of first.enemies) assert.equal(typeof enemy.id, 'number');
});
