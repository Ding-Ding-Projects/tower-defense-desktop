import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeHost } from './fake-dom.js';
import { AccessibilityMirror } from '../../src/render/hud/a11y-mirror.js';

test('sync creates exactly one real, focusable control per interactive control given', () => {
  const { doc, host } = createFakeHost();
  const mirror = new AccessibilityMirror(doc);
  mirror.mount(host);

  mirror.sync(
    [
      { key: 'buy-gunner', label: 'Buy Gunner for $100', disabled: false, action: { kind: 'buyTower', towerId: 'gunner' } },
      { key: 'buy-bank', label: 'Buy Bank for $250, unavailable: Pool limit reached (1)', disabled: true, action: { kind: 'buyTower', towerId: 'bank' } },
    ],
    () => {},
  );

  assert.equal(mirror.size, 2, 'exactly one element per control, no more, no fewer');
  const buttons = mirror.container.children;
  assert.equal(buttons.length, 2);
  assert.equal(buttons.every((b) => b.tagName === 'button'), true, 'every mirror control is a real focusable element');
  assert.equal(buttons[0].textContent, 'Buy Gunner for $100');
  assert.equal(buttons[0].getAttribute('aria-label'), 'Buy Gunner for $100');
  assert.equal(buttons[0].disabled, false);
  assert.equal(buttons[1].disabled, true, 'a disabled control is a real disabled state, not just styled to look disabled');
});

test('the mirror is visually hidden but never removed from the accessibility tree (no display:none/visibility:hidden)', () => {
  const { doc, host } = createFakeHost();
  const mirror = new AccessibilityMirror(doc);
  mirror.mount(host);
  const style = mirror.container.getAttribute('style');
  assert.ok(style.includes('clip'), 'uses the clip-to-1px visually-hidden technique');
  assert.ok(!style.includes('display:none') && !style.includes('display: none'));
  assert.ok(!style.includes('visibility:hidden') && !style.includes('visibility: hidden'));
});

test('activating a mirror control fires the exact same action a canvas click on it would', () => {
  const { doc, host } = createFakeHost();
  const mirror = new AccessibilityMirror(doc);
  mirror.mount(host);

  const dispatched = [];
  mirror.sync(
    [{ key: 'skip', label: 'Skip intermission', disabled: false, action: { kind: 'skipIntermission' } }],
    (action) => dispatched.push(action),
  );

  mirror.container.children[0].click();
  assert.deepEqual(dispatched, [{ kind: 'skipIntermission' }]);
});

test('a disabled mirror control does not fire its action when clicked', () => {
  const { doc, host } = createFakeHost();
  const mirror = new AccessibilityMirror(doc);
  mirror.mount(host);

  const dispatched = [];
  mirror.sync(
    [{ key: 'upgrade', label: 'Upgrade tower, unavailable', disabled: true, action: { kind: 'upgradeTower', towerId: 't1' } }],
    (action) => dispatched.push(action),
  );

  mirror.container.children[0].click();
  assert.deepEqual(dispatched, []);
});

test('sync reconciles: a control that disappears is removed, a control that stays is reused (not recreated), a new one is added', () => {
  const { doc, host } = createFakeHost();
  const mirror = new AccessibilityMirror(doc);
  mirror.mount(host);

  mirror.sync(
    [
      { key: 'a', label: 'A', disabled: false, action: { kind: 'togglePause' } },
      { key: 'b', label: 'B', disabled: false, action: { kind: 'skipIntermission' } },
    ],
    () => {},
  );
  const elementA = mirror._elements.get('a');

  mirror.sync(
    [
      { key: 'a', label: 'A (updated)', disabled: true, action: { kind: 'togglePause' } },
      { key: 'c', label: 'C', disabled: false, action: { kind: 'sellTower' } },
    ],
    () => {},
  );

  assert.equal(mirror.size, 2, 'b disappeared, c appeared, a stayed: net still two');
  assert.equal(mirror._elements.get('a'), elementA, 'the surviving control reuses its element rather than being torn down and recreated');
  assert.equal(elementA.textContent, 'A (updated)', 'label updates in place');
  assert.equal(elementA.disabled, true);
  assert.equal(mirror._elements.has('b'), false);
  assert.equal(mirror._elements.has('c'), true);
});

test('unmount removes the mirror container and forgets every element', () => {
  const { doc, host } = createFakeHost();
  const mirror = new AccessibilityMirror(doc);
  mirror.mount(host);
  mirror.sync([{ key: 'a', label: 'A', disabled: false, action: {} }], () => {});
  mirror.unmount();
  assert.equal(host.children.length, 0);
  assert.equal(mirror.size, 0);
});
