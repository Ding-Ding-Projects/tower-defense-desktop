import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeContext } from './fake-context.js';
import { OverlayHud } from '../../src/render/hud/overlays.js';
import { COPY } from '../../src/render/hud/overlays.js';

const VIEWPORT = { x: 0, y: 0, width: 1200, height: 800 };

test('hitTest returns null when no overlay is showing', () => {
  const ctx = createFakeContext();
  const overlay = new OverlayHud();
  overlay.draw(ctx, VIEWPORT, { kind: null });
  assert.equal(overlay.hitTest(600, 400), null);
  assert.equal(overlay.isBlocking, false);
});

test('dismissOverlay fires, naming which overlay, when its action button is clicked', () => {
  const ctx = createFakeContext();
  const overlay = new OverlayHud();
  overlay.draw(ctx, VIEWPORT, { kind: 'waveStart', payload: { waveIndex: 3, totalWaves: 10 } });
  const rect = overlay._button.rect;
  assert.ok(rect, 'the dismiss button was drawn');
  const action = overlay.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert.deepEqual(action, { kind: 'dismissOverlay', overlayKind: 'waveStart' });
});

test('a click elsewhere on the dimmed viewport is swallowed rather than falling through to the battlefield', () => {
  const ctx = createFakeContext();
  const overlay = new OverlayHud();
  overlay.draw(ctx, VIEWPORT, { kind: 'victory', payload: { totalWaves: 10 } });
  const action = overlay.hitTest(5, 5); // far from the centered card/button
  assert.deepEqual(action, { kind: 'overlayBlocked' }, 'modal overlay must not let a click reach the battlefield underneath it');
  assert.equal(overlay.isBlocking, true);
});

test('every overlay kind has real, non-empty copy and its own dismiss action label', () => {
  const ctx = createFakeContext();
  const overlay = new OverlayHud();
  for (const [kind, payload] of [
    ['waveStart', { waveIndex: 1, totalWaves: 5 }],
    ['waveClear', { waveIndex: 1, completionBonus: 100 }],
    ['victory', { totalWaves: 5 }],
    ['defeat', { waveIndex: 3 }],
  ]) {
    overlay.draw(ctx, VIEWPORT, { kind, payload });
    const controls = overlay.accessibilityControls();
    assert.equal(controls.length, 1, `${kind} exposes exactly one dismiss control`);
    assert.ok(controls[0].label.length > 0, `${kind} has a real action label, never blank`);
    assert.deepEqual(controls[0].action, { kind: 'dismissOverlay', overlayKind: kind });
  }
});

test('drawing kind: null after an overlay clears its accessibility control and its hit testing', () => {
  const ctx = createFakeContext();
  const overlay = new OverlayHud();
  overlay.draw(ctx, VIEWPORT, { kind: 'defeat', payload: { waveIndex: 4 } });
  assert.equal(overlay.accessibilityControls().length, 1);
  overlay.draw(ctx, VIEWPORT, { kind: null });
  assert.equal(overlay.accessibilityControls().length, 0);
  assert.equal(overlay.hitTest(600, 400), null);
});

// Added after the cleared-wave overlay announced "No leaks got through" while the base
// had just lost twenty lives. It said it unconditionally, so it was right exactly as
// often as the player happened to have a perfect wave.
//
// The first version of this check had a fallback branch for the case where the copy
// was not importable. The copy was not importable, so it took the branch, asserted
// nothing, and passed. There is no fallback here now: it imports the real copy or it
// fails to run at all.
test('the cleared-wave message reports the leaks that actually happened', () => {
  const body = COPY.waveClear.body;

  assert.match(body({ waveIndex: 1, leaked: 0, completionBonus: 0 }), /No leaks got through/);
  assert.match(body({ waveIndex: 2, leaked: 1, completionBonus: 0 }), /One got through/);
  assert.match(body({ waveIndex: 3, leaked: 7, completionBonus: 0 }), /7 got through/);
  assert.doesNotMatch(
    body({ waveIndex: 3, leaked: 7, completionBonus: 0 }),
    /No leaks/,
    'a wave that leaked seven may never claim none did',
  );
  assert.match(body({ waveIndex: 4, leaked: 2, completionBonus: 90 }), /Completion bonus: \$90/);
  assert.match(body({ waveIndex: 4, leaked: 2, completionBonus: 90 }), /2 got through/);
});
