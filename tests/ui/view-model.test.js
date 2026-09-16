import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildViewModel, emptyViewModel } from '../../src/render/view-model.js';
import { toFixed, fromFixed } from '../../src/sim/core/fixed.js';

function makeSnapshot(overrides = {}) {
  return {
    tick: 0,
    simTimeSeconds: 0,
    cash: 300,
    lives: 20,
    waveIndex: 1,
    phase: 'active',
    intermissionSecondsRemaining: 0,
    mapId: 'm',
    difficultyId: 'd',
    towers: [],
    enemies: [],
    projectiles: [],
    events: [],
    ...overrides,
  };
}

test('buildViewModel returns an empty model when there is no next snapshot', () => {
  const vm = buildViewModel(null, null, 0.5);
  assert.deepEqual(vm, emptyViewModel());
});

test('buildViewModel with only a next snapshot uses it directly, converting fixed-point to float', () => {
  const next = makeSnapshot({
    enemies: [{ id: 'e1', defId: 'grunt', x: toFixed(10), y: toFixed(5), hpCurrent: 40, hpMax: 60, shieldCurrent: 0, statuses: [] }],
  });
  const vm = buildViewModel(null, next, 0.5);
  assert.equal(vm.enemies.length, 1);
  assert.equal(vm.enemies[0].x, 10);
  assert.equal(vm.enemies[0].y, 5);
  assert.equal(vm.cash, 300);
  assert.equal(vm.waveIndex, 1);
});

test('buildViewModel interpolates an enemy position halfway between two snapshots', () => {
  const prev = makeSnapshot({
    tick: 10,
    enemies: [{ id: 'e1', defId: 'grunt', x: toFixed(0), y: toFixed(0), hpCurrent: 60, hpMax: 60, shieldCurrent: 0, statuses: [] }],
  });
  const next = makeSnapshot({
    tick: 11,
    enemies: [{ id: 'e1', defId: 'grunt', x: toFixed(10), y: toFixed(20), hpCurrent: 40, hpMax: 60, shieldCurrent: 0, statuses: [] }],
  });
  const vm = buildViewModel(prev, next, 0.5);
  assert.equal(vm.enemies[0].x, 5);
  assert.equal(vm.enemies[0].y, 10);
  assert.equal(vm.enemies[0].hpCurrent, 50, 'hp also blends so a health bar does not jump');
  assert.equal(vm.tick, 11, 'reports the tick of the newer snapshot');
});

test('buildViewModel at alpha 0 matches the previous snapshot exactly (after fixed-point conversion)', () => {
  const prev = makeSnapshot({
    enemies: [{ id: 'e1', defId: 'grunt', x: toFixed(3), y: toFixed(7), hpCurrent: 60, hpMax: 60, shieldCurrent: 0, statuses: [] }],
  });
  const next = makeSnapshot({
    enemies: [{ id: 'e1', defId: 'grunt', x: toFixed(30), y: toFixed(70), hpCurrent: 10, hpMax: 60, shieldCurrent: 0, statuses: [] }],
  });
  const vm = buildViewModel(prev, next, 0);
  assert.equal(vm.enemies[0].x, fromFixed(toFixed(3)));
  assert.equal(vm.enemies[0].y, fromFixed(toFixed(7)));
});

test('buildViewModel does not interpolate an entity that only exists in the next snapshot (just spawned)', () => {
  const prev = makeSnapshot({ enemies: [] });
  const next = makeSnapshot({
    enemies: [{ id: 'e-new', defId: 'grunt', x: toFixed(1), y: toFixed(2), hpCurrent: 60, hpMax: 60, shieldCurrent: 0, statuses: [] }],
  });
  const vm = buildViewModel(prev, next, 0.9);
  assert.equal(vm.enemies.length, 1);
  assert.equal(vm.enemies[0].x, 1, 'renders exactly at its spawn position rather than lerping from nothing');
  assert.equal(vm.enemies[0].y, 2);
});

test('buildViewModel drops an entity that left the next snapshot (died or leaked)', () => {
  const prev = makeSnapshot({
    enemies: [{ id: 'e-gone', defId: 'grunt', x: toFixed(1), y: toFixed(2), hpCurrent: 1, hpMax: 60, shieldCurrent: 0, statuses: [] }],
  });
  const next = makeSnapshot({ enemies: [] });
  const vm = buildViewModel(prev, next, 0.5);
  assert.equal(vm.enemies.length, 0);
});

test('buildViewModel interpolates towers and projectiles the same way as enemies', () => {
  const prev = makeSnapshot({
    towers: [{ id: 't1', defId: 'turret', x: toFixed(5), y: toFixed(5), level: 0, targetingMode: 'first', abilityCooldownRemainingSeconds: 2 }],
    projectiles: [{ id: 'p1', x: toFixed(0), y: toFixed(0), fromTowerDefId: 'turret', targetEnemyId: 'e1' }],
  });
  const next = makeSnapshot({
    towers: [{ id: 't1', defId: 'turret', x: toFixed(5), y: toFixed(5), level: 1, targetingMode: 'closest', abilityCooldownRemainingSeconds: 1 }],
    projectiles: [{ id: 'p1', x: toFixed(10), y: toFixed(0), fromTowerDefId: 'turret', targetEnemyId: 'e1' }],
  });
  const vm = buildViewModel(prev, next, 0.5);
  assert.equal(vm.towers[0].level, 1, 'reports the newer level immediately, towers do not move');
  assert.equal(vm.towers[0].targetingMode, 'closest');
  assert.equal(vm.projectiles[0].x, 5, 'projectile position interpolates like an enemy');
});

test('buildViewModel passes through the newer snapshot events untouched', () => {
  const prev = makeSnapshot({ events: [] });
  const next = makeSnapshot({ events: [{ type: 'leak', x: 0, y: 0, amount: 1, enemyDefId: 'grunt' }] });
  const vm = buildViewModel(prev, next, 0.5);
  assert.equal(vm.events.length, 1);
  assert.equal(vm.events[0].type, 'leak');
});
