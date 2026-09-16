import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpriteCache, getCachedCanvas, clearArtCache, setCanvasFactory, useDefaultCanvasFactory, quantizeAngle, quantizePhase } from '../../src/render/art/cache.js';
import { fakeCanvasFactory, createFakeCanvas } from './support/fake-context.js';

test('createSpriteCache returns the same object for the same signature and size', () => {
  const cache = createSpriteCache(() => createFakeCanvas().canvas);
  let drawCalls = 0;
  const drawFn = () => { drawCalls += 1; };

  const first = cache.get('tower:sniper:0', 96, 96, drawFn);
  const second = cache.get('tower:sniper:0', 96, 96, drawFn);

  assert.equal(second, first, 'same signature + size must be the identical cached object');
  assert.equal(drawCalls, 1, 'the draw callback must run exactly once for a cache hit');
});

test('createSpriteCache returns a different object for a different signature', () => {
  const cache = createSpriteCache(() => createFakeCanvas().canvas);
  const a = cache.get('tower:sniper:0', 96, 96, () => {});
  const b = cache.get('tower:sniper:1', 96, 96, () => {});
  assert.notEqual(b, a);
});

test('createSpriteCache returns a different object for a different size, same signature', () => {
  const cache = createSpriteCache(() => createFakeCanvas().canvas);
  const a = cache.get('tower:sniper:0', 96, 96, () => {});
  const b = cache.get('tower:sniper:0', 48, 48, () => {});
  assert.notEqual(b, a, 'size is part of the cache key, not just the caller-supplied signature');
});

test('clear() empties the cache so the next get() re-runs the draw callback', () => {
  const cache = createSpriteCache(() => createFakeCanvas().canvas);
  let drawCalls = 0;
  cache.get('x', 10, 10, () => { drawCalls += 1; });
  cache.clear();
  cache.get('x', 10, 10, () => { drawCalls += 1; });
  assert.equal(drawCalls, 2);
  assert.equal(cache.size(), 1);
});

test('getCachedCanvas (the shared default-backed cache) honours the same identity rules via an injected fake factory', () => {
  setCanvasFactory(fakeCanvasFactory());
  clearArtCache();
  try {
    const a = getCachedCanvas('shared:sig', 32, 32, () => {});
    const b = getCachedCanvas('shared:sig', 32, 32, () => {});
    const c = getCachedCanvas('shared:other', 32, 32, () => {});
    assert.equal(b, a);
    assert.notEqual(c, a);
  } finally {
    clearArtCache();
    useDefaultCanvasFactory();
  }
});

test('quantizeAngle buckets a continuous angle into a fixed number of evenly spaced steps', () => {
  const buckets = 4; // 0, PI/2, PI, 3PI/2
  assert.equal(quantizeAngle(0, buckets).index, 0);
  assert.equal(quantizeAngle(Math.PI / 2, buckets).index, 1);
  assert.equal(quantizeAngle(Math.PI, buckets).index, 2);
  assert.equal(quantizeAngle(-Math.PI / 2, buckets).index, 3);
  // A full turn away lands on the same bucket as the original angle.
  assert.equal(quantizeAngle(Math.PI * 2, buckets).index, quantizeAngle(0, buckets).index);
});

test('quantizePhase mirrors quantizeAngle bucketing for animation phase', () => {
  const a = quantizePhase(1.234, 8);
  const b = quantizeAngle(1.234, 8);
  assert.equal(a.index, b.index);
  assert.equal(a.phase, b.angle);
});
