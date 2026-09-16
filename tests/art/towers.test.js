import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawTower, getTowerSprite, towerRole, towerLivery } from '../../src/render/art/towers.js';
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

test('two towers with identical stats still draw as different towers', () => {
  // Shape is derived from the level's mechanical fields, which is the right rule and
  // stays the rule. Its consequence, unnoticed until the shop was looked at, is that
  // four towers sharing every field at level 0 came out pixel-identical: Scout,
  // Soldier, Freezer and Militant were all the same dark disc, in the shop and on the
  // battlefield. Livery is hashed from the id to break exactly that tie.
  const a = createFakeContext();
  const b = createFakeContext();
  const stats = level({});

  drawTower(a.ctx, 96, { id: 'scout', footprintRadius: 1.5 }, stats, 0);
  drawTower(b.ctx, 96, { id: 'soldier', footprintRadius: 1.5 }, stats, 0);

  assert.notDeepEqual(
    a.calls, b.calls,
    'two towers with the same stats and different ids must not draw identically',
  );
});

test('livery is stable for an id, so the sprite cache can key on it', () => {
  // If this drifted, the cache would hand back a stale bitmap for a tower that now
  // draws differently, and the wrong tower would appear on the field.
  const first = createFakeContext();
  const second = createFakeContext();
  const stats = level({});
  drawTower(first.ctx, 96, { id: 'militant', footprintRadius: 1.5 }, stats, 0);
  drawTower(second.ctx, 96, { id: 'militant', footprintRadius: 1.5 }, stats, 0);
  assert.deepEqual(first.calls, second.calls, 'the same id must always draw the same tower');
});

test('the role is still expressed, with the id held constant', () => {
  // Livery must not have become the only thing that varies. Holding the id fixed and
  // changing only a mechanical field has to change the picture, or a player would be
  // learning paint colours instead of learning what a shape means.
  const single = contextFor({ id: 'scout' }, level({}));
  const splash = contextFor({ id: 'scout' }, level({ aoeRadius: 6 }));
  assert.notDeepEqual(single.calls, splash.calls, 'a splash tower must not draw like a single-target one');

  const support = contextFor({ id: 'scout' }, level({ aura: { stat: 'damage', mode: 'additive', radius: 10, value: 2 } }));
  assert.notDeepEqual(splash.calls, support.calls, 'a support tower must not draw like a splash one');
});

test('livery depends on the id and nothing else', () => {
  // It is hashed from the id alone on purpose. If it ever picked up the level or the
  // footprint, the sprite cache — which keys on id, level and size — would still be
  // correct, but two towers would start sharing a look as their stats converged, which
  // is the exact problem livery was added to solve.
  const base = towerLivery({ id: 'freezer', footprintRadius: 1.5 });
  assert.deepEqual(towerLivery({ id: 'freezer', footprintRadius: 2 }), base, 'footprint must not change the livery');
  assert.deepEqual(towerLivery({ id: 'freezer' }), base, 'an absent footprint must not change it either');
  assert.notDeepEqual(towerLivery({ id: 'freezer-2' }), base, 'a different id must get a different livery');
});

function contextFor(def, levelDef) {
  const recorder = createFakeContext();
  drawTower(recorder.ctx, 96, { footprintRadius: 1.5, ...def }, levelDef, 0);
  return recorder;
}
