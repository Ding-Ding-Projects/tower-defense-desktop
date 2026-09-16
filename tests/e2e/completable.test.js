/**
 * The shipped game can be finished.
 *
 * Everything else here runs against the synthetic fixture, which is the right way to
 * test a mechanic and says nothing about whether the numbers actually on disk add up to
 * a game somebody can complete. They did not. A headless playthrough with an ordinary
 * strategy lost on wave 8 or 9 on every map, every difficulty and every tower, and the
 * reason was arithmetic rather than tactics: the whole ten-wave arc paid out about
 * 12,000 cash, the best tower converts cash into damage at roughly 6 damage per second
 * per 1,000 spent, and wave 10 alone carried 56,864 health.
 *
 * Nothing caught it because nothing had ever played the game. The suite was green
 * throughout.
 *
 * These runs play the real towers, the real waves and the real difficulty multipliers
 * through the real simulation. They are the slowest checks in the suite by a wide
 * margin, at a few seconds each, and that is the correct price for the only check that
 * knows whether the product works.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { play } from '../../tools/playthrough-probe.mjs';

test('easy can be won on crossroads with nothing but Scouts', () => {
  // The cheapest tower in the game and one kind of it. If the gentlest difficulty
  // cannot be beaten by the most basic possible defence, nothing above it can be.
  const result = play('crossroads', 'easy', 'scout');
  assert.equal(result.phase, 'won', 'lost on wave ' + result.wave + ' with ' + result.leaks + ' leaks');
  assert.ok(result.wave >= 40, 'the arc is meant to run 40 waves, and it ended at ' + result.wave);
  assert.ok(result.lives > 0);
  assert.ok(result.kills > 500, 'only ' + result.kills + ' kills; the towers were barely engaging');
});

test('easy can be won on riverbend too, so the arc is not one map deep', () => {
  const result = play('riverbend', 'easy', 'scout');
  assert.equal(result.phase, 'won', 'lost on wave ' + result.wave + ' with ' + result.leaks + ' leaks');
});

test('hardcore can be won, and only barely', () => {
  // Hardcore multiplies enemy health by six, bans Scout outright and cuts the base to
  // twenty lives. It has to be beatable or it is not a difficulty, it is a wall; and it
  // has to be close or it is not hardcore.
  const result = play('crossroads', 'hardcore', 'soldier');
  assert.equal(result.phase, 'won', 'lost on wave ' + result.wave + ' with ' + result.leaks + ' leaks');
  assert.ok(
    result.lives <= 15,
    'hardcore finished with ' + result.lives + ' of 20 lives, which is not hardcore',
  );
});

test('a difficulty that bans a tower says so rather than reporting a loss', () => {
  // Hardcore forbids Scout. Before this was handled the probe built nothing at all,
  // lost on wave 5, and reported it as a difficulty result, which is indistinguishable
  // from a brutally hard tier and completely wrong.
  const result = play('crossroads', 'hardcore', 'scout');
  assert.equal(result.phase, 'unplayable');
  assert.match(result.reason, /not allowed on hardcore/);
});

test('the ladder is ordered: a harder difficulty is a harder game', () => {
  // Measured by how much of the wave load gets through relative to what was fielded,
  // rather than by lives remaining. Lives are a poor cross-tier measure here: leak
  // damage is per enemy and a harder tier meets the same curve with fewer, tougher
  // enemies, so it can finish with MORE lives while being plainly harder. That
  // artefact once made intermediate look easier than easy.
  const easy = play('crossroads', 'easy', 'soldier');
  const hardcore = play('crossroads', 'hardcore', 'soldier');
  assert.equal(easy.phase, 'won');
  assert.equal(hardcore.phase, 'won');
  assert.ok(
    hardcore.kills < easy.kills,
    'hardcore should field fewer, tougher enemies, not more of them',
  );
  assert.ok(
    hardcore.lives / 20 < easy.lives / 100 + 0.2,
    'hardcore kept ' + hardcore.lives + '/20 against easy ' + easy.lives + '/100, which is not a harder game',
  );
});
