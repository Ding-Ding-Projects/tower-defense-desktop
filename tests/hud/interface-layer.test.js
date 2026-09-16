import { test } from 'node:test';
import { before, after } from 'node:test';
import { setCanvasFactory, useDefaultCanvasFactory, clearArtCache } from '../../src/render/art/cache.js';
import { fakeCanvasFactory } from '../art/support/fake-context.js';

// The shop draws each tower's real sprite in its card, so this module now reaches the
// art cache, and the art cache wants a canvas. There is no document under `node --test`,
// so the same fake factory the art checks use is installed here. Swapping it rather than
// letting the shop shrug off a missing canvas is deliberate: a shop that silently falls
// back to a letter when sprite drawing breaks would hide exactly the regression this
// change exists to prevent.
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
import { createFakeHost } from './fake-dom.js';
import { InterfaceLayer } from '../../src/render/hud/interface-layer.js';

const SOURCE = { wikiUrl: 'about:blank', retrievedAt: '2026-01-01' };
const VIEWPORT = { x: 0, y: 0, width: 1200, height: 800 };

function gameData() {
  return {
    towers: new Map([
      ['gunner', {
        id: 'gunner', displayName: 'Gunner', baseCost: 100, allowedTerrain: ['ground'],
        placementPool: 'default', maxCount: null, sellRefundFraction: 0.7, footprintRadius: 1,
        targetingModes: ['first', 'closest'],
        levels: [
          { level: 0, cost: 0, damage: 10, fireRate: 1, range: 20, detectsHidden: false, hitsAir: false, source: SOURCE },
          { level: 1, cost: 150, damage: 25, fireRate: 1, range: 25, detectsHidden: false, hitsAir: false, source: SOURCE },
        ],
        source: SOURCE,
      }],
    ]),
  };
}

function baseState(overrides = {}) {
  return {
    snapshot: {
      cash: 500,
      lives: 20,
      waveIndex: 1,
      phase: 'intermission',
      intermissionSecondsRemaining: 5,
      towers: [],
      ...overrides.snapshot,
    },
    gameData: gameData(),
    totalWaves: 3,
    selectedTowerId: null,
    placingTowerDefId: null,
    disallowedTowerIds: [],
    paused: false,
    ...overrides,
  };
}

test('draw() never throws given a full state and hitTest(x,y) returns null for a battlefield click', () => {
  const ctx = createFakeContext();
  const layer = new InterfaceLayer({ doc: null });
  layer.draw(ctx, VIEWPORT, baseState());
  // Dead center of a 1200-wide viewport with a right-hand sidebar is comfortably battlefield.
  assert.equal(layer.hitTest(400, 400), null);
});

test('buyTower fires from a click on an affordable shop card', () => {
  const ctx = createFakeContext();
  const layer = new InterfaceLayer({ doc: null });
  layer.draw(ctx, VIEWPORT, baseState());
  const entry = layer._shop._entries.get('gunner');
  assert.ok(entry?.rect, 'the shop laid out a card for the only tower in the roster');
  const action = layer.hitTest(entry.rect.x + entry.rect.width / 2, entry.rect.y + entry.rect.height / 2);
  assert.deepEqual(action, { kind: 'buyTower', towerId: 'gunner' });
});

test('selecting a tower shows the tower panel and sellTower fires from its sell button', () => {
  const ctx = createFakeContext();
  const layer = new InterfaceLayer({ doc: null });
  const state = baseState({
    snapshot: { towers: [{ id: 't1', defId: 'gunner', level: 0, targetingMode: 'first', abilityCooldownRemainingSeconds: 0 }] },
    selectedTowerId: 't1',
  });
  layer.draw(ctx, VIEWPORT, state);
  assert.equal(layer._towerPanel.visible, true);
  const rect = layer._towerPanel._sellButton.rect;
  assert.ok(rect);
  const action = layer.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert.deepEqual(action, { kind: 'sellTower' });
});

test('the HUD skip and pause controls fire from the top bar', () => {
  const ctx = createFakeContext();
  const layer = new InterfaceLayer({ doc: null });
  layer.draw(ctx, VIEWPORT, baseState({ snapshot: { phase: 'intermission' } }));
  const skipRect = layer._hud._skipButton.rect;
  assert.deepEqual(layer.hitTest(skipRect.x + skipRect.width / 2, skipRect.y + skipRect.height / 2), { kind: 'skipIntermission' });

  const pauseRect = layer._hud._pauseButton.rect;
  assert.deepEqual(layer.hitTest(pauseRect.x + pauseRect.width / 2, pauseRect.y + pauseRect.height / 2), { kind: 'togglePause' });
});

