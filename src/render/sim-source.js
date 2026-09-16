/**
 * The one-line seam between the render lane and the simulation lane.
 *
 * Today this re-exports the local development stub (./stub-sim.js), because
 * src/sim/core/match.js and src/sim/state/snapshot.js do not exist yet. Once the
 * simulation lane lands them, swap the two lines below for:
 *
 *   export { createMatch, submitCommand, tick } from '../sim/core/match.js';
 *   export { snapshot } from '../sim/state/snapshot.js';
 *
 * and delete stub-sim.js. Nothing else in src/render or src/ui imports the stub
 * directly — every consumer imports from this file — so that swap is the entire
 * migration as long as the real modules match the shape documented in
 * sim-interface.js.
 */
export { createMatch, submitCommand, tick, snapshot, getStubGameData as getGameData } from './stub-sim.js';
