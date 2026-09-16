import { test } from 'node:test';
import { before, after } from 'node:test';
import { setCanvasFactory, useDefaultCanvasFactory, clearArtCache } from '../../src/render/art/cache.js';
import { fakeCanvasFactory } from '../art/support/fake-context.js';

// The panel draws the tower's own portrait now, so it reaches the art cache, and the
// art cache wants a canvas that `node --test` does not have.
before(() => {
  clearArtCache();
  setCanvasFactory(fakeCanvasFactory());
});
after(() => {
  useDefaultCanvasFactory();
  clearArtCache();
});
import assert from 'node:assert/strict';
import { createFakeContext } from './fake-context.js';
import { TowerPanelHud } from '../../src/render/hud/tower-panel.js';

const SOURCE = { wikiUrl: 'about:blank', retrievedAt: '2026-01-01' };

const TOWER_DEF = {
  id: 'captain',
  displayName: 'Captain',
  baseCost: 300,
  allowedTerrain: ['ground'],
  placementPool: 'default',
  maxCount: null,
  sellRefundFraction: 0.7,
  footprintRadius: 1,
  targetingModes: ['first', 'closest'],
  levels: [
    {
      level: 0, cost: 0, damage: 5, fireRate: 1, range: 20, detectsHidden: false, hitsAir: false,
      ability: { id: 'rally', displayName: 'Rally', cooldownSeconds: 10, effect: 'damageBurst', magnitude: 40 },
      source: SOURCE,
    },
    { level: 1, cost: 150, damage: 15, fireRate: 1.2, range: 22, detectsHidden: false, hitsAir: false, source: SOURCE },
  ],
  source: SOURCE,
};

const RECT = { x: 0, y: 0, width: 260, height: 500 };

function towerInstance(overrides = {}) {
  return { id: 'tower-1', defId: 'captain', level: 0, targetingMode: 'first', abilityCooldownRemainingSeconds: 0, ...overrides };
}

test('is not visible and has no accessibility controls when nothing is selected', () => {
  const ctx = createFakeContext();
  const panel = new TowerPanelHud();
  panel.draw(ctx, RECT, { towerDef: null, tower: null, cash: 0 });
  assert.equal(panel.visible, false);
  assert.equal(panel.hitTest(10, 10), null);
  assert.deepEqual(panel.accessibilityControls(), []);
});

test('upgradeTower fires when the upgrade button is clicked and cash covers it', () => {
  const ctx = createFakeContext();
  const panel = new TowerPanelHud();
  panel.draw(ctx, RECT, { towerDef: TOWER_DEF, tower: towerInstance(), cash: 1000 });
  const rect = panel._upgradeButton.rect;
  assert.ok(rect, 'upgrade button was drawn');
  const action = panel.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert.deepEqual(action, { kind: 'upgradeTower', towerId: 'tower-1' });
});

test('the upgrade button is not clickable when cash is short, and the panel names the shortfall', () => {
  const ctx = createFakeContext();
  const panel = new TowerPanelHud();
  panel.draw(ctx, RECT, { towerDef: TOWER_DEF, tower: towerInstance(), cash: 0 });
  const rect = panel._upgradeButton.rect;
  const action = panel.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert.equal(action, null, 'an unaffordable upgrade must never fire');
  const controls = panel.accessibilityControls();
  const upgradeControl = controls.find((c) => c.key === 'tower-panel-upgrade');
  assert.equal(upgradeControl.disabled, true);
});

test('the upgrade button reports Max level and is never clickable past the last level', () => {
  const ctx = createFakeContext();
  const panel = new TowerPanelHud();
  panel.draw(ctx, RECT, { towerDef: TOWER_DEF, tower: towerInstance({ level: 1 }), cash: 1_000_000 });
  const rect = panel._upgradeButton.rect;
  const action = panel.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert.equal(action, null);
  const controls = panel.accessibilityControls();
  assert.equal(controls.some((c) => c.key === 'tower-panel-upgrade'), false, 'no upgrade control once maxed out');
});

test('sellTower fires when the sell button is clicked', () => {
  const ctx = createFakeContext();
  const panel = new TowerPanelHud();
  panel.draw(ctx, RECT, { towerDef: TOWER_DEF, tower: towerInstance(), cash: 0 });
  const rect = panel._sellButton.rect;
  const action = panel.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert.deepEqual(action, { kind: 'sellTower' });
});

test('cycleTargeting fires when the targeting button is clicked', () => {
  const ctx = createFakeContext();
  const panel = new TowerPanelHud();
  panel.draw(ctx, RECT, { towerDef: TOWER_DEF, tower: towerInstance(), cash: 0 });
  const rect = panel._targetingButton.rect;
  const action = panel.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert.deepEqual(action, { kind: 'cycleTargeting' });
});

test('useAbility fires when the ability is ready', () => {
  const ctx = createFakeContext();
  const panel = new TowerPanelHud();
  panel.draw(ctx, RECT, { towerDef: TOWER_DEF, tower: towerInstance({ abilityCooldownRemainingSeconds: 0 }), cash: 0 });
  const rect = panel._abilityButton.rect;
  assert.ok(rect, 'ability button drawn for a tower with an ability');
  const action = panel.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert.deepEqual(action, { kind: 'useAbility' });
});

test('useAbility never fires while the ability is on cooldown, and the mirror names it', () => {
  const ctx = createFakeContext();
  const panel = new TowerPanelHud();
  panel.draw(ctx, RECT, { towerDef: TOWER_DEF, tower: towerInstance({ abilityCooldownRemainingSeconds: 4.2 }), cash: 0 });
  const rect = panel._abilityButton.rect;
  const action = panel.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert.equal(action, null, 'a decorative-looking cooling-down ability button must never fire');
  const controls = panel.accessibilityControls();
  const abilityControl = controls.find((c) => c.key === 'tower-panel-ability');
  assert.equal(abilityControl.disabled, true);
});

test('no ability button (and no hit test / mirror entry for one) on a tower with no ability at its level', () => {
  const ctx = createFakeContext();
  const panel = new TowerPanelHud();
  panel.draw(ctx, RECT, { towerDef: TOWER_DEF, tower: towerInstance({ level: 1 }), cash: 0 });
  assert.equal(panel._hasAbility, false);
  const controls = panel.accessibilityControls();
  assert.equal(controls.some((c) => c.key === 'tower-panel-ability'), false);
});

test('a click outside every control returns null (belongs to the battlefield)', () => {
  const ctx = createFakeContext();
  const panel = new TowerPanelHud();
  panel.draw(ctx, RECT, { towerDef: TOWER_DEF, tower: towerInstance(), cash: 1000 });
  assert.equal(panel.hitTest(-100, -100), null);
});
