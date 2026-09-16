import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMatchState } from '../../src/sim/state/match-state.js';
import { selectTarget, canTarget, candidates } from '../../src/sim/systems/targeting.js';
import { applyStatus } from '../../src/sim/systems/statuses.js';
import { makeGameData, placeEnemy } from '../fixtures/game-data.js';

const setup = () => {
  const gameData = makeGameData();
  const state = createMatchState(gameData, {
    seed: 1, mapId: 'proving-ground', difficultyId: 'standard',
  });
  return { gameData, state };
};

test('first picks the enemy furthest along the path', () => {
  const { gameData, state } = setup();
  const back = placeEnemy(state, 'grunt', 1000);
  const front = placeEnemy(state, 'grunt', 9000);
  const chosen = selectTarget(state.enemies, 'first', gameData, /** @type {any} */ ({ xFixed: 0, yFixed: 0 }));
  assert.equal(chosen?.seq, front.seq);
  assert.notEqual(chosen?.seq, back.seq);
});

test('last picks the enemy least far along the path', () => {
  const { gameData, state } = setup();
  const back = placeEnemy(state, 'grunt', 1000);
  placeEnemy(state, 'grunt', 9000);
  const chosen = selectTarget(state.enemies, 'last', gameData, /** @type {any} */ ({ xFixed: 0, yFixed: 0 }));
  assert.equal(chosen?.seq, back.seq);
});

test('strongest and weakest read current health plus shield, not starting health', () => {
  const { gameData, state } = setup();
  const hurt = placeEnemy(state, 'grunt', 1000, { hp: 20, maxHp: 100 });
  const shielded = placeEnemy(state, 'grunt', 2000, { hp: 20, maxHp: 100, shield: 90 });
  const tower = /** @type {any} */ ({ xFixed: 0, yFixed: 0 });

  assert.equal(selectTarget(state.enemies, 'strongest', gameData, tower)?.seq, shielded.seq);
  assert.equal(selectTarget(state.enemies, 'weakest', gameData, tower)?.seq, hurt.seq);
});

test('every mode breaks an exact tie on spawn sequence, not on array order', () => {
  const { gameData, state } = setup();
  // Three identical enemies at an identical distance: the only thing separating them
  // is the order they spawned in. If a comparator returns 0 here, the answer becomes
  // whatever the array happened to hold, and that is a determinism failure.
  const a = placeEnemy(state, 'grunt', 5000);
  const b = placeEnemy(state, 'grunt', 5000);
  const c = placeEnemy(state, 'grunt', 5000);
  const tower = /** @type {any} */ ({ xFixed: 5000, yFixed: 50 * 1024 });

  for (const mode of ['first', 'last', 'closest', 'strongest', 'weakest']) {
    const forwards = selectTarget([a, b, c], /** @type {any} */ (mode), gameData, tower);
    const backwards = selectTarget([c, b, a], /** @type {any} */ (mode), gameData, tower);
    const shuffled = selectTarget([b, c, a], /** @type {any} */ (mode), gameData, tower);
    assert.equal(forwards?.seq, a.seq, mode + ' should pick the lowest sequence on a tie');
    assert.equal(backwards?.seq, a.seq, mode + ' must not depend on array order');
    assert.equal(shuffled?.seq, a.seq, mode + ' must not depend on array order');
  }
});

test('a hidden enemy is invisible to a tower without detection', () => {
  const { gameData } = setup();
  const ghost = /** @type {any} */ ({ seq: 1, statuses: [] });
  const ghostDef = gameData.enemies.get('ghost');
  const plainLevel = gameData.towers.get('gunner').levels[0];
  const spotterLevel = gameData.towers.get('spotter').levels[0];

  assert.equal(canTarget(ghost, ghostDef, plainLevel, gameData.statuses), false);
  assert.equal(canTarget(ghost, ghostDef, spotterLevel, gameData.statuses), true);
});

test('being exposed makes a hidden enemy targetable by anything', () => {
  const { gameData } = setup();
  const ghost = /** @type {any} */ ({ seq: 1, statuses: [] });
  const ghostDef = gameData.enemies.get('ghost');
  const plainLevel = gameData.towers.get('gunner').levels[0];

  assert.equal(canTarget(ghost, ghostDef, plainLevel, gameData.statuses), false);
  applyStatus(ghost, ghostDef, gameData.statuses.get('exposed'), 30);
  assert.equal(canTarget(ghost, ghostDef, plainLevel, gameData.statuses), true);
});

test('a flying enemy is untouchable without anti-air', () => {
  const { gameData } = setup();
  const flier = /** @type {any} */ ({ seq: 1, statuses: [] });
  const flierDef = gameData.enemies.get('flier');

  assert.equal(canTarget(flier, flierDef, gameData.towers.get('gunner').levels[0], gameData.statuses), false);
  assert.equal(canTarget(flier, flierDef, gameData.towers.get('spotter').levels[0], gameData.statuses), true);
});

test('candidates respects range and excludes the dead', () => {
  const { gameData, state } = setup();
  const near = placeEnemy(state, 'grunt', 0, { xFixed: 0, yFixed: 0 });
  placeEnemy(state, 'grunt', 0, { xFixed: 100 * 1024, yFixed: 0 });
  const dead = placeEnemy(state, 'grunt', 0, { xFixed: 0, yFixed: 0, hp: 0 });
  const tower = /** @type {any} */ ({ seq: 99, xFixed: 0, yFixed: 0 });
  const level = gameData.towers.get('gunner').levels[0];

  const found = candidates(state, gameData, tower, level, 20);
  assert.equal(found.length, 1);
  assert.equal(found[0].seq, near.seq);
  assert.ok(!found.some((e) => e.seq === dead.seq));
});
