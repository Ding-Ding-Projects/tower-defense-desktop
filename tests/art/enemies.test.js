import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawEnemy, enemyBodyRadius, enemyArchetype, getEnemySprite } from '../../src/render/art/enemies.js';
import { ENEMY, HIDDEN_ALPHA, withAlpha } from '../../src/render/art/palette.js';
import { clearArtCache, setCanvasFactory, useDefaultCanvasFactory } from '../../src/render/art/cache.js';
import { createFakeContext, fakeCanvasFactory } from './support/fake-context.js';

const basicDef = { id: 'normal', maxHp: 2, shieldHp: 0, defense: 0, speed: 2.7, boss: false, flying: false, hidden: false };
const bossDef = { id: 'molten-boss', maxHp: 70000, shieldHp: 0, defense: 0, speed: 1, boss: true, flying: false, hidden: false };
const hiddenDef = { id: 'ghost', maxHp: 45, shieldHp: 0, defense: 0, speed: 4, boss: false, flying: false, hidden: true };
const flyingDef = { id: 'test-flier', maxHp: 50, shieldHp: 0, defense: 0, speed: 3, boss: false, flying: false, hidden: false };
const machineDef = { id: 'test-bot', maxHp: 500, shieldHp: 0, defense: 15, speed: 2, boss: false, flying: false, hidden: false };

test('enemyArchetype is derived from real fields, never from id or displayName', () => {
  assert.equal(enemyArchetype(basicDef), 'walker');
  assert.equal(enemyArchetype(bossDef), 'boss');
  assert.equal(enemyArchetype(hiddenDef), 'wraith');
  assert.equal(enemyArchetype({ ...basicDef, flying: true }), 'flier');
  assert.equal(enemyArchetype(machineDef), 'machine');
  assert.equal(enemyArchetype({ ...basicDef, defense: 5 }), 'armored');
  assert.equal(enemyArchetype({ ...basicDef, speed: 6 }), 'fast');
});

test('a boss draws larger than a basic enemy of the same sprite size', () => {
  const size = 96;
  assert.ok(enemyBodyRadius(size, bossDef) > enemyBodyRadius(size, basicDef));
});

test('a hidden enemy draws its body as a translucent wraith fill, not a lower alpha on the same solid body', () => {
  const expected = withAlpha(ENEMY.hidden, HIDDEN_ALPHA);

  const hiddenRun = createFakeContext();
  drawEnemy(hiddenRun.ctx, 96, hiddenDef, 0, 0, 1);
  const hiddenFills = hiddenRun.calls.filter((c) => c.type === 'set:fillStyle').map((c) => c.args[0]);
  assert.ok(hiddenFills.includes(expected), `expected the wraith body fill ${expected} among ${JSON.stringify(hiddenFills)}`);

  const basicRun = createFakeContext();
  drawEnemy(basicRun.ctx, 96, basicDef, 0, 0, 1);
  const basicFills = basicRun.calls.filter((c) => c.type === 'set:fillStyle').map((c) => c.args[0]);
  assert.ok(!basicFills.includes(expected), 'a non-hidden enemy must never carry the wraith alpha fill');
});

test('a flier draws its contact shadow well below its body, unlike a grounded enemy', () => {
  const size = 96;

  const groundRun = createFakeContext();
  drawEnemy(groundRun.ctx, size, flyingDef, 0, 0, 1);
  const flyingRun = createFakeContext();
  drawEnemy(flyingRun.ctx, size, { ...flyingDef, flying: true }, 0, 0, 1);

  const translates = (calls) => calls.filter((c) => c.type === 'translate');
  const [groundShadow, groundBody] = translates(groundRun.calls);
  const [flyingShadow, flyingBody] = translates(flyingRun.calls);

  const groundGap = groundShadow.args[1] - groundBody.args[1];
  const flyingGap = flyingShadow.args[1] - flyingBody.args[1];

  assert.ok(flyingGap > groundGap, `a flier's shadow-to-body gap (${flyingGap}) must exceed a grounded enemy's (${groundGap})`);
});

test('two different archetypes draw genuinely different call sequences, not the same body with a different fill', () => {
  const shapeOf = (def) => {
    const run = createFakeContext();
    drawEnemy(run.ctx, 96, def, 0, 0, 1);
    return run.calls.map((c) => c.type).join(',');
  };

  const walker = shapeOf(basicDef);
  const machine = shapeOf(machineDef);
  const flier = shapeOf({ ...flyingDef, flying: true });
  const wraith = shapeOf(hiddenDef);
  const boss = shapeOf(bossDef);

  const shapes = { walker, machine, flier, wraith, boss };
  const names = Object.keys(shapes);
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      assert.notEqual(shapes[names[i]], shapes[names[j]], `${names[i]} and ${names[j]} must draw structurally different call sequences`);
    }
  }
});

test('a damaged enemy draws more calls than an undamaged one (visible wear is purely additive)', () => {
  const healthy = createFakeContext();
  const damaged = createFakeContext();
  drawEnemy(healthy.ctx, 96, basicDef, 0, 0, 1);
  drawEnemy(damaged.ctx, 96, basicDef, 0, 0, 0.25);

  assert.ok(damaged.calls.length > healthy.calls.length, `a badly damaged enemy (${damaged.calls.length} calls) must draw at least the scorch and crack overlays a healthy one (${healthy.calls.length} calls) does not`);
});

test('drawEnemy is a pure function: identical arguments draw an identical call sequence', () => {
  const runA = createFakeContext();
  const runB = createFakeContext();
  drawEnemy(runA.ctx, 96, machineDef, 2.4, 0.6, 0.5);
  drawEnemy(runB.ctx, 96, machineDef, 2.4, 0.6, 0.5);
  assert.deepEqual(runB.calls, runA.calls);
});

test('getEnemySprite caches by (enemy, size, phase bucket, facing bucket, damage tier)', () => {
  setCanvasFactory(fakeCanvasFactory());
  clearArtCache();
  try {
    const first = getEnemySprite(basicDef, 64, 0, 0, 1);
    const second = getEnemySprite(basicDef, 64, 0.001, 0, 1); // same phase bucket
    const third = getEnemySprite(basicDef, 64, Math.PI, 0, 1); // opposite phase, different bucket
    assert.equal(second, first);
    assert.notEqual(third, first);
  } finally {
    clearArtCache();
    useDefaultCanvasFactory();
  }
});
