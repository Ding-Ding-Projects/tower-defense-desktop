import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawPath } from '../../src/render/art/path.js';
import { createFakeContext } from './support/fake-context.js';

const points = [
  { x: 0, y: 60 },
  { x: 45, y: 60 },
  { x: 45, y: 20 },
  { x: 110, y: 20 },
];

test('drawPath is a pure function of its arguments: same points and seed draw an identical sequence', () => {
  const runA = createFakeContext();
  const runB = createFakeContext();
  drawPath(runA.ctx, points, 18, 'crossroads');
  drawPath(runB.ctx, points, 18, 'crossroads');
  assert.deepEqual(runB.calls, runA.calls);
});

test('drawPath draws something for a two-point straight line and does nothing for fewer than two points', () => {
  const straight = createFakeContext();
  drawPath(straight.ctx, [{ x: 0, y: 0 }, { x: 40, y: 0 }], 12, 'seed');
  assert.ok(straight.calls.length > 0);

  const empty = createFakeContext();
  drawPath(empty.ctx, [{ x: 0, y: 0 }], 12, 'seed');
  assert.equal(empty.calls.length, 0);
});

test('a different seed jitters the edges differently, so the call sequence changes even for identical points', () => {
  const runA = createFakeContext();
  const runB = createFakeContext();
  drawPath(runA.ctx, points, 18, 'seed-one');
  drawPath(runB.ctx, points, 18, 'seed-two');
  assert.notDeepEqual(runB.calls, runA.calls);
});
