import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inset, row, stack, split, containsPoint } from '../../src/render/hud/layout.js';

const BASE = { x: 10, y: 20, width: 300, height: 200 };

test('inset with one amount pads every side equally', () => {
  assert.deepEqual(inset(BASE, 10), { x: 20, y: 30, width: 280, height: 180 });
});

test('inset with two amounts pads (vertical, horizontal)', () => {
  assert.deepEqual(inset(BASE, 5, 10), { x: 20, y: 25, width: 280, height: 190 });
});

test('inset with four amounts pads (top, right, bottom, left) independently', () => {
  const result = inset(BASE, 1, 2, 3, 4);
  assert.deepEqual(result, { x: 14, y: 21, width: 294, height: 196 });
});

test('inset never goes negative when padding exceeds the rect', () => {
  const result = inset({ x: 0, y: 0, width: 10, height: 10 }, 20);
  assert.equal(result.width, 0);
  assert.equal(result.height, 0);
});

test('row splits fixed-size cells left to right with gaps between only', () => {
  const cells = row({ x: 0, y: 0, width: 100, height: 50 }, [20, 30], 10);
  assert.deepEqual(cells[0], { x: 0, y: 0, width: 20, height: 50 });
  assert.deepEqual(cells[1], { x: 30, y: 0, width: 30, height: 50 });
});

test('row shares remaining width evenly among null entries', () => {
  const cells = row({ x: 0, y: 0, width: 100, height: 50 }, [null, 20, null], 0);
  // 100 - 20 fixed = 80 remaining, split across two flex cells -> 40 each
  assert.equal(cells[0].width, 40);
  assert.equal(cells[1].width, 20);
  assert.equal(cells[2].width, 40);
  assert.equal(cells[0].x, 0);
  assert.equal(cells[1].x, 40);
  assert.equal(cells[2].x, 60);
});

test('row returns an empty array for an empty sizes list', () => {
  assert.deepEqual(row(BASE, []), []);
});

test('stack is the vertical mirror of row', () => {
  const cells = stack({ x: 0, y: 0, width: 50, height: 100 }, [null, null], 10);
  assert.equal(cells[0].height, 45);
  assert.equal(cells[1].height, 45);
  assert.equal(cells[0].y, 0);
  assert.equal(cells[1].y, 55);
});

test('split divides a rect horizontally at the given ratio with a gap carved out', () => {
  const [a, b] = split({ x: 0, y: 0, width: 100, height: 40 }, 0.5, 10, 'horizontal');
  assert.equal(a.width, 45);
  assert.equal(b.width, 45);
  assert.equal(b.x, 55);
});

test('split divides a rect vertically at the given ratio', () => {
  const [a, b] = split({ x: 0, y: 0, width: 40, height: 100 }, 0.25, 0, 'vertical');
  assert.equal(a.height, 25);
  assert.equal(b.height, 75);
  assert.equal(b.y, 25);
});

test('split clamps an out-of-range ratio to [0, 1]', () => {
  const [a, b] = split({ x: 0, y: 0, width: 100, height: 10 }, 5, 0, 'horizontal');
  assert.equal(a.width, 100);
  assert.equal(b.width, 0);
  const [c, d] = split({ x: 0, y: 0, width: 100, height: 10 }, -5, 0, 'horizontal');
  assert.equal(c.width, 0);
  assert.equal(d.width, 100);
});

test('containsPoint is true inside and on the edges of a rect, false outside', () => {
  const rect = { x: 10, y: 10, width: 20, height: 20 };
  assert.equal(containsPoint(rect, 20, 20), true);
  assert.equal(containsPoint(rect, 10, 10), true, 'left/top edge counts as inside');
  assert.equal(containsPoint(rect, 30, 30), true, 'right/bottom edge counts as inside');
  assert.equal(containsPoint(rect, 9, 20), false);
  assert.equal(containsPoint(rect, 31, 20), false);
});

test('containsPoint is false for a null or undefined rect', () => {
  assert.equal(containsPoint(null, 1, 1), false);
  assert.equal(containsPoint(undefined, 1, 1), false);
});
