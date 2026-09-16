/**
 * A fixed-capacity object pool. Every projectile and particle in the renderer is
 * allocated up front from a pool like this and reused for the life of the match —
 * nothing under src/render calls `new` for a projectile or particle per frame.
 * When the pool is full, `acquire` returns null and the caller drops the effect
 * rather than growing the pool; that dropped frame is the hard particle budget.
 */
/**
 * @template T  the kind of thing this pool hands out
 *
 * The type parameter belongs on the CLASS, not on the constructor. TypeScript rejects
 * `@template` on a constructor outright ("type parameters cannot appear on a
 * constructor declaration"), and the knock-on effect was worse than the error itself:
 * `T` then existed nowhere, so every method mentioning it silently became `any`, and
 * the two pools in particles.js were handing out untyped objects with no complaint
 * from anywhere.
 */
export class ObjectPool {
  /**
   * @param {number} capacity
   * @param {() => T} factory  builds one reusable item
   * @param {(item: T) => void} [reset]  called when an item is released back to the pool
   */
  constructor(capacity, factory, reset) {
    if (capacity <= 0) throw new Error('ObjectPool: capacity must be > 0');
    this.capacity = capacity;
    this._reset = reset;
    this._items = new Array(capacity);
    this._active = new Array(capacity).fill(false);
    for (let i = 0; i < capacity; i += 1) this._items[i] = factory();
  }

  /**
   * @returns {{ index: number, item: T }|null}
   */
  acquire() {
    for (let i = 0; i < this.capacity; i += 1) {
      if (!this._active[i]) {
        this._active[i] = true;
        return { index: i, item: this._items[i] };
      }
    }
    return null;
  }

  /**
   * @param {number} index
   */
  release(index) {
    if (index < 0 || index >= this.capacity || !this._active[index]) return;
    this._active[index] = false;
    if (this._reset) this._reset(this._items[index]);
  }

  releaseAll() {
    for (let i = 0; i < this.capacity; i += 1) this.release(i);
  }

  /**
   * @param {(item: T, index: number) => void} fn
   */
  forEachActive(fn) {
    for (let i = 0; i < this.capacity; i += 1) {
      if (this._active[i]) fn(this._items[i], i);
    }
  }

  get activeCount() {
    let count = 0;
    for (let i = 0; i < this.capacity; i += 1) if (this._active[i]) count += 1;
    return count;
  }

  get isFull() {
    return this.activeCount >= this.capacity;
  }
}
