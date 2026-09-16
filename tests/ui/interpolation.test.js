import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerp, lerpAngle, computeAlpha, SnapshotBuffer, TICK_INTERVAL_MS, SIM_TICK_HZ } from '../../src/render/interpolation.js';

test('lerp blends linearly and hits both endpoints', () => {
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
  assert.equal(lerp(0, 10, 0.5), 5);
  assert.equal(lerp(4, 2, 0.25), 3.5);
});

test('lerpAngle takes the shorter way around the circle', () => {
  const from = Math.PI * 1.9; // just short of full circle
  const to = Math.PI * 0.1; // just past zero
  const result = lerpAngle(from, to, 0.5);
  // The short path from 342 deg to 18 deg passes through 0/360, i.e. near 0.
  const normalized = ((result % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  assert.ok(normalized < 0.2 || normalized > Math.PI * 2 - 0.2, `expected near 0, got ${normalized}`);
});

test('lerpAngle with alpha 0 or 1 returns the endpoints', () => {
  assert.equal(lerpAngle(1, 2, 0), 1);
  assert.ok(Math.abs(lerpAngle(1, 2, 1) - 2) < 1e-9);
});

test('computeAlpha clamps to [0, 1] and is linear in between', () => {
  assert.equal(computeAlpha(0, 0, 100), 0);
  assert.equal(computeAlpha(100, 0, 100), 1);
  assert.equal(computeAlpha(50, 0, 100), 0.5);
  assert.equal(computeAlpha(-10, 0, 100), 0, 'before the window clamps to 0');
  assert.equal(computeAlpha(200, 0, 100), 1, 'after the window clamps to 1 (held frame)');
});

test('computeAlpha returns 1 for a zero or negative span rather than dividing by zero', () => {
  assert.equal(computeAlpha(5, 10, 10), 1);
  assert.equal(computeAlpha(5, 10, 9), 1);
});

test('SIM_TICK_HZ and TICK_INTERVAL_MS agree', () => {
  assert.equal(SIM_TICK_HZ, 30);
  assert.ok(Math.abs(TICK_INTERVAL_MS - 1000 / 30) < 1e-9);
});

test('SnapshotBuffer with no pushes reports no data and a neutral sample', () => {
  const buffer = new SnapshotBuffer();
  assert.equal(buffer.hasData(), false);
  const { prev, next, alpha } = buffer.sample(1000);
  assert.equal(prev, null);
  assert.equal(next, null);
  assert.equal(alpha, 0);
});

test('SnapshotBuffer with exactly one push holds that snapshot at alpha 1', () => {
  const buffer = new SnapshotBuffer();
  const snap = { tick: 1 };
  buffer.push(snap, 1000);
  const { prev, next, alpha } = buffer.sample(1050);
  assert.equal(prev, snap);
  assert.equal(next, snap);
  assert.equal(alpha, 1);
});

test('SnapshotBuffer with two pushes interpolates between their arrival times', () => {
  const buffer = new SnapshotBuffer();
  const a = { tick: 1 };
  const b = { tick: 2 };
  buffer.push(a, 1000);
  buffer.push(b, 1000 + TICK_INTERVAL_MS);
  const midMs = 1000 + TICK_INTERVAL_MS / 2;
  const { prev, next, alpha } = buffer.sample(midMs);
  assert.equal(prev, a);
  assert.equal(next, b);
  assert.ok(Math.abs(alpha - 0.5) < 1e-9, `expected ~0.5, got ${alpha}`);
});
