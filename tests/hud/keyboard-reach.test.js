/**
 * Everything the interface draws can be reached without a mouse.
 *
 * The interface is painted onto a canvas, so none of it is reachable by keyboard on its
 * own: a canvas has no focusable children and a drawn button is a rectangle of colour.
 * What makes it reachable is the hidden mirror, which keeps one real `<button>` per
 * drawn control.
 *
 * That arrangement has a specific failure: adding a control to the drawing and
 * forgetting it in the mirror. The control works perfectly for anyone with a mouse and
 * does not exist at all for anyone without one, and nothing about it looks wrong. So
 * this compares the two directly -- every action the interface will respond to a click
 * on must also be something the mirror offers.
 */
import { test } from 'node:test';
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setCanvasFactory, useDefaultCanvasFactory, clearArtCache } from '../../src/render/art/cache.js';
import { fakeCanvasFactory } from '../art/support/fake-context.js';
import { createFakeContext } from './fake-context.js';
import { createFakeHost } from './fake-dom.js';
import { InterfaceLayer } from '../../src/render/hud/interface-layer.js';
import { makeGameData } from '../fixtures/game-data.js';

before(() => {
  clearArtCache();
  setCanvasFactory(fakeCanvasFactory());
});
after(() => {
  useDefaultCanvasFactory();
  clearArtCache();
});

const VIEWPORT = { x: 0, y: 0, width: 1280, height: 800 };

/**
 * Draw the interface with a tower selected, mounted so the mirror is live.
 * @param {{paused?: boolean}} [options]
 */
function drawMounted(options = {}) {
  const gameData = makeGameData();
  const ctx = createFakeContext();
  const { doc, host } = createFakeHost();
  const layer = new InterfaceLayer({ doc });
  layer.mountAccessibilityMirror(host);

  layer.draw(ctx, VIEWPORT, {
    snapshot: {
      cash: 100000,
      lives: 100,
      waveIndex: 3,
      phase: 'active',
      intermissionSecondsRemaining: 0,
      leakCount: 0,
      towers: [{
        id: 1, defId: 'captain', level: 0, x: 0, y: 0,
        targetingMode: 'first', abilityCooldownRemainingSeconds: 0, totalSpent: 300,
      }],
      enemies: [],
      projectiles: [],
      events: [],
    },
    gameData,
    totalWaves: 40,
    // Captain has an ability, so the ability button is drawn too. A tower without one
    // would leave that control untested and this check quietly narrower.
    selectedTowerId: 1,
    placingTowerDefId: null,
    paused: !!options.paused,
    uiScale: 1,
  });

  return { layer, host };
}

/**
 * Every distinct action a click anywhere in the viewport could produce.
 *
 * Swept rather than read from the widgets, because reading the widgets would ask the
 * same objects the mirror asks and agree with itself. A sweep asks the question a
 * player's mouse asks.
 * @param {InterfaceLayer} layer
 */
function clickableActions(layer) {
  const found = new Map();
  for (let x = 2; x < VIEWPORT.width; x += 4) {
    for (let y = 2; y < VIEWPORT.height; y += 4) {
      const action = layer.hitTest(x, y);
      if (!action || action.kind === 'overlayBlocked') continue;
      found.set(describe(action), action);
    }
  }
  return found;
}

/**
 * The mirrored buttons. The mirror appends its own container to the host, so the
 * buttons are one level down rather than direct children.
 * @param {any} host
 */
function mirroredButtons(host) {
  return host.children.flatMap((child) => child.children);
}

/** A stable name for an action, so the same button twice is one entry. */
function describe(action) {
  const parts = [action.kind];
  if (action.towerId != null) parts.push('tower:' + action.towerId);
  if (action.defId != null) parts.push('def:' + action.defId);
  if (action.overlayKind != null) parts.push('overlay:' + action.overlayKind);
  return parts.join('/');
}

test('every control a click can reach is also offered by the accessibility mirror', () => {
  const { layer, host } = drawMounted();
  const clickable = clickableActions(layer);
  assert.ok(clickable.size >= 4, 'the sweep found only ' + clickable.size + ' controls, so it is not sweeping');

  const mirrored = new Set(
    mirroredButtons(host).map((el) => describe(el._interfaceAction ?? { kind: 'unknown' })),
  );

  const unreachable = [...clickable.keys()].filter((key) => !mirrored.has(key));
  assert.deepEqual(
    unreachable,
    [],
    'these controls can be clicked but not reached without a mouse: ' + unreachable.join(', '),
  );
});

test('every mirrored control has a real accessible name', () => {
  // A button with no name is a button a screen reader announces as "button", which is
  // reachable and useless.
  const { host } = drawMounted();
  assert.ok(mirroredButtons(host).length > 0, 'the mirror is empty');
  for (const el of mirroredButtons(host)) {
    const label = el.getAttribute('aria-label');
    assert.ok(label && label.trim().length > 2, 'a mirrored control has no usable name: ' + JSON.stringify(label));
    assert.equal(el.tagName.toLowerCase(), 'button', 'mirrored controls must be real buttons');
  }
});

test('a disabled control says so to assistive technology, not just visually', () => {
  // Whichever controls the interface has marked disabled this frame must carry the
  // attribute too. Visually greying a button out tells a sighted user; aria-disabled is
  // what tells everyone else.
  const { host } = drawMounted();
  const disabled = mirroredButtons(host).filter((el) => el.disabled);
  for (const el of disabled) {
    assert.equal(
      el.getAttribute('aria-disabled'),
      'true',
      'a disabled control is not announced as disabled: ' + el.getAttribute('aria-label'),
    );
  }
});

test('the pause control renames itself, so its name matches what it does', () => {
  // A button labelled "Pause" that resumes is worse than an unlabelled one, because a
  // screen reader user has no way to notice the mismatch.
  const running = drawMounted({ paused: false });
  const paused = drawMounted({ paused: true });
  const nameOf = (host) => mirroredButtons(host)
    .map((el) => el.getAttribute('aria-label'))
    .find((label) => label === 'Pause' || label === 'Resume');

  assert.equal(nameOf(running.host), 'Pause');
  assert.equal(nameOf(paused.host), 'Resume');
});

test('the mirror swaps to the overlay controls when an overlay takes over', () => {
  // A modal overlay swallows clicks on everything behind it. If the mirror kept
  // offering those controls, a keyboard user could operate a battlefield a mouse user
  // cannot even see.
  const gameData = makeGameData();
  const ctx = createFakeContext();
  const { doc, host } = createFakeHost();
  const layer = new InterfaceLayer({ doc });
  layer.mountAccessibilityMirror(host);

  const base = {
    cash: 100000, lives: 100, waveIndex: 1, intermissionSecondsRemaining: 0,
    leakCount: 0, towers: [], enemies: [], projectiles: [], events: [],
  };
  const state = (phase) => ({
    snapshot: { ...base, phase },
    gameData, totalWaves: 40, selectedTowerId: null,
    placingTowerDefId: null, paused: false, uiScale: 1,
  });

  layer.draw(ctx, VIEWPORT, state('intermission'));
  const beforeCount = mirroredButtons(host).length;
  assert.ok(beforeCount > 1, 'the interface offered almost nothing to begin with');

  // Moving to a wave opens the wave-start overlay.
  layer.draw(ctx, VIEWPORT, state('active'));
  const names = mirroredButtons(host).map((el) => el.getAttribute('aria-label'));
  assert.deepEqual(names, ['Continue'], 'the mirror still offers: ' + names.join(', '));
});
