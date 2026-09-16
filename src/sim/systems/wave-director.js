/**
 * Waves: the intermission, the spawn schedule, and the transition out of both.
 *
 * The whole schedule for a wave is expanded into a queue of dated spawns the moment
 * the wave starts, rather than being recomputed each tick from elapsed time. That
 * makes the spawn times exact integers decided once, so a wave cannot drift by a tick
 * because of how the clock was sampled, and a snapshot taken mid-wave carries the
 * remaining schedule with it.
 */

import { toFixed } from '../core/fixed.js';
import { secondsToTicks } from '../core/constants.js';
import { nextInt } from '../core/rng.js';
import { takeSeq } from '../state/match-state.js';
import { laneMetrics, positionAlong, requireLane } from './geometry.js';

/**
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @returns {import('../../data/schema/types.js').WaveTable | undefined}
 */
export function waveTableFor(state, gameData) {
  return gameData.waveTables.get(state.mapId + ':' + state.difficultyId);
}

/**
 * Expand a wave definition into dated spawns and put them on the queue.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').WaveDef} wave
 */
export function scheduleWave(state, wave) {
  let order = 0;
  for (const group of wave.groups) {
    const start = state.tick + secondsToTicks(group.startDelaySeconds);
    const gap = secondsToTicks(group.spawnIntervalSeconds);
    for (let i = 0; i < group.count; i += 1) {
      state.spawnQueue.push({
        tick: start + i * gap,
        enemyId: group.enemyId,
        laneId: group.lane,
        order,
      });
      order += 1;
    }
  }
  // Sorted once, here, so the per-tick drain is a cheap prefix scan and the order two
  // spawns sharing a tick appear in is the authored order rather than an accident.
  state.spawnQueue.sort((a, b) => a.tick - b.tick || a.order - b.order);
}

/**
 * Put every enemy due this tick onto the map.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 */
export function drainSpawnQueue(state, gameData) {
  const map = gameData.maps.get(state.mapId);
  const difficulty = gameData.difficulties.get(state.difficultyId);
  if (!map || !difficulty) return;

  while (state.spawnQueue.length > 0 && state.spawnQueue[0].tick <= state.tick) {
    const pending = state.spawnQueue.shift();
    if (!pending) break;
    const def = gameData.enemies.get(pending.enemyId);
    if (!def) continue;

    const lane = requireLane(map, pending.laneId);
    const metrics = laneMetrics(lane);
    // One random draw per spawn, from the single ordered stream. The offset is small
    // and purely cosmetic, but it must still come from the seeded generator or a
    // replay would place the pack differently.
    const offsetFixed = toFixed(nextInt(state.rng, -6, 6) / 10);
    const pos = positionAlong(lane, metrics, 0, offsetFixed);

    const maxHp = Math.max(1, Math.round(def.maxHp * difficulty.enemyHpMultiplier));
    state.enemies.push({
      seq: takeSeq(state),
      defId: def.id,
      laneId: lane.id,
      segment: 0,
      distFixed: 0,
      xFixed: pos.xFixed,
      yFixed: pos.yFixed,
      offsetFixed,
      hp: maxHp,
      maxHp,
      shield: def.shieldHp,
      statuses: [],
      abilityCooldowns: {},
      firedThresholds: [],
    });
    state.spawnedThisWave += 1;
  }
}

/**
 * Move the match between intermission, wave, victory and defeat.
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 */
export function advancePhase(state, gameData) {
  if (state.phase === 'won' || state.phase === 'lost') return;

  const table = waveTableFor(state, gameData);
  if (!table) return;

  if (state.phase === 'intermission') {
    if (state.phaseTicks > 0) {
      state.phaseTicks -= 1;
      return;
    }
    const next = table.waves.find((w) => w.index === state.waveIndex + 1);
    if (!next) {
      state.phase = 'won';
      return;
    }
    state.waveIndex += 1;
    state.spawnedThisWave = 0;
    state.phase = 'wave';
    scheduleWave(state, next);
    return;
  }

  // A wave ends when nothing is left to spawn and nothing is left alive. Checking
  // both matters: an empty map mid-wave is a lull, not a victory.
  if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
    const finished = table.waves.find((w) => w.index === state.waveIndex);
    if (finished) state.cash += finished.completionBonus;
    const hasNext = table.waves.some((w) => w.index === state.waveIndex + 1);
    if (!hasNext) {
      state.phase = 'won';
      return;
    }
    state.phase = 'intermission';
    state.phaseTicks = secondsToTicks(finished ? finished.intermissionSeconds : 10);
  }
}

/**
 * Skip the rest of an intermission. Returns false when there is nothing to skip, so
 * the caller can report a refused command rather than pretending it worked.
 * @param {import('../state/match-state.js').MatchState} state
 * @returns {boolean}
 */
export function skipIntermission(state) {
  if (state.phase !== 'intermission' || state.phaseTicks <= 0) return false;
  state.phaseTicks = 0;
  return true;
}
