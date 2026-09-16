import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTerrainTexture, getTerrainSprite } from '../../src/render/art/terrain.js';
import { clearArtCache, setCanvasFactory, useDefaultCanvasFactory } from '../../src/render/art/cache.js';
import { createFakeContext, fakeCanvasFactory } from './support/fake-context.js';

test('seeded terrain produces an identical call sequence twice', () => {
  const runA = createFakeContext();
  const runB = createFakeContext();

  renderTerrainTexture(runA.ctx, 48, 32, 'crossroads');
  renderTerrainTexture(runB.ctx, 48, 32, 'crossroads');

  assert.deepEqual(runB.calls, runA.calls, 'same seed and size must draw byte-for-byte the same sequence of calls');
  assert.ok(runA.calls.length > 0, 'sanity: terrain actually draws something');
});

test('a different seed draws a different call sequence', () => {
  const runA = createFakeContext();
  const runB = createFakeContext();

  renderTerrainTexture(runA.ctx, 48, 32, 'crossroads');
  renderTerrainTexture(runB.ctx, 48, 32, 'riverbend');

  assert.notDeepEqual(runB.calls, runA.calls);
});

test('getTerrainSprite caches: the same seed and map size returns the same offscreen canvas, and the generator runs once', () => {
  setCanvasFactory(fakeCanvasFactory());
  clearArtCache();
  try {
    const first = getTerrainSprite('crossroads', 200, 120);
    const second = getTerrainSprite('crossroads', 200, 120);
    assert.equal(second, first);

    const different = getTerrainSprite('riverbend', 200, 120);
    assert.notEqual(different, first);
  } finally {
    clearArtCache();
    useDefaultCanvasFactory();
  }
});
