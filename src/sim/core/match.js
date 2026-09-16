/**
 * The public face of the simulation.
 *
 * Four exports and nothing else: create a match, submit intent, advance one tick,
 * read a snapshot. The interface layer never reaches past these, which is what keeps
 * the replay honest, because anything that can change the world has to go through the
 * command queue and therefore ends up in the log.
 *
 * The order of the phases inside tick() is load-bearing and is written out in full
 * below, because "why did that enemy die before it leaked" is answered by the order
 * and by nothing else.
 */

import { TICK_RATE } from './constants.js';
import { createMatchState } from '../state/match-state.js';
import { makeCommand, drainCommands } from '../commands.js';
import { advanceEnemies, resolveLeaks } from '../systems/pathing.js';
import { fireTowers, advanceProjectiles } from '../systems/firing.js';
import { damageOverTime, expireStatuses } from '../systems/statuses.js';
import { applyTrueDamage } from '../systems/damage.js';
import { advancePhase, drainSpawnQueue } from '../systems/wave-director.js';
import { runPendingAbilities, coolAbilities, runEnemyAbilities } from '../systems/abilities.js';
import { payWaveIncome } from '../systems/income.js';

export { TICK_RATE };

/**
 * @typedef {object} Match
 * @property {import('../state/match-state.js').MatchState} state
 * @property {import('../../data/schema/types.js').GameData} gameData
 * @property {import('../commands.js').Command[]} queue
 * @property {number} nextOrder
 */

/**
 * @param {{ gameData: import('../../data/schema/types.js').GameData, seed: number, mapId: string, difficultyId: string }} options
 * @returns {Match}
 */
export function createMatch({ gameData, seed, mapId, difficultyId }) {
  const state = createMatchState(gameData, { seed, mapId, difficultyId });
  state.pendingAbilities = [];
  return { state, gameData, queue: [], nextOrder: 0 };
}

/**
 * Queue one piece of player intent. It does not take effect now; it takes effect on
 * the tick it is stamped for, which is a couple of ticks out.
 * @param {Match} match
 * @param {string} kind
 * @param {any} payload
 * @returns {import('../commands.js').Command}
 */
export function submitCommand(match, kind, payload) {
  const command = makeCommand(match.state, kind, payload, match.nextOrder);
  match.nextOrder += 1;
  match.queue.push(command);
  return command;
}

/**
 * Advance the world exactly one tick.
 * @param {Match} match
 * @returns {Array<{ command: import('../commands.js').Command, result: import('../commands.js').CommandResult }>}
 */
export function tick(match) {
  const { state, gameData } = match;
  if (state.phase === 'won' || state.phase === 'lost') return [];

  state.tick += 1;

  // 1. Player intent first, so a tower bought this tick can shoot this tick. Anything
  //    else makes the input delay feel a tick longer than it is.
  const applied = drainCommands(state, gameData, match.queue);
  runPendingAbilities(state, gameData);
  coolAbilities(state);

  // 2. The wave clock, then spawns, so a wave that starts this tick can also place
  //    its first enemy this tick rather than one tick later.
  const phaseBefore = state.phase;
  const waveBefore = state.waveIndex;
  advancePhase(state, gameData);
  drainSpawnQueue(state, gameData);

  // Paying income exactly on the wave-to-intermission edge, once, rather than on a
  // timer that could fire twice if a wave ended on the same tick as a leak.
  if (phaseBefore === 'wave' && state.phase === 'intermission' && state.waveIndex === waveBefore) {
    payWaveIncome(state, gameData);
  }

  // 3. Enemies act, then move. A boss summons from where it currently stands, not
  //    from where it is about to be.
  runEnemyAbilities(state, gameData);
  const leaked = advanceEnemies(state, gameData);

  // 4. Towers shoot at where enemies are now, and shots already in the air arrive.
  fireTowers(state, gameData);
  advanceProjectiles(state, gameData);

  // 5. Status damage, then expiry, so a status always deals damage on its final tick.
  applyStatusDamage(state, gameData);
  for (const enemy of state.enemies) expireStatuses(enemy);
  state.enemies = state.enemies.filter((e) => e.hp > 0);

  // 6. Leaks resolve last. An enemy that reached the end this tick still had to
  //    survive everything above; burning down on the doorstep counts as a kill.
  const stillAlive = leaked.filter((e) => e.hp > 0);
  resolveLeaks(state, gameData, stillAlive);

  return applied;
}

/**
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 */
function applyStatusDamage(state, gameData) {
  for (const enemy of [...state.enemies].sort((a, b) => a.seq - b.seq)) {
    if (enemy.hp <= 0) continue;
    const amount = damageOverTime(enemy, gameData.statuses);
    if (amount <= 0) continue;
    const def = gameData.enemies.get(enemy.defId);
    if (!def) continue;
    // Status damage bypasses flat reduction deliberately: a burn that a heavily
    // armoured enemy could shrug off would be worthless against exactly the enemies
    // it exists to answer.
    const result = applyTrueDamage(enemy, def, amount);
    if (result.killed) {
      state.cash += result.reward;
      state.killCount += 1;
    }
  }
}

/**
 * Run a whole match forward without an interface attached. Used by the end-to-end
 * checks and by replay.
 * @param {Match} match
 * @param {number} ticks
 */
export function runTicks(match, ticks) {
  for (let i = 0; i < ticks; i += 1) {
    if (match.state.phase === 'won' || match.state.phase === 'lost') break;
    tick(match);
  }
}
