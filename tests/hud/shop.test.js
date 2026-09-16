import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeContext } from './fake-context.js';
import { ShopHud } from '../../src/render/hud/shop.js';

const SOURCE = { wikiUrl: 'about:blank', retrievedAt: '2026-01-01' };

function towerDef(overrides = {}) {
  return {
    id: 'gunner',
    displayName: 'Gunner',
    baseCost: 100,
    allowedTerrain: ['ground'],
    placementPool: 'default',
    maxCount: null,
    sellRefundPercent: 70,
    footprintRadius: 1,
    targetingModes: ['first'],
    levels: [{ level: 0, cost: 0, damage: 10, fireRate: 1, range: 20, detectsHidden: false, hitsAir: false, source: SOURCE }],
    source: SOURCE,
    ...overrides,
  };
}

function towersMap() {
  return new Map([
    ['gunner', towerDef({ id: 'gunner', displayName: 'Gunner', baseCost: 100 })],
    ['bank', towerDef({ id: 'bank', displayName: 'Bank', baseCost: 250, placementPool: 'economy', maxCount: 1 })],
    ['spotter', towerDef({ id: 'spotter', displayName: 'Spotter', baseCost: 9999 })],
  ]);
}

const RECT = { x: 0, y: 0, width: 300, height: 800 };

test('shop hitTest returns buyTower for a click inside an affordable card', () => {
  const ctx = createFakeContext();
  const shop = new ShopHud();
  shop.draw(ctx, RECT, { towers: towersMap(), cash: 500, placementPoolCounts: new Map() });

  const entry = shop._entries.get('gunner');
  assert.ok(entry.rect, 'gunner card was laid out');
  assert.equal(entry.disabled, false);
  const cx = entry.rect.x + entry.rect.width / 2;
  const cy = entry.rect.y + entry.rect.height / 2;
  assert.deepEqual(shop.hitTest(cx, cy), { kind: 'buyTower', towerId: 'gunner' });
});

test('shop hitTest returns null for a click inside a card disabled by the placement pool cap', () => {
  const ctx = createFakeContext();
  const shop = new ShopHud();
  const placementPoolCounts = new Map([['economy', 1]]);
  shop.draw(ctx, RECT, { towers: towersMap(), cash: 10000, placementPoolCounts });

  const entry = shop._entries.get('bank');
  assert.equal(entry.disabled, true);
  assert.equal(entry.disabledReason, 'Pool limit reached (1)');
  const cx = entry.rect.x + entry.rect.width / 2;
  const cy = entry.rect.y + entry.rect.height / 2;
  assert.equal(shop.hitTest(cx, cy), null, 'a disabled card must never fire buyTower');
});

test('shop hitTest returns null for a click inside a card that is unaffordable', () => {
  const ctx = createFakeContext();
  const shop = new ShopHud();
  shop.draw(ctx, RECT, { towers: towersMap(), cash: 50, placementPoolCounts: new Map() });

  const entry = shop._entries.get('spotter');
  assert.equal(entry.disabled, true);
  assert.equal(entry.disabledReason, 'Need 9949 more cash');
  const cx = entry.rect.x + entry.rect.width / 2;
  const cy = entry.rect.y + entry.rect.height / 2;
  assert.equal(shop.hitTest(cx, cy), null);
});

test('shop hitTest returns null for a click outside the panel entirely', () => {
  const ctx = createFakeContext();
  const shop = new ShopHud();
  shop.draw(ctx, RECT, { towers: towersMap(), cash: 500, placementPoolCounts: new Map() });
  assert.equal(shop.hitTest(-50, -50), null);
});

test('shop disallows a tower forbidden by the active difficulty, naming the reason', () => {
  const ctx = createFakeContext();
  const shop = new ShopHud();
  shop.draw(ctx, RECT, { towers: towersMap(), cash: 100000, placementPoolCounts: new Map(), disallowedTowerIds: ['gunner'] });
  const entry = shop._entries.get('gunner');
  assert.equal(entry.disabled, true);
  assert.equal(entry.disabledReason, 'Not allowed on this difficulty');
});

test('shop accessibilityControls lists exactly one control per tower, and every disabled one names its reason', () => {
  const ctx = createFakeContext();
  const shop = new ShopHud();
  shop.draw(ctx, RECT, { towers: towersMap(), cash: 150, placementPoolCounts: new Map() });
  const controls = shop.accessibilityControls();
  assert.equal(controls.length, 3, 'one control per tower in the roster');
  const gunner = controls.find((c) => c.action.towerId === 'gunner');
  assert.equal(gunner.disabled, false);
  const spotter = controls.find((c) => c.action.towerId === 'spotter');
  assert.equal(spotter.disabled, true);
  assert.ok(spotter.label.includes('Need'), 'the mirror label states the unmet condition, not just "disabled"');
});

test('shop setHover only marks the button under the given point as hovered', () => {
  const ctx = createFakeContext();
  const shop = new ShopHud();
  shop.draw(ctx, RECT, { towers: towersMap(), cash: 500, placementPoolCounts: new Map() });
  const gunnerEntry = shop._entries.get('gunner');
  const bankEntry = shop._entries.get('bank');
  const cx = gunnerEntry.rect.x + gunnerEntry.rect.width / 2;
  const cy = gunnerEntry.rect.y + gunnerEntry.rect.height / 2;
  shop.setHover(cx, cy);
  assert.equal(gunnerEntry.button.hovered, true);
  assert.equal(bankEntry.button.hovered, false);
});
