/**
 * Everything the presentation side has to forget when one match ends and another
 * begins, done in one place so nothing can be forgotten in one of them.
 *
 * Three things remember the previous match, and each one alone was enough to make a
 * brand new game open with a card reading "Wave 0 cleared. No leaks got through."
 *
 * - The interface layer remembers the previous frame's phase, so it can notice a wave
 *   starting or ending. Old match `active`, new match `intermission`: a wave clear.
 * - The render loop keeps the last two snapshots and interpolates between them, so for
 *   one frame it blends the end of one game into the start of another.
 * - The renderer keeps the state object the tick handler last built for the layer, and
 *   draws the layer with it on every animation frame until the next tick replaces it.
 *   That one was the cause that survived the other two being fixed: with the layer
 *   reset and the loop reset, an animation frame landing before the next tick still
 *   drew the old match's `active`, re-primed the phase memory, and the next tick's
 *   `intermission` read as a wave clear -- with the new match's wave number, which is
 *   exactly what the card said.
 *
 * This is a module rather than a block inside `app.js` so a check can drive the real
 * renderer through the real sequence and fail when any of the three is left out.
 */

/**
 * @param {object} parts
 * @param {{ resetForNewMatch(): void }} parts.interfaceLayer
 * @param {{ resetForNewMatch(): void }} parts.loop
 * @param {{ interfaceState: any }} parts.renderer
 * @param {any} parts.state  the layer's state for the new match's first snapshot
 */
export function presentNewMatch({ interfaceLayer, loop, renderer, state }) {
  interfaceLayer.resetForNewMatch();
  loop.resetForNewMatch();
  // Published now, not left for the next tick. The window between this call and that
  // tick is where the stale object was being drawn.
  renderer.interfaceState = state;
}
