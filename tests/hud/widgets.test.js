import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeContext } from './fake-context.js';
import { wrapText, wrappedTextHeight, resolveButtonVisualState, Button, containsPoint } from '../../src/render/hud/widgets.js';

// The fake context measures 7px per character, so these widths are chosen to
// land exactly on a word boundary rather than relying on a guessed pixel count.

test('wrapText keeps everything on one line when it fits the given width', () => {
  const ctx = createFakeContext();
  const lines = wrapText(ctx, 'Need 100 cash', 200);
  assert.deepEqual(lines, ['Need 100 cash']);
});

test('wrapText breaks onto a new line only once the next word would overflow the measured width', () => {
  const ctx = createFakeContext();
  // "Pool limit reached (2)" is 23 chars = 161px. Constrain to 100px (~14 chars)
  // so it must wrap, and assert every line individually measures within bounds.
  const lines = wrapText(ctx, 'Pool limit reached (2)', 100);
  assert.ok(lines.length > 1, 'text wider than the max width produces more than one line');
  for (const line of lines) {
    assert.ok(ctx.measureText(line).width <= 100, `line "${line}" must fit within the measured width`);
  }
  assert.equal(lines.join(' '), 'Pool limit reached (2)', 'wrapping never drops or reorders words');
});

test('wrapText never splits a single word even if it alone exceeds maxWidth', () => {
  const ctx = createFakeContext();
  const lines = wrapText(ctx, 'Supercalifragilisticexpialidocious', 10);
  assert.deepEqual(lines, ['Supercalifragilisticexpialidocious']);
});

test('wrapText treats empty/whitespace-only text as a single empty line, never throws', () => {
  const ctx = createFakeContext();
  assert.deepEqual(wrapText(ctx, '', 100), ['']);
  assert.deepEqual(wrapText(ctx, '   ', 100), ['']);
});

test('wrappedTextHeight multiplies line count by line height, minimum one line', () => {
  assert.equal(wrappedTextHeight(3, 14), 42);
  assert.equal(wrappedTextHeight(0, 14), 14, 'zero lines still reserves one line of height');
});

test('resolveButtonVisualState prioritises disabled over pressed over hovered over normal', () => {
  assert.equal(resolveButtonVisualState({ disabled: true, pressed: true, hovered: true }), 'disabled');
  assert.equal(resolveButtonVisualState({ pressed: true, hovered: true }), 'pressed');
  assert.equal(resolveButtonVisualState({ hovered: true }), 'hovered');
  assert.equal(resolveButtonVisualState({}), 'normal');
});

test('Button.hitTest returns its action when the point is inside the drawn rect', () => {
  const ctx = createFakeContext();
  const button = new Button({ id: 'buy', action: { kind: 'buyTower', towerId: 'gunner' } });
  button.draw(ctx, { x: 0, y: 0, width: 100, height: 40 }, { label: 'Buy' });
  assert.deepEqual(button.hitTest(50, 20, false), { kind: 'buyTower', towerId: 'gunner' });
});

test('Button.hitTest returns null when the point is outside the drawn rect', () => {
  const ctx = createFakeContext();
  const button = new Button({ id: 'buy', action: { kind: 'buyTower', towerId: 'gunner' } });
  button.draw(ctx, { x: 0, y: 0, width: 100, height: 40 }, { label: 'Buy' });
  assert.equal(button.hitTest(500, 500, false), null);
});

test('Button.hitTest returns null for a disabled button even when the point is inside', () => {
  const ctx = createFakeContext();
  const button = new Button({ id: 'buy', action: { kind: 'buyTower', towerId: 'gunner' } });
  button.draw(ctx, { x: 0, y: 0, width: 100, height: 40 }, { label: 'Buy', disabled: true });
  assert.equal(button.hitTest(50, 20, true), null, 'a decorative-looking disabled control must never fire its action');
});

test('Button exposes both draw and the rect it was last drawn at, for the owning panel to hit test against', () => {
  const ctx = createFakeContext();
  const button = new Button({ id: 'x', action: { kind: 'togglePause' } });
  assert.equal(button.rect, null, 'no rect before the first draw');
  const rect = { x: 5, y: 5, width: 10, height: 10 };
  button.draw(ctx, rect, { label: 'Pause' });
  assert.deepEqual(button.rect, rect);
  assert.equal(containsPoint(button.rect, 6, 6), true);
});
