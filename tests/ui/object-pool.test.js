import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectPool } from '../../src/render/object-pool.js';

test('ObjectPool pre-allocates exactly capacity items via the factory', () => {
  let built = 0;
  const pool = new ObjectPool(5, () => { built += 1; return { built }; });
  assert.equal(built, 5);
  assert.equal(pool.capacity, 5);
  assert.equal(pool.activeCount, 0);
});

test('ObjectPool.acquire hands out items up to capacity, then returns null', () => {
  const pool = new ObjectPool(2, () => ({}));
  const first = pool.acquire();
  const second = pool.acquire();
  const third = pool.acquire();
  assert.ok(first);
  assert.ok(second);
  assert.equal(third, null, 'budget exhausted: no allocation, no throw');
  assert.equal(pool.activeCount, 2);
  assert.equal(pool.isFull, true);
});

test('ObjectPool.release frees a slot for reuse and calls reset', () => {
  let resetCalls = 0;
  const pool = new ObjectPool(1, () => ({ value: 0 }), (item) => { item.value = -1; resetCalls += 1; });
  const slot = pool.acquire();
  slot.item.value = 42;
  pool.release(slot.index);
  assert.equal(resetCalls, 1);
  assert.equal(slot.item.value, -1);
  assert.equal(pool.activeCount, 0);

  const reacquired = pool.acquire();
  assert.equal(reacquired.index, slot.index, 'the freed slot is reused rather than growing the pool');
});

test('ObjectPool.forEachActive visits only active items', () => {
  const pool = new ObjectPool(3, () => ({ id: Math.random() }));
  const a = pool.acquire();
  pool.acquire();
  pool.release(a.index);
  const visited = [];
  pool.forEachActive((item, index) => visited.push(index));
  assert.equal(visited.length, 1);
});

test('ObjectPool.releaseAll clears every active slot', () => {
  const pool = new ObjectPool(3, () => ({}));
  pool.acquire();
  pool.acquire();
  pool.releaseAll();
  assert.equal(pool.activeCount, 0);
});

test('ObjectPool rejects a non-positive capacity', () => {
  assert.throws(() => new ObjectPool(0, () => ({})));
});
