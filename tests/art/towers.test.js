import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawTower, getTowerSprite, towerRole } from '../../src/render/art/towers.js';
import { clearArtCache, setCanvasFactory, useDefaultCanvasFactory } from '../../src/render/art/cache.js';
import { createFakeContext, fakeCanvasFactory } from './support/fake-context.js';

const sniperDef = { id: 'sniper', footprintRadius: 1.5 };

function level(overrides) {
  return { level: 0, damage: 10, fireRate: 0.2, range: 28, detectsHidden: true, hitsAir: false, ...overrides };
}

test('a level 3 tower issues more drawing calls than a level 0 tower', () => {
  const level0 = createFakeContext();
  const level3 = createFakeContext();

  drawTower(level0.ctx, 96, sniperDef, level({ level: 0 }), 0);
  drawTower(level3.ctx, 96, sniperDef, level({ level: 3 }), 0);

  assert.ok(level3.calls.length > level0.calls.length, `level 3 (${level3.calls.length} calls) must draw more than level 0 (${level0.calls.length} calls) — armor rivets and level pips scale with level`);
});

test('towerRole reads the archetype from real levelDef fields, never from the tower id', () => {
  assert.equal(towerRole(level({})), 'single');
  assert.equal(towerRole(level({ aoeRadius: 6 })), 'aoe');
  assert.equal(towerRole(level({ chainCount: 3 })), 'chain');
  assert.equal(towerRole(level({ pierceCount: 2 })), 'pierce');
  assert.equal(towerRole(level({ incomePerWave: 50 })), 'economy');
  assert.equal(towerRole(level({ aura: { stat: 'damage', mode: 'additive', radius: 5, value: 0.1 } })), 'support');
});

test('different archetypes draw genuinely different silhouettes, not the same shape with a different fill', () => {
  const single = createFakeContext();
  const aoe = createFakeContext();
  const chain = createFakeContext();

  drawTower(single.ctx, 96, sniperDef, level({}), 0);
  drawTower(aoe.ctx, 96, sniperDef, level({ aoeRadius: 6 }), 0);
  drawTower(chain.ctx, 96, sniperDef, level({ chainCount: 3 }), 0);

  const shapeOf = (calls) => calls.map((c) => c.type).join(',');
  assert.notEqual(shapeOf(aoe.calls), shapeOf(single.calls));
  assert.notEqual(shapeOf(chain.calls), shapeOf(single.calls));
  assert.notEqual(shapeOf(chain.calls), shapeOf(aoe.calls));
});

test('drawTower is a pure function: identical arguments draw an identical call sequence', () => {
  const runA = createFakeContext();
  const runB = createFakeContext();
  drawTower(runA.ctx, 96, sniperDef, level({ level: 2 }), 1.2);
  drawTower(runB.ctx, 96, sniperDef, level({ level: 2 }), 1.2);
  assert.deepEqual(runB.calls, runA.calls);
});

test('getTowerSprite caches by (tower, level, size, rotation bucket): same rotation reuses the bitmap, a very different rotation does not', () => {
  setCanvasFactory(fakeCanvasFactory());
  clearArtCache();
  try {
    const l0 = level({ level: 0 });
    const first = getTowerSprite(sniperDef, l0, 64, 0);
    const second = getTowerSprite(sniperDef, l0, 64, 0.001); // same rotation bucket
    const third = getTowerSprite(sniperDef, l0, 64, Math.PI); // opposite direction, different bucket
    assert.equal(second, first, 'a negligible rotation change must still land in the same cache bucket');
    assert.notEqual(third, first, 'a rotation on the opposite side of the circle must be a different cache entry');
  } finally {
    clearArtCache();
    useDefaultCanvasFactory();
  }
});
