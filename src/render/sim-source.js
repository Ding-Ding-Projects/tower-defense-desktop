/**
 * The seam between the interface and the simulation.
 *
 * The two sides were built in parallel and did not agree on every name, which is the
 * ordinary result of parallel work rather than a mistake by either of them. Rather
 * than making the simulation adopt interface vocabulary or the interface adopt
 * simulation vocabulary, the mismatch is resolved in exactly one file: here.
 *
 * Three differences are reconciled:
 *
 * 1. The simulation hands back a match handle carrying its own command queue. The
 *    interface only ever wants to pass that handle straight back, so it is opaque.
 * 2. The interface names commands in camel case; the simulation names them in Pascal
 *    case. The map below is the whole translation, and an unknown name throws here
 *    rather than being silently dropped somewhere deeper.
 * 3. `snapshot` reads a state, not a match, so this unwraps it.
 *
 * Keeping the adapter thin matters: anything clever in this file becomes untestable
 * behaviour sitting between two well-tested halves.
 */

import {
  createMatch as createSimMatch,
  submitCommand as submitSimCommand,
  tick as tickSim,
} from '../sim/core/match.js';
import { snapshot as snapshotState } from '../sim/state/snapshot.js';
import { loadGameData } from '../data/loader.js';

/** Interface command names to simulation command names. */
const COMMAND_KINDS = Object.freeze({
  placeTower: 'PlaceTower',
  upgradeTower: 'UpgradeTower',
  sellTower: 'SellTower',
  setTargetingMode: 'SetTargeting',
  castAbility: 'UseAbility',
  skipIntermission: 'SkipIntermission',
});

/**
 * @param {{ seed: number, mapId: string, difficultyId: string, gameData?: any }} options
 * @returns {any} an opaque match handle
 */
export function createMatch(options) {
  const gameData = options.gameData ?? loadGameData();
  return createSimMatch({
    gameData,
    seed: options.seed,
    mapId: options.mapId,
    difficultyId: options.difficultyId,
  });
}

/**
 * @param {any} match
 * @param {{ kind: string } & Record<string, any>} command
 */
export function submitCommand(match, command) {
  // `type` is accepted as well as `kind` because both spellings existed in the
  // interface at once, and the mismatch was silent: upgrade, sell, ability and
  // targeting all looked like working buttons that changed nothing.
  const name = command.kind ?? command.type;
  const kind = COMMAND_KINDS[/** @type {keyof typeof COMMAND_KINDS} */ (name)];
  if (!kind) {
    // Loudly, because a command name that quietly does nothing is the worst kind of
    // interface defect: the button appears to work and the world never changes.
    throw new Error('unknown command from the interface: ' + String(name));
  }

  const { kind: _ignoredKind, type: _ignoredType, ...rest } = command;
  /** @type {any} */
  const payload = { ...rest };
  // The interface identifies a tower by `towerId`; the simulation identifies every
  // entity by its sequence number. One translation, here, rather than two vocabularies
  // arguing across the seam.
  if (kind === 'PlaceTower') {
    // Placement names the KIND of tower being bought, and the interface has called
    // that both `defId` and `towerId`. Either spelling is accepted; neither silently
    // places nothing.
    if (payload.towerId === undefined && payload.defId !== undefined) {
      payload.towerId = payload.defId;
    }
    delete payload.defId;
  } else if (payload.towerId !== undefined) {
    payload.seq = payload.towerId;
    delete payload.towerId;
  }
  if (payload.mode === undefined && payload.targetingMode !== undefined) {
    payload.mode = payload.targetingMode;
  }
  return submitSimCommand(match, kind, payload);
}

/**
 * @param {any} match
 */
export function tick(match) {
  return tickSim(match);
}

/**
 * @param {any} match
 */
export function snapshot(match) {
  return snapshotState(match.state);
}

/**
 * @returns {any}
 */
export function getGameData() {
  return loadGameData();
}
