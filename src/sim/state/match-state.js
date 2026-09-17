/**
 * The whole mutable world of one match.
 *
 * Everything here is plain data: arrays, numbers, strings. No class instances, no
 * functions, no Maps with object keys. That is deliberate, because snapshot() has to
 * serialise this exactly and replay() has to rebuild it byte for byte.
 */

import { createRng } from '../core/rng.js';
import { toFixed } from '../core/fixed.js';
import { secondsToTicks } from '../core/constants.js';

/** @typedef {import('../../data/schema/types.js')} _ */

/**
 * @typedef {object} ActiveStatus
 * @property {string} id
 * @property {number} ticksLeft
 * @property {number} stacks
 * @property {number} [damagePerTick]  set when the tower that applied it carries its own
 *   figure, which is how one status can burn for different amounts from different towers
 */

/**
 * @typedef {object} Enemy
 * @property {number} seq          monotonic, never reused; every tie in the game breaks on this
 * @property {string} defId
 * @property {string} laneId
 * @property {number} segment      index of the waypoint being walked toward
 * @property {number} distFixed    distance travelled along the whole lane, fixed-point
 * @property {number} xFixed
 * @property {number} yFixed
 * @property {number} offsetFixed  perpendicular offset so a pack is not one line
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} shield
 * @property {ActiveStatus[]} statuses
 * @property {Record<string, number>} abilityCooldowns
 * @property {string[]} firedThresholds
 */

/**
 * @typedef {object} Tower
 * @property {number} seq
 * @property {string} defId
 * @property {number} level
 * @property {number} xFixed
 * @property {number} yFixed
 * @property {import('../../data/schema/types.js').TargetingMode} targeting
 * @property {number} cooldownTicks   ticks until the next shot is allowed
 * @property {number} spinUpTicks     ticks of continuous target contact so far
 * @property {number} burstLeft
 * @property {number} hitsLanded        total shots fired, for the critical-hit cadence
 * @property {number} reloadTicks
 * @property {number} secondaryCooldownTicks  the second weapon runs its own clock
 * @property {number} abilityCooldownTicks
 * @property {number} totalSpent      what a sale refunds a percentage of
 */

/**
 * @typedef {object} Projectile
 * @property {number} seq
 * @property {number} sourceSeq
 * @property {number} xFixed
 * @property {number} yFixed
 * @property {number} targetSeq
 * @property {number} speedFixed      fixed-point map units per tick
 * @property {number} damage
 * @property {number} aoeRadiusFixed
 * @property {number|null} splashDamage  what the blast deals to anything that was not
 *   the direct target; null means the whole area takes the full damage
 * @property {number} pierceLeft
 * @property {string[]} appliesStatuses
 * @property {number} statusTicks
 * @property {{ tag: string, damageMultiplier: number } | null} bonusVsTag
 */

/**
 * @typedef {object} PendingSpawn
 * @property {number} tick
 * @property {string} enemyId
 * @property {string} laneId
 * @property {number} order   preserves authored order when two spawns share a tick
 */

/**
 * @typedef {object} MatchState
 * @property {number} tick
 * @property {{ state: number }} rng
 * @property {number} seed
 * @property {string} mapId
 * @property {string} difficultyId
 * @property {'intermission'|'wave'|'won'|'lost'} phase
 * @property {number} phaseTicks        ticks remaining in an intermission
 * @property {number} waveIndex         1-based; 0 before the first wave
 * @property {number} cash
 * @property {number} lives
 * @property {number} nextSeq
 * @property {Enemy[]} enemies
 * @property {Tower[]} towers
 * @property {Projectile[]} projectiles
 * @property {PendingSpawn[]} spawnQueue
 * @property {number} spawnedThisWave
 * @property {number} killCount
 * @property {number} leakCount
 * @property {number} lastWaveCompletionBonus  what the wave just cleared paid out
 * @property {import('../../render/sim-interface.js').SnapshotEvent[]} events  this tick only
 * @property {Array<{ towerSeq: number, abilityId: string }>} [pendingAbilities]
 */

/**
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @param {{ seed: number, mapId: string, difficultyId: string }} options
 * @returns {MatchState}
 */
export function createMatchState(gameData, { seed, mapId, difficultyId }) {
  const map = gameData.maps.get(mapId);
  if (!map) throw new Error('unknown map: ' + mapId);
  const difficulty = gameData.difficulties.get(difficultyId);
  if (!difficulty) throw new Error('unknown difficulty: ' + difficultyId);

  return {
    tick: 0,
    rng: createRng(seed),
    seed,
    mapId,
    difficultyId,
    phase: 'intermission',
    // The pre-first-wave pause. Long enough to place a first tower, and the same
    // for every match so a replay of a given seed sees the same clock.
    phaseTicks: secondsToTicks(10),
    waveIndex: 0,
    cash: difficulty.startingCash,
    lives: difficulty.livesOverride === null ? map.baseLives : difficulty.livesOverride,
    nextSeq: 1,
    enemies: [],
    towers: [],
    projectiles: [],
    spawnQueue: [],
    spawnedThisWave: 0,
    killCount: 0,
    lastWaveCompletionBonus: 0,
    events: [],
    leakCount: 0,
    pendingAbilities: [],
  };
}

/**
 * Take the next sequence number. Sequence numbers are never reused within a match,
 * because every deterministic tie-break in the simulation leans on them being unique
 * and monotonic.
 * @param {MatchState} state
 * @returns {number}
 */
export function takeSeq(state) {
  const seq = state.nextSeq;
  state.nextSeq += 1;
  return seq;
}

/**
 * @param {MatchState} state
 * @param {number} seq
 * @returns {Enemy | undefined}
 */
export function findEnemy(state, seq) {
  return state.enemies.find((e) => e.seq === seq);
}

/**
 * @param {MatchState} state
 * @param {number} seq
 * @returns {Tower | undefined}
 */
export function findTower(state, seq) {
  return state.towers.find((t) => t.seq === seq);
}

export { toFixed };
