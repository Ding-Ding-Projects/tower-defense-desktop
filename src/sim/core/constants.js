/** Fixed simulation rate. Rendering is decoupled and interpolates between ticks. */
export const TICK_RATE = 30;
/** Seconds per tick, as an exact rational the code never has to re-derive. */
export const TICK_SECONDS = 1 / TICK_RATE;

/**
 * Convert seconds from a data row into whole ticks.
 * Rounds up so a stated cooldown is never silently shorter than the data claims.
 * @param {number} seconds
 * @returns {number}
 */
export function secondsToTicks(seconds) {
  return Math.max(1, Math.ceil(seconds * TICK_RATE));
}
