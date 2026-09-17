/**
 * Player intent, as data.
 *
 * Nothing in the simulation is driven by a function call from the interface. Every
 * action becomes a command, is stamped with the tick it will execute on, and is
 * applied at a tick boundary in a strict order. That is what makes a match replayable
 * from a seed plus a list of these, and it is also, unchanged, the wire format that
 * co-operative play would need later.
 *
 * A command is never allowed to throw. An illegal one is refused with a reason the
 * interface can show, and refusing must leave the state untouched.
 */

import { secondsToTicks } from './core/constants.js';
import { toFixed } from './core/fixed.js';
import { takeSeq, findTower } from './state/match-state.js';
import { canPlace } from './systems/placement.js';
import { skipIntermission } from './systems/wave-director.js';

/**
 * @typedef {object} Command
 * @property {string} kind
 * @property {number} tick     the tick it executes on
 * @property {number} order    submission order, breaking ties within one tick
 * @property {any} [payload]
 */

/** @typedef {{ accepted: true } | { accepted: false, reason: string }} CommandResult */

/**
 * Input delay in ticks. Unnecessary for one player, and deliberately present anyway:
 * it is the exact mechanism lockstep co-operative play needs, and retrofitting it
 * later would change every timing the single-player balance was tuned against.
 */
export const INPUT_DELAY_TICKS = 2;

/**
 * @param {import('./state/match-state.js').MatchState} state
 * @param {string} kind
 * @param {any} payload
 * @param {number} order
 * @returns {Command}
 */
export function makeCommand(state, kind, payload, order) {
  return { kind, tick: state.tick + INPUT_DELAY_TICKS, order, payload };
}

/**
 * Apply one command. Returns a verdict rather than throwing.
 * @param {import('./state/match-state.js').MatchState} state
 * @param {import('../data/schema/types.js').GameData} gameData
 * @param {Command} command
 * @returns {CommandResult}
 */
export function applyCommand(state, gameData, command) {
  if (state.phase === 'won' || state.phase === 'lost') {
    return { accepted: false, reason: 'the match is over' };
  }
  switch (command.kind) {
    case 'PlaceTower':
      return placeTower(state, gameData, command.payload);
    case 'UpgradeTower':
      return upgradeTower(state, gameData, command.payload);
    case 'SellTower':
      return sellTower(state, gameData, command.payload);
    case 'SetTargeting':
      return setTargeting(state, gameData, command.payload);
    case 'UseAbility':
      return useAbility(state, gameData, command.payload);
    case 'SkipIntermission':
      return skipIntermission(state)
        ? { accepted: true }
        : { accepted: false, reason: 'not in an intermission' };
    default:
      return { accepted: false, reason: 'unknown command: ' + command.kind };
  }
}

/**
 * @param {import('./state/match-state.js').MatchState} state
 * @param {import('../data/schema/types.js').GameData} gameData
 * @param {{ towerId: string, x: number, y: number }} payload
 * @returns {CommandResult}
 */
function placeTower(state, gameData, payload) {
  const verdict = canPlace(state, gameData, payload.towerId, payload.x, payload.y);
  if (!verdict.ok) return { accepted: false, reason: verdict.reason };
  const def = gameData.towers.get(payload.towerId);
  if (!def) return { accepted: false, reason: 'unknown tower' };

  state.cash -= def.baseCost;
  state.towers.push({
    seq: takeSeq(state),
    defId: def.id,
    level: 0,
    xFixed: toFixed(payload.x),
    yFixed: toFixed(payload.y),
    targeting: def.targetingModes[0] ?? 'first',
    cooldownTicks: 0,
    spinUpTicks: 0,
    burstLeft: 0,
    hitsLanded: 0,
    secondaryCooldownTicks: 0,
    reloadTicks: 0,
    abilityCooldownTicks: 0,
    abilityActiveTicks: 0,
    totalSpent: def.baseCost,
  });
  return { accepted: true };
}

/**
 * @param {import('./state/match-state.js').MatchState} state
 * @param {import('../data/schema/types.js').GameData} gameData
 * @param {{ seq: number }} payload
 * @returns {CommandResult}
 */
