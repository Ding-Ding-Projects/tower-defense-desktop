import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveShopEntryState, deriveUpgradeState, deriveSellValue, diffLevels } from '../../src/ui/affordability.js';

const SOURCE = { wikiUrl: 'about:blank', retrievedAt: '2026-01-01' };

const TOWER = {
  id: 'test-turret',
  displayName: 'Test Turret',
  baseCost: 100,
  allowedTerrain: ['ground'],
  placementPool: 'default',
  maxCount: 2,
  sellRefundPercent: 70,
  footprintRadius: 1,
  targetingModes: ['first', 'last', 'closest', 'strongest', 'weakest'],
  levels: [
    { level: 0, cost: 100, damage: 10, fireRate: 1.5, range: 6, detectsHidden: false, hitsAir: false, source: SOURCE },
    { level: 1, cost: 80, damage: 18, fireRate: 1.6, range: 6.5, detectsHidden: false, hitsAir: false, source: SOURCE },
  ],
  source: SOURCE,
};

test('deriveShopEntryState is affordable when cash covers cost and pool has room', () => {
  const result = deriveShopEntryState(TOWER, 150, new Map());
  assert.equal(result.affordable, true);
  assert.equal(result.disabledReason, null);
});

test('deriveShopEntryState reports the exact shortfall when cash is insufficient', () => {
  const result = deriveShopEntryState(TOWER, 40, new Map());
  assert.equal(result.affordable, false);
  assert.equal(result.disabledReason, 'Need 60 more cash');
});

test('deriveShopEntryState disables at the placement pool cap even with enough cash', () => {
  const counts = new Map([['default', 2]]);
  const result = deriveShopEntryState(TOWER, 1000, counts);
  assert.equal(result.affordable, false);
  assert.equal(result.disabledReason, 'Pool limit reached (2)');
});

test('deriveShopEntryState allows a tower with no maxCount to place without limit', () => {
  const unlimited = { ...TOWER, maxCount: null };
  const counts = new Map([['default', 999]]);
  const result = deriveShopEntryState(unlimited, 1000, counts);
  assert.equal(result.affordable, true);
});

test('deriveShopEntryState disables a tower disallowed by the active difficulty', () => {
  const result = deriveShopEntryState(TOWER, 1000, new Map(), [TOWER.id]);
  assert.equal(result.affordable, false);
  assert.equal(result.disabledReason, 'Not allowed on this difficulty');
});

test('diffLevels reports only fields that actually changed', () => {
  const changes = diffLevels(TOWER.levels[0], TOWER.levels[1]);
  const byField = Object.fromEntries(changes.map((c) => [c.field, c]));
  assert.equal(byField.damage.before, 10);
  assert.equal(byField.damage.after, 18);
  assert.equal(byField.fireRate.after, 1.6);
  assert.equal(byField.range.after, 6.5);
  assert.equal(byField.detectsHidden, undefined, 'non-diffable fields are not reported');
});

test('deriveUpgradeState is available when cash covers the next level and reports the diff', () => {
  const result = deriveUpgradeState(TOWER, 0, 100);
  assert.equal(result.available, true);
  assert.equal(result.cost, 80);
  assert.ok(result.changes.some((c) => c.field === 'damage' && c.after === 18));
});

test('deriveUpgradeState reports a shortfall reason when cash is short', () => {
  const result = deriveUpgradeState(TOWER, 0, 10);
  assert.equal(result.available, false);
  assert.equal(result.disabledReason, 'Need 70 more cash');
  assert.equal(result.cost, 80);
});

test('deriveUpgradeState reports Max level with no cost or changes past the last level', () => {
  const result = deriveUpgradeState(TOWER, 1, 100000);
  assert.equal(result.available, false);
  assert.equal(result.disabledReason, 'Max level');
  assert.equal(result.cost, 0);
  assert.deepEqual(result.changes, []);
});

test('deriveSellValue sums spent cost through the current level and applies the refund percent, floored', () => {
  // level 0 costs 100, level 1 costs 80 more => 180 spent at level 1, 70% refund => 126
  assert.equal(deriveSellValue(TOWER, 1), 126);
  assert.equal(deriveSellValue(TOWER, 0), 70);
});

test('deriveSellValue floors a fractional refund rather than rounding', () => {
  const oddRefund = { ...TOWER, sellRefundPercent: 33, levels: [{ level: 0, cost: 100 }] };
  assert.equal(deriveSellValue(oddRefund, 0), 33); // 100 * 0.33 = 33 exactly, sanity check
  const oddRefund2 = { ...TOWER, sellRefundPercent: 33, levels: [{ level: 0, cost: 101 }] };
  assert.equal(deriveSellValue(oddRefund2, 0), 33); // 101 * 0.33 = 33.33 -> floors to 33
});
