/**
 * Pure timing and interpolation maths for the render lane.
 *
 * The simulation ticks at a fixed 30 Hz. The render loop runs on
 * requestAnimationFrame, which can be 60, 120 or 165 Hz on the same machine, so
 * every frame between two simulation ticks has to invent a position by blending
 * the last two known snapshots. Nothing here touches a DOM, a canvas or a clock
 * of its own — every function takes its "now" as an argument, so it is exercised
 * with node --test without a browser.
 */

export const SIM_TICK_HZ = 30;
export const TICK_INTERVAL_MS = 1000 / SIM_TICK_HZ;

/**
 * Linear blend between two numbers.
 * @param {number} a
 * @param {number} b
 * @param {number} alpha  0 returns a, 1 returns b. Not clamped: callers that need
 *   clamping (e.g. render alpha) clamp before calling.
 * @returns {number}
 */
export function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
}

/**
 * Linear blend between two angles in radians, taking the shorter way around the
 * circle so a turret rotating from 350° to 10° sweeps 20°, not 340°.
 * @param {number} a
 * @param {number} b
 * @param {number} alpha
 * @returns {number}
 */
export function lerpAngle(a, b, alpha) {
  const twoPi = Math.PI * 2;
  let diff = ((b - a + Math.PI) % twoPi) - Math.PI;
  if (diff < -Math.PI) diff += twoPi;
  return a + diff * alpha;
}

/**
 * Blend factor for "now" between two snapshot arrival times, clamped to [0, 1].
 *
 * This intentionally interpolates rather than extrapolates: once `nowMs` passes
 * `nextAtMs` (the simulation tick is running late, or the render loop woke up
 * ahead of the next tick), alpha clamps at 1 and the renderer holds the newest
 * known position rather than guessing where an entity would be next. That is a
 * deliberate trade — a held frame under jitter, never a wrong one.
 * @param {number} nowMs
 * @param {number} prevAtMs  wall-clock time the older of the two snapshots arrived
 * @param {number} nextAtMs  wall-clock time the newer of the two snapshots arrived
 * @returns {number}
 */
export function computeAlpha(nowMs, prevAtMs, nextAtMs) {
  const span = nextAtMs - prevAtMs;
  if (span <= 0) return 1;
  const alpha = (nowMs - prevAtMs) / span;
  return Math.min(1, Math.max(0, alpha));
}

/**
 * Holds the last two simulation snapshots and their wall-clock arrival times, and
 * answers "what should the screen show right now". This is the whole seam between
 * the fixed 30 Hz simulation tick and the uncapped render loop.
 */
export class SnapshotBuffer {
  constructor() {
    /** @type {object|null} */
    this._prev = null;
    /** @type {object|null} */
    this._next = null;
    this._prevAtMs = 0;
    this._nextAtMs = 0;
  }

  /**
   * @param {object} snapshot
   * @param {number} atMs  wall-clock time this snapshot became current
   */
  push(snapshot, atMs) {
    this._prev = this._next;
    this._prevAtMs = this._nextAtMs;
    this._next = snapshot;
    this._nextAtMs = atMs;
  }

  /**
   * Throw away both snapshots, for when the next one describes a different match.
   *
   * Without this, starting a new match leaves the finished one's last frame in `_prev`
   * and the fresh one's first frame in `_next`, and the renderer spends a frame
   * interpolating between two unrelated games. The visible result was a brand new match
   * opening with a card reading "Wave 0 cleared. No leaks got through.": the interface
   * layer watches the phase move from one frame to the next, saw `active` followed by
   * `intermission`, and correctly reported a wave clear about a wave from the previous
   * match.
   */
  reset() {
    this._prev = null;
    this._next = null;
    this._prevAtMs = 0;
    this._nextAtMs = 0;
  }

  /** True once at least one snapshot has been pushed. */
  hasData() {
    return this._next !== null;
  }

  /**
   * @param {number} nowMs
   * @returns {{ prev: object|null, next: object|null, alpha: number }}
   */
  sample(nowMs) {
    if (!this._next) return { prev: null, next: null, alpha: 0 };
    if (!this._prev) return { prev: this._next, next: this._next, alpha: 1 };
    const alpha = computeAlpha(nowMs, this._prevAtMs, this._nextAtMs);
    return { prev: this._prev, next: this._next, alpha };
  }
}
