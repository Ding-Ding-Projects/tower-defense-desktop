/**
 * The shop and the upgrade panel show the tower, not a letter standing in for it.
 *
 * The lettered box was not a placeholder anybody had forgotten about; it was what the
 * icon slot drew, and it looked deliberate. A shop full of initials reads as unfinished
 * however finished the battlefield behind it is, and it asks the player to learn two
 * vocabularies at once: the shapes on the field, and the letters beside them.
 *
 * The lettered glyph survives as a fallback for a slot with nothing to show, which is
 * exactly why this check exists: a fallback that silently catches a real breakage is
 * worse than no fallback, because the shop still looks plausible while showing nothing
 * it was asked to show.
 */
import { test } from 'node:test';
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setCanvasFactory, useDefaultCanvasFactory, clearArtCache } from '../../src/render/art/cache.js';
import { fakeCanvasFactory } from '../art/support/fake-context.js';
import { createFakeContext } from './fake-context.js';
import { ShopHud } from '../../src/render/hud/shop.js';
import { TowerPanelHud } from '../../src/render/hud/tower-panel.js';
import { makeGameData } from '../fixtures/game-data.js';

before(() => {
  clearArtCache();
  setCanvasFactory(fakeCanvasFactory());
});
after(() => {
  useDefaultCanvasFactory();
  clearArtCache();
});

const RECT = { x: 0, y: 0, width: 320, height: 900 };

test('every shop card draws a portrait rather than a letter', () => {
  const gameData = makeGameData();
  const ctx = createFakeContext();
  new ShopHud().draw(ctx, RECT, {
    towers: gameData.towers,
    cash: 100000,
    placementPoolCounts: new Map(),
    disallowedTowerIds: [],
    selectedDefId: null,
  });

  const portraits = ctx.calls.filter((c) => c[0] === 'drawImage');
  assert.equal(
    portraits.length, gameData.towers.size,
    'expected one portrait per tower card, got ' + portraits.length + ' for ' + gameData.towers.size + ' towers',
  );
  // Each portrait is placed at a real size, not collapsed to nothing.
  for (const call of portraits) {
    const [, , , , width, height] = call;
    assert.ok(width > 0 && height > 0, 'a portrait was drawn at ' + width + 'x' + height);
  }
});

test('an unaffordable card still draws its tower, only dimmed', () => {
  const gameData = makeGameData();
  const ctx = createFakeContext();
  new ShopHud().draw(ctx, RECT, {
    towers: gameData.towers,
    cash: 0,
    placementPoolCounts: new Map(),
    disallowedTowerIds: [],
    selectedDefId: null,
  });
  assert.equal(
    ctx.calls.filter((c) => c[0] === 'drawImage').length, gameData.towers.size,
    'a tower nobody can afford is still a tower the player needs to recognise',
  );
});

test('the upgrade panel draws the tower at the level it is standing at', () => {
  const gameData = makeGameData();
  const towerDef = gameData.towers.get('gunner');
  const panel = new TowerPanelHud();

  const drawAtLevel = (level) => {
    const ctx = createFakeContext();
    panel.draw(ctx, RECT, {
      towerDef,
      tower: {
        id: 1, defId: 'gunner', level, x: 0, y: 0,
        targetingMode: 'first', abilityCooldownRemainingSeconds: 0, totalSpent: 100,
      },
      cash: 100000,
    });
    return ctx;
  };

  const atFirst = drawAtLevel(0);
  assert.equal(atFirst.calls.filter((c) => c[0] === 'drawImage').length, 1, 'the panel shows the tower');

  // Upgrading has to change the picture, not just the numbers beside it. The art cache
  // keys on the level definition, so a panel that passed level 0 regardless would hand
  // back the identical canvas here and this would catch it.
  const atSecond = drawAtLevel(1);
  const first = atFirst.calls.find((c) => c[0] === 'drawImage')[1];
  const second = atSecond.calls.find((c) => c[0] === 'drawImage')[1];
  assert.notEqual(first, second, 'the portrait must change when the tower is upgraded');
});
