/**
 * Replay, and the hash trail that proves it.
 *
 * A replay takes a seed, a map, a difficulty and a list of commands, and re-runs the
 * whole match. If the simulation is genuinely deterministic, two replays of the same
 * inputs produce the same world at every single tick, and the cheapest way to show
 * that is to take a hash once a second and compare the sequences.
 *
 * Comparing only the final state would be far weaker: two runs can diverge at tick 40
 * and coincidentally agree on a final total, and a check that only looks at the end
 * would call that a pass.
 */

import { createMatch, tick } from '../core/match.js';
import { hashState } from './snapshot.js';
import { TICK_RATE } from '../core/constants.js';

/**
 * @typedef {object} ReplayResult
 * @property {import('../core/match.js').Match} match
 * @property {number[]} hashes      one per sampled tick
 * @property {number[]} sampleTicks the ticks those hashes were taken at
 * @property {string[]} refusals    every command the simulation refused, with its reason
 */

/**
 * @param {{ gameData: import('../../data/schema/types.js').GameData, seed: number, mapId: string, difficultyId: string }} setup
 * @param {Array<{ tick: number, kind: string, payload: any }>} commandLog
 * @param {number} tickCount
 * @param {number} [sampleEvery]
 * @returns {ReplayResult}
 */
export function replay(setup, commandLog, tickCount, sampleEvery = TICK_RATE) {
  const match = createMatch(setup);
  const hashes = [];
  const sampleTicks = [];
  const refusals = [];

  // Commands are pushed straight onto the queue with their recorded tick rather than
  // going through submitCommand, because submitCommand adds the input delay and the
  // log already has the resolved tick baked in. Adding it twice would shift every
  // action two ticks later on every replay.
  const sorted = [...commandLog].sort((a, b) => a.tick - b.tick);
  let cursor = 0;
  let order = 0;

  for (let i = 0; i < tickCount; i += 1) {
    while (cursor < sorted.length && sorted[cursor].tick <= match.state.tick + 1) {
      const entry = sorted[cursor];
      match.queue.push({
        kind: entry.kind,
        tick: entry.tick,
        order,
        payload: entry.payload,
      });
      order += 1;
      cursor += 1;
    }

    const applied = tick(match);
    for (const { command, result } of applied) {
      if (!result.accepted) {
        refusals.push('tick ' + command.tick + ' ' + command.kind + ': ' + result.reason);
      }
    }

    if (match.state.tick % sampleEvery === 0) {
      hashes.push(hashState(match.state));
      sampleTicks.push(match.state.tick);
    }

    if (match.state.phase === 'won' || match.state.phase === 'lost') break;
  }

  return { match, hashes, sampleTicks, refusals };
}

/**
 * Run the same inputs twice and report whether the two worlds agreed at every sample.
 *
 * This is the check that actually matters. Everything else in the simulation can be
 * right and one unstable sort will still make this fail, which is the point.
 * @param {{ gameData: import('../../data/schema/types.js').GameData, seed: number, mapId: string, difficultyId: string }} setup
 * @param {Array<{ tick: number, kind: string, payload: any }>} commandLog
 * @param {number} tickCount
 * @returns {{ identical: boolean, firstDivergenceTick: number | null, a: ReplayResult, b: ReplayResult }}
 */
export function proveDeterministic(setup, commandLog, tickCount) {
  const a = replay(setup, commandLog, tickCount);
  const b = replay(setup, commandLog, tickCount);

  if (a.hashes.length !== b.hashes.length) {
    return { identical: false, firstDivergenceTick: a.sampleTicks[0] ?? 0, a, b };
  }
  for (let i = 0; i < a.hashes.length; i += 1) {
    if (a.hashes[i] !== b.hashes[i]) {
      return { identical: false, firstDivergenceTick: a.sampleTicks[i], a, b };
    }
  }
  return { identical: true, firstDivergenceTick: null, a, b };
}
