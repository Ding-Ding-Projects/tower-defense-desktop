/**
 * The ability control reaches the interface for a tower that really has one.
 *
 * The interface has drawn an ability button since the first pass, and every check of it
 * ran against the synthetic fixture's Captain. Nothing on disk had an ability, so in
 * the shipped game that control had never been drawn, never been mirrored for keyboard
 * users, and never been pressed. Freezer's Frost Grenade is the first real one, and
 * this asks the question against the real roster rather than the fixture.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { setCanvasFactory, useDefaultCanvasFactory, clearArtCache } from '../../src/render/art/cache.js';
import { fakeCanvasFactory } from '../art/support/fake-context.js';
import { createFakeContext } from './fake-context.js';
import { createFakeHost } from './fake-dom.js';
import { InterfaceLayer } from '../../src/render/hud/interface-layer.js';
import { loadGameData } from '../../src/data/loader.js';

before(() => {
  clearArtCache();
  setCanvasFactory(fakeCanvasFactory());
});
after(() => {
  useDefaultCanvasFactory();
  clearArtCache();
});

const VIEWPORT = { x: 0, y: 0, width: 1280, height: 800 };
const gameData = loadGameData();

/**
 * Draw the interface with one real tower selected, at a given level.
 * @param {string} defId
 * @param {number} level
 */
function drawWithSelected(defId, level) {
  const ctx = createFakeContext();
  const { doc, host } = createFakeHost();
  const layer = new InterfaceLayer({ doc });
  layer.mountAccessibilityMirror(host);

  layer.draw(ctx, VIEWPORT, {
    snapshot: {
      cash: 100000, lives: 100, waveIndex: 3, phase: 'active',
      intermissionSecondsRemaining: 0, leakCount: 0,
      towers: [{
        id: 1, defId, level, x: 20, y: 20,
        targetingMode: 'first', abilityCooldownRemainingSeconds: 0, totalSpent: 1000,
      }],
      enemies: [], projectiles: [], events: [],
    },
    gameData,
    totalWaves: 40,
    selectedTowerId: 1,
    placingTowerDefId: null,
    paused: false,
    uiScale: 1,
  });

  const buttons = host.children.flatMap((child) => child.children);
  return {
    labels: buttons.map((el) => el.getAttribute('aria-label')),
    actions: buttons.map((el) => el._interfaceAction?.kind),
  };
}

test('a shipped tower at a level with an ability offers the control', () => {
  const freezer = gameData.towers.get('freezer');
  assert.ok(freezer.levels[4].ability, 'Freezer level 4 has no ability, so this proves nothing');

  const { actions, labels } = drawWithSelected('freezer', 4);
  assert.ok(
    actions.includes('useAbility'),
    'a real tower with an ability offers no ability control. Mirror shows: ' + labels.join(', '),
  );
});

test('the control is named after the ability, not labelled generically', () => {
  // "Ability" tells a screen reader nothing. The page calls it a Frost Grenade and so
  // should the button.
  const name = gameData.towers.get('freezer').levels[4].ability.displayName;
  const { labels } = drawWithSelected('freezer', 4);
  assert.ok(
    labels.some((label) => label && label.includes(name)),
    'no mirrored control mentions "' + name + '": ' + labels.join(', '),
  );
});

test('the same tower below that level offers no ability control', () => {
  // The grenade arrives at level 4. A control offered at level 3 would be a button that
  // cannot work, which is the decorative-control defect in its purest form.
  assert.equal(gameData.towers.get('freezer').levels[3].ability, undefined);
  const { actions } = drawWithSelected('freezer', 3);
  assert.ok(
    !actions.includes('useAbility'),
    'the ability control is offered at a level that has no ability',
  );
});
