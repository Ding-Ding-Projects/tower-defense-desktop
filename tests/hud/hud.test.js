import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeContext } from './fake-context.js';
import { GameHud } from '../../src/render/hud/hud.js';

const RECT = { x: 0, y: 0, width: 900, height: 100 };

function state(overrides = {}) {
  return {
    cash: 500,
    lives: 20,
    waveIndex: 2,
    totalWaves: 10,
    phase: 'intermission',
    intermissionSecondsRemaining: 8,
    paused: false,
    ...overrides,
  };
}

test('skipIntermission fires when the skip button is clicked during intermission', () => {
  const ctx = createFakeContext();
  const hud = new GameHud();
  hud.draw(ctx, RECT, state({ phase: 'intermission' }));
  const rect = hud._skipButton.rect;
  const action = hud.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert.deepEqual(action, { kind: 'skipIntermission' });
});

test('skipIntermission never fires while a wave is active', () => {
  const ctx = createFakeContext();
  const hud = new GameHud();
  hud.draw(ctx, RECT, state({ phase: 'active' }));
  const rect = hud._skipButton.rect;
  const action = hud.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert.equal(action, null, 'a decorative-looking disabled skip control must never fire');
});

test('togglePause fires regardless of phase', () => {
  const ctx = createFakeContext();
  const hud = new GameHud();
  hud.draw(ctx, RECT, state({ phase: 'active' }));
  const rect = hud._pauseButton.rect;
  const action = hud.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert.deepEqual(action, { kind: 'togglePause' });
});

test('a click outside the HUD bar returns null', () => {
  const ctx = createFakeContext();
  const hud = new GameHud();
  hud.draw(ctx, RECT, state());
  assert.equal(hud.hitTest(0, 9999), null);
});

test('measureBarHeight falls back to a taller, two-row layout when the stats and buttons do not fit one row', () => {
  const ctx = createFakeContext();
  const hud = new GameHud();
  const wideHeight = hud.measureBarHeight(ctx, 2000, state());
  const narrowHeight = hud.measureBarHeight(ctx, 200, state());
  assert.ok(narrowHeight > wideHeight, 'a narrow viewport needs a taller bar to avoid clipping/overlap');
});

test('accessibilityControls names the pause/resume state and the skip disabled state', () => {
  const ctx = createFakeContext();
  const hud = new GameHud();
  hud.draw(ctx, RECT, state({ phase: 'active' }));
  const controls = hud.accessibilityControls(true);
  const pause = controls.find((c) => c.key === 'hud-pause');
  assert.equal(pause.label, 'Resume');
  const skip = controls.find((c) => c.key === 'hud-skip');
  assert.equal(skip.disabled, true);
});
