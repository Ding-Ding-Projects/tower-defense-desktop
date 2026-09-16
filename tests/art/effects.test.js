import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  drawMuzzleFlash, drawProjectileTrail, drawImpactSpark, drawExplosion,
  drawFreezeOverlay, drawBurningEmbers, drawLeakFlash,
} from '../../src/render/art/effects.js';
import { createFakeContext } from './support/fake-context.js';

test('every effect is a pure function of (t, ...): identical arguments draw an identical sequence', () => {
  const cases = [
    () => { const r = createFakeContext(); drawMuzzleFlash(r.ctx, 10, 10, 0.4, 0.2, 3); return r; },
    () => { const r = createFakeContext(); drawProjectileTrail(r.ctx, 0, 0, 10, 4, 0.3, 0.5); return r; },
    () => { const r = createFakeContext(); drawImpactSpark(r.ctx, 5, 5, 0.5, 2); return r; },
    () => { const r = createFakeContext(); drawExplosion(r.ctx, 8, 8, 6, 0.4, 2); return r; },
    () => { const r = createFakeContext(); drawFreezeOverlay(r.ctx, 8, 8, 3, 0.5); return r; },
    () => { const r = createFakeContext(); drawBurningEmbers(r.ctx, 8, 8, 3, 0.6, 'seed'); return r; },
    () => { const r = createFakeContext(); drawLeakFlash(r.ctx, 400, 300, 0.2); return r; },
  ];
  for (const runEffect of cases) {
    const a = runEffect();
    const b = runEffect();
    assert.deepEqual(b.calls, a.calls);
  }
});

test('an effect at t=1 (fully faded) draws nothing, so a finished effect costs zero calls', () => {
  const spark = createFakeContext();
  drawImpactSpark(spark.ctx, 0, 0, 1, 2);
  assert.equal(spark.calls.length, 0);

  const flash = createFakeContext();
  drawLeakFlash(flash.ctx, 100, 100, 1);
  assert.equal(flash.calls.length, 0);
});

test('drawExplosion draws an expanding ring: the shockwave radius grows with t', () => {
  const early = createFakeContext();
  drawExplosion(early.ctx, 0, 0, 20, 0.1, 2);
  const late = createFakeContext();
  drawExplosion(late.ctx, 0, 0, 20, 0.8, 2);

  const ringRadius = (calls) => {
    const arcs = calls.filter((c) => c.type === 'arc');
    return arcs[arcs.length - 1].args[2]; // last arc drawn is the shockwave ring
  };
  assert.ok(ringRadius(late.calls) > ringRadius(early.calls));
});
