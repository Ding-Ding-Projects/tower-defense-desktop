import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMatch, tick, runTicks, TICK_RATE } from '../../src/sim/core/match.js';
import { hashState, serializeState } from '../../src/sim/state/snapshot.js';
import { replay, proveDeterministic } from '../../src/sim/state/replay.js';
import { createRng, nextFloat, nextInt, cloneRng } from '../../src/sim/core/rng.js';
import { makeGameData } from '../fixtures/game-data.js';

const setup = (seed = 1234) => ({
  gameData: makeGameData(),
  seed,
  mapId: 'proving-ground',
  difficultyId: 'standard',
});

/** A command log with enough going on that a divergence has somewhere to hide. */
const busyLog = () => [
  { tick: 4, kind: 'PlaceTower', payload: { towerId: 'gunner', x: 30, y: 70 } },
  { tick: 6, kind: 'PlaceTower', payload: { towerId: 'gunner', x: 80, y: 85 } },
  { tick: 8, kind: 'PlaceTower', payload: { towerId: 'captain', x: 55, y: 78 } },
  { tick: 40, kind: 'SetTargeting', payload: { seq: 1, mode: 'last' } },
  { tick: 90, kind: 'UpgradeTower', payload: { seq: 1 } },
  { tick: 150, kind: 'UseAbility', payload: { seq: 3 } },
  { tick: 220, kind: 'SellTower', payload: { seq: 2 } },
  { tick: 260, kind: 'PlaceTower', payload: { towerId: 'gunner', x: 140, y: 70 } },
];

test('the generator is a pure function of its state', () => {
  const a = createRng(99);
  const b = createRng(99);
  for (let i = 0; i < 500; i += 1) assert.equal(nextFloat(a), nextFloat(b));
});

test('a cloned generator continues the same stream, not a new one', () => {
  const original = createRng(7);
  for (let i = 0; i < 10; i += 1) nextFloat(original);
  const copy = cloneRng(original);
  for (let i = 0; i < 50; i += 1) assert.equal(nextFloat(original), nextFloat(copy));
});

test('nextInt stays inside its bounds and reaches both ends', () => {
  const rng = createRng(3);
  let sawMin = false;
  let sawMax = false;
  for (let i = 0; i < 5000; i += 1) {
    const value = nextInt(rng, -3, 3);
    assert.ok(value >= -3 && value <= 3, 'out of bounds: ' + value);
    if (value === -3) sawMin = true;
    if (value === 3) sawMax = true;
  }
  assert.ok(sawMin && sawMax, 'both ends of the range must actually be reachable');
});

test('the same seed and the same commands produce identical worlds, sampled every second', () => {
  const result = proveDeterministic(setup(), busyLog(), TICK_RATE * 120);
  assert.equal(
    result.identical,
    true,
    'first divergence at tick ' + result.firstDivergenceTick,
  );
  assert.ok(result.a.hashes.length > 10, 'and it ran long enough to be worth sampling');
});

test('a different seed produces a different world', () => {
  const one = replay(setup(1), busyLog(), TICK_RATE * 60);
  const two = replay(setup(2), busyLog(), TICK_RATE * 60);
  // Same commands, different seed: the spawn offsets differ, so the serialisation
  // must differ. If this ever passes trivially, the generator is not being consulted.
  assert.notEqual(
    serializeState(one.match.state),
    serializeState(two.match.state),
    'the seed has to actually reach the simulation',
  );
});

test('the state hash notices a single changed field', () => {
  const match = createMatch(setup());
  runTicks(match, 60);
  const before = hashState(match.state);
  match.state.cash += 1;
  assert.notEqual(hashState(match.state), before, 'one dollar must move the hash');
});

test('the hash does not depend on the order entities happen to sit in an array', () => {
  const match = createMatch(setup());
  runTicks(match, TICK_RATE * 15);
  assert.ok(match.state.enemies.length > 1, 'need at least two enemies to reorder');

  const before = hashState(match.state);
  match.state.enemies.reverse();
  assert.equal(hashState(match.state), before, 'array order is not part of the world');
});

test('the hash covers the generator position, not just the visible world', () => {
  const match = createMatch(setup());
  runTicks(match, 30);
  const before = hashState(match.state);
  match.state.rng.state = (match.state.rng.state + 1) >>> 0;
  assert.notEqual(
    hashState(match.state),
    before,
    'two runs that agree on everything except the generator diverge on the very next draw',
  );
});

test('replaying a log reaches exactly the state that running it live did', () => {
  const live = createMatch(setup());
  const log = busyLog();
  let cursor = 0;
  for (let i = 0; i < TICK_RATE * 90; i += 1) {
    while (cursor < log.length && log[cursor].tick <= live.state.tick + 1) {
      live.queue.push({ ...log[cursor], order: cursor });
      cursor += 1;
    }
    tick(live);
    if (live.state.phase === 'won' || live.state.phase === 'lost') break;
  }

  const replayed = replay(setup(), log, TICK_RATE * 90);
  assert.equal(
    serializeState(replayed.match.state),
    serializeState(live.state),
    'a replay that does not reproduce the live run is not a replay',
  );
});

test('an empty command log is still deterministic', () => {
  const result = proveDeterministic(setup(555), [], TICK_RATE * 120);
  assert.equal(result.identical, true, 'diverged at tick ' + result.firstDivergenceTick);
});

test('a refused command in a log is reported rather than silently dropped', () => {
  const result = replay(
    setup(),
    [{ tick: 4, kind: 'PlaceTower', payload: { towerId: 'gunner', x: 100, y: 50 } }],
    60,
  );
  assert.equal(result.refusals.length, 1);
  assert.match(result.refusals[0], /cannot build here/);
});
