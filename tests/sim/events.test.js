/**
 * The simulation reports what happened, so the interface can show it.
 *
 * The renderer has carried the whole feedback layer since the first pass: a particle
 * pool, floating damage numbers, a leak flash, and `_handleEvent` to drive them from a
 * snapshot's events. None of it had ever run. The simulation recorded no events and the
 * snapshot emitted none, so the view model read `next.events ?? []` and got the empty
 * array every single tick, for every match anyone ever played.
 *
 * Nothing threw and no check failed. The battlefield was simply quieter than it was
 * built to be, in a way only somebody who had read the renderer would know to miss.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMatch, submitCommand, runTicks } from '../../src/sim/core/match.js';
import { snapshot } from '../../src/sim/state/snapshot.js';
import { TICK_RATE } from '../../src/sim/core/constants.js';
import { makeGameData, placeEnemy } from '../fixtures/game-data.js';

const newMatch = () => createMatch({
  gameData: makeGameData(), seed: 9, mapId: 'proving-ground', difficultyId: 'standard',
});

/** Run a tick at a time, collecting every event any snapshot reported. */
function eventsOver(match, ticks) {
  const seen = [];
  for (let i = 0; i < ticks; i += 1) {
    runTicks(match, 1);
    seen.push(...snapshot(match.state).events);
  }
  return seen;
}

test('a tower hitting something reports the damage it dealt', () => {
  const match = newMatch();
  submitCommand(match, 'PlaceTower', { towerId: 'gunner', x: 60, y: 65 });
  runTicks(match, 2);
  placeEnemy(match.state, 'grunt', 60 * 1024, { hp: 500, maxHp: 500 });

  const damage = eventsOver(match, TICK_RATE * 3).filter((e) => e.type === 'damageDealt');
  assert.ok(damage.length > 0, 'a tower shot something and reported nothing');
  assert.ok(damage[0].amount > 0, 'a damage event with no damage in it');
  assert.ok(Number.isFinite(damage[0].x) && Number.isFinite(damage[0].y), 'the event has no position');
});

test('a kill is reported once, with the enemy that died', () => {
  const match = newMatch();
  submitCommand(match, 'PlaceTower', { towerId: 'gunner', x: 60, y: 65 });
  runTicks(match, 2);
  placeEnemy(match.state, 'grunt', 60 * 1024, { hp: 10, maxHp: 100 });

  const kills = eventsOver(match, TICK_RATE * 3).filter((e) => e.type === 'kill');
  assert.equal(kills.length, 1, 'expected exactly one kill event, got ' + kills.length);
  assert.equal(kills[0].enemyDefId, 'grunt');
});

test('a leak is reported with what it cost', () => {
  const match = newMatch();
  // Undefended, so everything that spawns walks the whole way.
  const events = eventsOver(match, TICK_RATE * 120).filter((e) => e.type === 'leak');
  assert.ok(events.length > 0, 'enemies leaked and nothing said so');
  assert.equal(events[0].enemyDefId, 'grunt');
  assert.equal(events[0].amount, 1, 'a grunt costs one life, and the event should say so');
});

test('each snapshot carries only its own tick', () => {
  // Otherwise a leak flash would fire again on every later frame, and a damage number
  // would be spawned once per tick for the rest of the match.
  const match = newMatch();
  submitCommand(match, 'PlaceTower', { towerId: 'gunner', x: 60, y: 65 });
  runTicks(match, 2);
  placeEnemy(match.state, 'grunt', 60 * 1024, { hp: 10, maxHp: 100 });

  let sawKill = false;
  let repeats = 0;
  for (let i = 0; i < TICK_RATE * 4; i += 1) {
    runTicks(match, 1);
    const kills = snapshot(match.state).events.filter((e) => e.type === 'kill');
    if (sawKill && kills.length > 0) repeats += 1;
    if (kills.length > 0) sawKill = true;
  }
  assert.ok(sawKill, 'nothing was killed, so this proves nothing');
  assert.equal(repeats, 0, 'the same kill was reported on ' + repeats + ' later ticks');
});

test('the wave completion bonus reaches the snapshot', () => {
  // Paid into cash from the first version and never exposed, so the wave-clear card's
  // "Completion bonus" line read zero and never appeared once.
  const match = newMatch();
  runTicks(match, TICK_RATE * 120);
  const snap = snapshot(match.state);
  assert.ok(
    snap.waveCompletionBonus > 0,
    'no wave has reported a completion bonus after two minutes; it is ' + snap.waveCompletionBonus,
  );
});
