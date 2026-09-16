import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_TARGETING_MODES, cycleTargetingMode, targetingModeLabel } from '../../src/ui/targeting.js';

test('ALL_TARGETING_MODES lists exactly the five documented modes', () => {
  assert.deepEqual(ALL_TARGETING_MODES, ['first', 'last', 'closest', 'strongest', 'weakest']);
});

test('cycleTargetingMode advances one step forward and wraps around', () => {
  assert.equal(cycleTargetingMode('first'), 'last');
  assert.equal(cycleTargetingMode('last'), 'closest');
  assert.equal(cycleTargetingMode('closest'), 'strongest');
  assert.equal(cycleTargetingMode('strongest'), 'weakest');
  assert.equal(cycleTargetingMode('weakest'), 'first', 'wraps back to the start');
});

test('cycleTargetingMode with direction -1 goes backward and wraps', () => {
  assert.equal(cycleTargetingMode('first', ALL_TARGETING_MODES, -1), 'weakest');
  assert.equal(cycleTargetingMode('weakest', ALL_TARGETING_MODES, -1), 'strongest');
});

test('cycleTargetingMode restricted to a subset only cycles within that subset', () => {
  const subset = ['first', 'closest'];
  assert.equal(cycleTargetingMode('first', subset), 'closest');
  assert.equal(cycleTargetingMode('closest', subset), 'first');
});

test('cycleTargetingMode recovers gracefully if the current mode is not in the allowed list', () => {
  // e.g. a tower's mode was set before its allowed set narrowed; falls back to index 0's neighbor.
  const subset = ['closest', 'strongest'];
  assert.equal(cycleTargetingMode('weakest', subset), 'strongest');
});

test('cycleTargetingMode throws on an empty allowed list rather than looping forever', () => {
  assert.throws(() => cycleTargetingMode('first', []));
});

test('targetingModeLabel returns the human label for every mode', () => {
  assert.equal(targetingModeLabel('first'), 'First');
  assert.equal(targetingModeLabel('last'), 'Last');
  assert.equal(targetingModeLabel('closest'), 'Closest');
  assert.equal(targetingModeLabel('strongest'), 'Strongest');
  assert.equal(targetingModeLabel('weakest'), 'Weakest');
});

test('targetingModeLabel falls back to the raw value for an unknown mode', () => {
  assert.equal(targetingModeLabel('mystery'), 'mystery');
});