function upgradeTower(state, gameData, payload) {
  const tower = findTower(state, payload.seq);
  if (!tower) return { accepted: false, reason: 'no such tower' };
  const def = gameData.towers.get(tower.defId);
  if (!def) return { accepted: false, reason: 'unknown tower' };
  const next = def.levels[tower.level + 1];
  if (!next) return { accepted: false, reason: 'already at maximum level' };
  if (state.cash < next.cost) {
    return { accepted: false, reason: 'costs ' + next.cost + ', you have ' + state.cash };
  }
  state.cash -= next.cost;
  tower.totalSpent += next.cost;
  tower.level += 1;
  // A fresh level means a fresh wind-up. Upgrading mid-engagement should not hand a
  // spin-up tower a free full-rate shot.
  tower.spinUpTicks = 0;
  tower.burstLeft = 0;
  return { accepted: true };
}

/**
 * @param {import('./state/match-state.js').MatchState} state
 * @param {import('../data/schema/types.js').GameData} gameData
 * @param {{ seq: number }} payload
 * @returns {CommandResult}
 */
function sellTower(state, gameData, payload) {
  const tower = findTower(state, payload.seq);
  if (!tower) return { accepted: false, reason: 'no such tower' };
  const def = gameData.towers.get(tower.defId);
  if (!def) return { accepted: false, reason: 'unknown tower' };
  state.cash += Math.trunc(tower.totalSpent * def.sellRefundFraction);
  state.towers = state.towers.filter((t) => t.seq !== tower.seq);
  // Anything this tower had in flight is orphaned rather than left pointing at a
  // tower that no longer exists.
  state.projectiles = state.projectiles.filter((p) => p.sourceSeq !== tower.seq);
  return { accepted: true };
}

/**
 * @param {import('./state/match-state.js').MatchState} state
 * @param {import('../data/schema/types.js').GameData} gameData
 * @param {{ seq: number, mode: string }} payload
 * @returns {CommandResult}
 */
function setTargeting(state, gameData, payload) {
  const tower = findTower(state, payload.seq);
  if (!tower) return { accepted: false, reason: 'no such tower' };
  const def = gameData.towers.get(tower.defId);
  if (!def) return { accepted: false, reason: 'unknown tower' };
  if (!def.targetingModes.includes(/** @type {any} */ (payload.mode))) {
    return { accepted: false, reason: 'this tower has no ' + payload.mode + ' mode' };
  }
  // Narrowed by the membership test above: a mode the tower does not have was already
  // refused, so what reaches here is one of its own declared modes.
  tower.targeting = /** @type {import('../data/schema/types.js').TargetingMode} */ (payload.mode);
  return { accepted: true };
}

/**
 * @param {import('./state/match-state.js').MatchState} state
 * @param {import('../data/schema/types.js').GameData} gameData
 * @param {{ seq: number }} payload
 * @returns {CommandResult}
 */
function useAbility(state, gameData, payload) {
  const tower = findTower(state, payload.seq);
  if (!tower) return { accepted: false, reason: 'no such tower' };
  const def = gameData.towers.get(tower.defId);
  if (!def) return { accepted: false, reason: 'unknown tower' };
  const level = def.levels[tower.level];
  if (!level || !level.ability) return { accepted: false, reason: 'this tower has no ability' };
  if (tower.abilityCooldownTicks > 0) {
    return {
      accepted: false,
      reason: 'ready in ' + Math.ceil(tower.abilityCooldownTicks / 30) + 's',
    };
  }
  tower.abilityCooldownTicks = secondsToTicks(level.ability.cooldownSeconds);
  state.pendingAbilities = state.pendingAbilities ?? [];
  state.pendingAbilities.push({ towerSeq: tower.seq, abilityId: level.ability.id });
  return { accepted: true };
}

/**
 * Drain the queue of every command due on or before this tick, in strict order.
 * @param {import('./state/match-state.js').MatchState} state
 * @param {import('../data/schema/types.js').GameData} gameData
 * @param {Command[]} queue  mutated: drained commands are removed
 * @returns {Array<{ command: Command, result: CommandResult }>}
 */
export function drainCommands(state, gameData, queue) {
  const due = queue.filter((c) => c.tick <= state.tick);
  if (due.length === 0) return [];
  due.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const applied = [];
  for (const command of due) {
    applied.push({ command, result: applyCommand(state, gameData, command) });
  }
  const dueSet = new Set(due);
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if (dueSet.has(queue[i])) queue.splice(i, 1);
  }
  return applied;
}
