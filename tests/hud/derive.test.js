import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveShopEntryState,
  diffLevels,
  deriveUpgradeState,
  deriveSellValue,
  ALL_TARGETING_MODES,
  cycleTargetingMode,
  targetingModeLabel,
  isAbilityReady,
} from '../../src/render/hud/derive.js';

const SOURCE = { wikiUrl: 'about:blank', retrievedAt: '2026-01-01' };

const TOWER = {
  id: 'test-turret',
  displayName: 'Test Turret',
  baseCost: 100,
  allowedTerrain: ['ground'],
  placementPool: 'default',
  maxCount: 2,
  sellRefundFraction: 0.7,
  footprintRadius: 1,
  targetingModes: ['first', 'last', 'closest', 'strongest', 'weakest'],
  levels: [
    { level: 0, cost: 100, damage: 10, fireRate: 1.5, range: 6, detectsHidden: false, hitsAir: false, source: SOURCE },
    { level: 1, cost: 80, damage: 18, fireRate: 1.6, range: 6.5, detectsHidden: false, hitsAir: false, source: SOURCE },
  ],
  source: SOURCE,
};

test('deriveShopEntryState is affordable when cash covers cost and the pool has room', () => {
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

test('deriveShopEntryState disables a tower disallowed by the active difficulty, even if affordable', () => {
  const result = deriveShopEntryState(TOWER, 1000, new Map(), [TOWER.id]);
  assert.equal(result.affordable, false);
  assert.equal(result.disabledReason, 'Not allowed on this difficulty');
});

test('diffLevels reports only fields that actually changed between two levels', () => {
  const changes = diffLevels(TOWER.levels[0], TOWER.levels[1]);
  const byField = Object.fromEntries(changes.map((c) => [c.field, c]));
  assert.equal(byField.damage.before, 10);
  assert.equal(byField.damage.after, 18);
  assert.equal(byField.fireRate.after, 1.6);
  assert.equal(byField.detectsHidden, undefined, 'non-diffable fields are never reported');
});

test('deriveUpgradeState is available when cash covers the next level and reports what changes', () => {
  const result = deriveUpgradeState(TOWER, 0, 100);
  assert.equal(result.available, true);
  assert.equal(result.cost, 80);
  assert.ok(result.changes.some((c) => c.field === 'damage' && c.after === 18));
});

test('deriveUpgradeState names the exact shortfall when cash is short', () => {
  const result = deriveUpgradeState(TOWER, 0, 10);
  assert.equal(result.available, false);
  assert.equal(result.disabledReason, 'Need 70 more cash');
});

test('deriveUpgradeState reports Max level with no cost or changes past the last level', () => {
  const result = deriveUpgradeState(TOWER, 1, 1_000_000);
  assert.equal(result.available, false);
  assert.equal(result.disabledReason, 'Max level');
  assert.equal(result.cost, 0);
  assert.deepEqual(result.changes, []);
});

test('deriveSellValue refunds a fraction of the placement price plus every upgrade', () => {
  // The placement price lives in baseCost, not in level zero, so a tower nobody has
  // upgraded still has something to refund: 100 spent, 0.7 back, 70.
  assert.equal(deriveSellValue(TOWER, 0), 70);
  // At level one: 100 placed plus 80 upgraded is 180, and 180 times 0.7 truncates to
  // 125 rather than 126 because 0.7 has no exact binary representation. The number on
  // the button has to be what the simulation will actually pay, not what is tidier.
  assert.equal(deriveSellValue(TOWER, 1), 125);
});

test('cycleTargetingMode wraps forward and honours a restricted allowed-mode list', () => {
  assert.equal(cycleTargetingMode('first', ALL_TARGETING_MODES, 1), 'last');
  assert.equal(cycleTargetingMode('weakest', ALL_TARGETING_MODES, 1), 'first', 'wraps around');
  assert.equal(cycleTargetingMode('first', ['first', 'closest'], 1), 'closest');
});

test('cycleTargetingMode recovers to the first allowed mode when the current mode is not in the list', () => {
  assert.equal(cycleTargetingMode('strongest', ['first', 'closest'], 1), 'closest');
});

test('targetingModeLabel has a human label for every mode', () => {
  for (const mode of ALL_TARGETING_MODES) {
    assert.equal(typeof targetingModeLabel(mode), 'string');
    assert.notEqual(targetingModeLabel(mode), '');
  }
});

test('isAbilityReady is true at zero or negative cooldown, false while still cooling down', () => {
  assert.equal(isAbilityReady(0), true);
  assert.equal(isAbilityReady(-0.001), true);
  assert.equal(isAbilityReady(0.5), false);
});

// Added after the panel offered to sell a freshly placed Scout for nothing. Two
// mistakes produced that one answer: the placement price lives in baseCost rather
// than in level zero's cost, and the refund is a fraction rather than a percentage
// out of a hundred. Either alone rounds a small refund to zero.
test('the sell value is real money, computed against the real roster', async () => {
  const { loadGameData } = await import('../../src/data/loader.js');
  const data = loadGameData();
  const scout = data.towers.get('scout');

  const atPlacement = deriveSellValue(scout, 0);
  assert.ok(
    atPlacement > 0,
    'a tower that cost $' + scout.baseCost + ' cannot sell for ' + atPlacement,
  );
  assert.equal(atPlacement, Math.floor(scout.baseCost * scout.sellRefundFraction));

  const upgraded = deriveSellValue(scout, 1);
  assert.ok(upgraded > atPlacement, 'upgrading a tower must raise what it sells for');
  assert.equal(
    upgraded,
    Math.floor((scout.baseCost + scout.levels[1].cost) * scout.sellRefundFraction),
  );

  // Nothing may ever refund more than was put in, on any tower at any level.
  for (const tower of data.towers.values()) {
    for (let level = 0; level < tower.levels.length; level += 1) {
      const spent = tower.baseCost +
        tower.levels.filter((l) => l.level > 0 && l.level <= level).reduce((s, l) => s + l.cost, 0);
      assert.ok(
        deriveSellValue(tower, level) <= spent,
        tower.id + ' at level ' + level + ' refunds more than it cost, which prints money',
      );
    }
  }
});

// The invariant that matters more than either number: what the panel promises and what
// the simulation pays must be the same, for every tower at every level. They are
// computed in two files on purpose, so they can drift, so this asserts they do not.
test('the sell value on the button is exactly what the simulation pays out', async () => {
  const { loadGameData } = await import('../../src/data/loader.js');
  const { createMatch, submitCommand, runTicks } = await import('../../src/sim/core/match.js');
  const data = loadGameData();

  for (const tower of data.towers.values()) {
    const match = createMatch({ gameData: data, seed: 3, mapId: 'crossroads', difficultyId: 'easy' });
    match.state.cash = 1_000_000;
    submitCommand(match, 'PlaceTower', { towerId: tower.id, x: 8, y: 36 });
    runTicks(match, 3);
    if (match.state.towers.length === 0) continue; // terrain it cannot stand on

    const promised = deriveSellValue(tower, 0);
    const before = match.state.cash;
    submitCommand(match, 'SellTower', { seq: match.state.towers[0].seq });
    runTicks(match, 3);
    const paid = match.state.cash - before;

    assert.equal(
      paid,
      promised,
      tower.id + ': the panel promised ' + promised + ' and the simulation paid ' + paid,
    );
  }
});