test('a phase transition from intermission to active opens the wave-start overlay and blocks the battlefield underneath it', () => {
  const ctx = createFakeContext();
  const layer = new InterfaceLayer({ doc: null });
  layer.draw(ctx, VIEWPORT, baseState({ snapshot: { phase: 'intermission' } })); // boot frame: no overlay yet
  assert.equal(layer.hitTest(400, 400), null, 'no overlay on the very first frame');

  layer.draw(ctx, VIEWPORT, baseState({ snapshot: { phase: 'active' } }));
  const blocked = layer.hitTest(400, 400);
  assert.deepEqual(blocked, { kind: 'overlayBlocked' }, 'the battlefield click is swallowed by the modal overlay');

  const dismissRect = layer._overlaysHud._button.rect;
  const dismissAction = layer.hitTest(dismissRect.x + dismissRect.width / 2, dismissRect.y + dismissRect.height / 2);
  assert.deepEqual(dismissAction, { kind: 'dismissOverlay', overlayKind: 'waveStart' });

  // Redraw at the same phase: the overlay must stay dismissed rather than
  // reappearing every frame just because the phase has not changed again.
  layer.draw(ctx, VIEWPORT, baseState({ snapshot: { phase: 'active' } }));
  assert.equal(layer.hitTest(400, 400), null, 'battlefield clicks reach the battlefield again once the overlay is dismissed');
});

test('victory and defeat phases open their own overlay with the exact right action', () => {
  const ctx = createFakeContext();
  const layer = new InterfaceLayer({ doc: null });
  layer.draw(ctx, VIEWPORT, baseState({ snapshot: { phase: 'intermission' } }));
  layer.draw(ctx, VIEWPORT, baseState({ snapshot: { phase: 'victory' } }));
  const rect = layer._overlaysHud._button.rect;
  assert.deepEqual(layer.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2), { kind: 'dismissOverlay', overlayKind: 'victory' });
});

test('setHover updates hover state on the control under the point without throwing when nothing is under it', () => {
  const ctx = createFakeContext();
  const layer = new InterfaceLayer({ doc: null });
  layer.draw(ctx, VIEWPORT, baseState());
  const entry = layer._shop._entries.get('gunner');
  layer.setHover(entry.rect.x + entry.rect.width / 2, entry.rect.y + entry.rect.height / 2);
  assert.equal(entry.button.hovered, true);
  layer.setHover(-999, -999);
});

test('scrollShop delegates to the shop panel without throwing', () => {
  const ctx = createFakeContext();
  const layer = new InterfaceLayer({ doc: null });
  layer.draw(ctx, VIEWPORT, baseState());
  layer.scrollShop(40);
  assert.equal(layer._shop._scrollOffset > 0, true);
});

test('mounting the accessibility mirror exposes real controls, and activating one dispatches the same action as a canvas click', () => {
  const { doc, host } = createFakeHost();
  const ctx = createFakeContext();
  const layer = new InterfaceLayer({ doc });
  layer.mountAccessibilityMirror(host);
  layer.draw(ctx, VIEWPORT, baseState());

  assert.ok(layer._mirror.size >= 3, 'at least the shop card plus skip/pause are mirrored');

  const dispatched = [];
  host.addEventListener('interface-action', (e) => dispatched.push(e.detail));

  const skipButton = [...layer._mirror._elements.values()].find((el) => el.textContent === 'Skip intermission');
  assert.ok(skipButton, 'a real, correctly-labelled mirror control exists for the skip action');
  skipButton.click();
  assert.deepEqual(dispatched, [{ kind: 'skipIntermission' }]);
});

test('dismissing the overlay through the accessibility mirror clears it exactly like a canvas click on the dismiss button', () => {
  const { doc, host } = createFakeHost();
  const ctx = createFakeContext();
  const layer = new InterfaceLayer({ doc });
  layer.mountAccessibilityMirror(host);
  layer.draw(ctx, VIEWPORT, baseState({ snapshot: { phase: 'intermission' } }));
  layer.draw(ctx, VIEWPORT, baseState({ snapshot: { phase: 'active' } }));

  const dispatched = [];
  host.addEventListener('interface-action', (e) => dispatched.push(e.detail));
  const dismissButton = [...layer._mirror._elements.values()].find((el) => el.textContent === 'Continue');
  assert.ok(dismissButton, 'the wave-start overlay mirrors its Continue action');
  dismissButton.click();
  assert.deepEqual(dispatched, [{ kind: 'dismissOverlay', overlayKind: 'waveStart' }]);
  assert.equal(layer.hitTest(400, 400), null, 'the overlay is gone from the internal state too, not just reported as dismissed');
});

test('destroy() unmounts the accessibility mirror', () => {
  const { doc, host } = createFakeHost();
  const ctx = createFakeContext();
  const layer = new InterfaceLayer({ doc });
  layer.mountAccessibilityMirror(host);
  layer.draw(ctx, VIEWPORT, baseState());
  assert.ok(host.children.length > 0);
  layer.destroy();
  assert.equal(host.children.length, 0);
});
