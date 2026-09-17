/**
 * One-shot occurrences the interface turns into floating damage numbers, hit particles
 * and the leak flash.
 *
 * The renderer has had the whole feedback layer since the first pass: `_handleEvent`,
 * a particle pool, damage numbers, a leak flash. None of it had ever run, because the
 * simulation recorded no events and the snapshot emitted none, so the view model read
 * `next.events ?? []` and got the empty array every single tick. Nothing threw, no
 * check failed, and the battlefield was simply quieter than it was built to be.
 *
 * These are PRESENTATION only. The simulation's own cash, lives and health remain the
 * source of truth, and a renderer that misses an event loses a visual and never a fact.
 * They are cleared at the start of each tick, so a snapshot carries exactly what
 * happened during the tick it describes.
 */

/**
 * Callers pass plain fixed-point numbers, which is what the simulation stores, and the
 * brand is applied here.
 *
 * The brand exists to make converting a coordinate to map units twice a compile error,
 * which is what once drew the entire battlefield on the map origin. It is applied at
 * the points where values LEAVE the simulation, because a brand does not survive the
 * arithmetic the engine does on them all day.
 *
 * @param {import('./match-state.js').MatchState} state
 * @param {{
 *   type: 'damageDealt'|'kill'|'leak'|'abilityCast'|'towerPlaced'|'towerSold',
 *   x: number, y: number,
 *   amount?: number, enemyDefId?: string, towerDefId?: string,
 * }} event
 */
export function recordEvent(state, event) {
  // Bounded, because a wave of forty-five enemies under sustained fire can produce a
  // great many hits in one tick, and an unbounded list would be a frame's worth of
  // allocation for visuals nobody can distinguish anyway.
  if (state.events.length >= MAX_EVENTS_PER_TICK) return;
  state.events.push(/** @type {import('../../render/sim-interface.js').SnapshotEvent} */ ({
    ...event,
    x: /** @type {import('../core/fixed.js').Fixed} */ (event.x),
    y: /** @type {import('../core/fixed.js').Fixed} */ (event.y),
  }));
}

/** Roughly what a busy tick can produce before the extras stop being legible. */
export const MAX_EVENTS_PER_TICK = 64;

/**
 * Start a fresh tick's worth.
 * @param {import('./match-state.js').MatchState} state
 */
export function clearEvents(state) {
  if (state.events.length > 0) state.events.length = 0;
}
