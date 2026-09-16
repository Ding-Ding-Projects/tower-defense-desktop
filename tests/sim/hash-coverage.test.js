/**
 * Every piece of a tower's changing state reaches the determinism hash.
 *
 * The hash is what the replay proof compares, so a field left out of it is a field two
 * runs can disagree about while the proof reports them identical. That is the worst
 * possible shape for a co-operative simulation: not a divergence, but a divergence the
 * detector cannot see.
 *
 * `hitsLanded` was exactly that. It was added to drive which swings land a critical
 * hit, which means it decides how much damage a tower deals, and it was not in the
 * hash.
 *
 * Checked against a hand-written list rather than by reading the hash's own source,
 * because a check that reads the thing it is checking agrees with itself by
 * construction. Adding a field to the state and forgetting the hash must turn this red,
 * and the only way it can is if something independent knows what the state contains.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMatchState } from '../../src/sim/state/match-state.js';
import { serializeState, hashState } from '../../src/sim/state/snapshot.js';
import { makeGameData } from '../fixtures/game-data.js';

/**
 * Every field on a placed tower that changes during a match, and so must be hashed.
 *
 * `defId` and `seq` are here too: they never change after placement, but two runs that
 * placed different towers must not hash the same.
 */
const TOWER_STATE_FIELDS = [
  'seq', 'defId', 'level', 'xFixed', 'yFixed', 'targeting',
  'cooldownTicks', 'spinUpTicks', 'burstLeft', 'reloadTicks',
  'abilityCooldownTicks', 'totalSpent', 'hitsLanded',
];

function stateWithTower() {
  const gameData = makeGameData();
  const state = createMatchState(gameData, { seed: 1, mapId: 'proving-ground', difficultyId: 'standard' });
  state.towers.push(/** @type {any} */ ({
    seq: 1, defId: 'gunner', level: 0, xFixed: 100 * 1024, yFixed: 80 * 1024,
    targeting: 'first', cooldownTicks: 2, spinUpTicks: 1, burstLeft: 1,
    reloadTicks: 3, abilityCooldownTicks: 4, totalSpent: 100, hitsLanded: 5,
  }));
  return state;
}

test('changing any part of a tower changes the hash', () => {
  for (const field of TOWER_STATE_FIELDS) {
    const before = hashState(stateWithTower());
    const mutated = stateWithTower();
    const tower = /** @type {any} */ (mutated.towers[0]);
    // Move the field to something else of the same shape.
    tower[field] = typeof tower[field] === 'number' ? tower[field] + 7 : tower[field] + '-changed';
    const after = hashState(mutated);
    assert.notEqual(
      after, before,
      'changing a tower\'s ' + field + ' does not change the hash, so two replays can ' +
        'disagree about it and the determinism proof will call them identical',
    );
  }
});

test('the list is checking fields that actually exist on a tower', () => {
  // A renamed field would otherwise leave this list quietly checking nothing: the
  // mutation above would add a property the hash has never heard of, the hash would not
  // change, and the assertion would fail loudly. That is the right outcome, so this
  // check exists to say WHY it failed rather than leaving the next person guessing.
  const tower = /** @type {any} */ (stateWithTower().towers[0]);
  const missing = TOWER_STATE_FIELDS.filter((field) => tower[field] === undefined);
  assert.deepEqual(missing, [], 'these fields are no longer on a tower: ' + missing.join(', '));
});

test('the serialised state actually mentions the tower', () => {
  // If the tower were dropped entirely, every mutation above would still change nothing
  // and the first check would fail for a reason nobody could read off it.
  const text = serializeState(stateWithTower());
  assert.match(text, /\|T\|/, 'no tower section in the serialised state');
});
