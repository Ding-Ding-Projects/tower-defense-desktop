/**
 * A small, local, deterministic stand-in for src/sim, implementing the exact
 * shape documented in sim-interface.js: createMatch, submitCommand, tick,
 * snapshot. It exists so the render lane has something real to draw and the UI
 * lane has something real to click while the simulation lane is still building
 * the genuine core in parallel.
 *
 * This is deliberately not balanced, not data-driven from src/data, and not a
 * claim about real game mechanics — it is one tower, one enemy, one lane, enough
 * behaviour to exercise placement, targeting, upgrades, selling, abilities,
 * waves, leaks and victory/defeat so every UI surface has something to show.
 * Swap sim-source.js to the real modules and delete this file's imports there;
 * nothing else needs to change.
 */

import { createRng, nextInt } from '../sim/core/rng.js';
import { toFixed, distanceSquared, isqrt } from '../sim/core/fixed.js';
import { SIM_TICK_HZ } from './sim-interface.js';

const STUB_SOURCE = {
  wikiUrl: 'about:blank',
  retrievedAt: '2026-01-01',
  notes: 'render-lane local development stub, not sourced game data',
};

export const STUB_MAP = {
  id: 'stub-map',
  displayName: 'Render Lane Dev Stub',
  baseLives: 20,
  width: 40,
  height: 24,
  lanes: [
    {
      id: 'lane-a',
      waypoints: [
        { x: 0, y: 12 },
        { x: 16, y: 12 },
        { x: 16, y: 4 },
        { x: 34, y: 4 },
        { x: 40, y: 4 },
      ],
    },
  ],
  placementZones: [
    { id: 'zone-a', terrain: 'ground', polygon: [[4, 14], [22, 14], [22, 22], [4, 22]] },
    { id: 'zone-b', terrain: 'ground', polygon: [[20, 2], [38, 2], [38, 8], [20, 8]] },
  ],
  source: STUB_SOURCE,
};

export const STUB_TOWER = {
  id: 'stub-turret',
  displayName: 'Stub Turret',
  baseCost: 100,
  allowedTerrain: ['ground'],
  placementPool: 'default',
  maxCount: 6,
  sellRefundFraction: 0.7,
  footprintRadius: 1,
  targetingModes: ['first', 'last', 'closest', 'strongest', 'weakest'],
  levels: [
    { level: 0, cost: 100, damage: 10, fireRate: 1.5, range: 7, detectsHidden: false, hitsAir: false, source: STUB_SOURCE },
    { level: 1, cost: 80, damage: 18, fireRate: 1.6, range: 7.5, detectsHidden: false, hitsAir: false, source: STUB_SOURCE },
    {
      level: 2,
      cost: 140,
      damage: 30,
      fireRate: 1.8,
      range: 8,
      detectsHidden: false,
      hitsAir: false,
      ability: { id: 'stub-burst', displayName: 'Overcharge', cooldownSeconds: 12, effect: 'damageBurst', magnitude: 80, radius: 3 },
      source: STUB_SOURCE,
    },
  ],
  source: STUB_SOURCE,
};

export const STUB_ENEMY = {
  id: 'stub-grunt',
  displayName: 'Stub Grunt',
  maxHp: 60,
  shieldHp: 0,
  defense: 0,
  speed: 3.2,
  leakDamage: 1,
  killReward: 6,
  hidden: false,
  flying: false,
  boss: false,
  immunities: [],
  abilities: [],
  source: STUB_SOURCE,
};

export function getStubGameData() {
  return {
    towers: new Map([[STUB_TOWER.id, STUB_TOWER]]),
    enemies: new Map([[STUB_ENEMY.id, STUB_ENEMY]]),
    maps: new Map([[STUB_MAP.id, STUB_MAP]]),
    difficulties: new Map(),
    statuses: new Map(),
    waveTables: new Map(),
  };
}

const WAVE_SIZE = 6;
const SPAWN_INTERVAL_TICKS = SIM_TICK_HZ; // one grunt per second
const INTERMISSION_TICKS = SIM_TICK_HZ * 6;
const TOTAL_WAVES = 5;

/**
 * @param {{ seed?: number, mapId?: string, difficultyId?: string }} [options]
 */
export function createMatch({ seed = 1, mapId = STUB_MAP.id, difficultyId = 'stub-normal' } = {}) {
  return {
    tick: 0,
    rng: createRng(seed),
    cash: 300,
    lives: STUB_MAP.baseLives,
    waveIndex: 0,
    phase: 'intermission',
    intermissionTicksRemaining: INTERMISSION_TICKS,
    mapId,
    difficultyId,
    towers: [],
    enemies: [],
    projectiles: [],
    events: [],
    nextTowerId: 1,
    nextEnemyId: 1,
    nextProjectileId: 1,
    spawnQueue: [],
    pendingCommands: [],
    waypoints: STUB_MAP.lanes[0].waypoints,
  };
}

/**
 * @param {object} state
 * @param {import('./sim-interface.js').Command} command
 */
export function submitCommand(state, command) {
  state.pendingCommands.push(command);
}

export function tick(state) {
  state.events = [];
  applyCommands(state);
  advancePhase(state);
  spawnFromQueue(state);
  moveEnemies(state);
  fireTowers(state);
  moveProjectiles(state);
  state.tick += 1;
}

export function snapshot(state) {
  return {
    tick: state.tick,
    simTimeSeconds: state.tick / SIM_TICK_HZ,
    cash: state.cash,
    lives: state.lives,
    waveIndex: state.waveIndex,
    phase: state.phase,
    intermissionSecondsRemaining: Math.max(0, state.intermissionTicksRemaining / SIM_TICK_HZ),
    mapId: state.mapId,
    difficultyId: state.difficultyId,
    towers: state.towers.map((t) => ({ ...t })),
    enemies: state.enemies.map((e) => ({ ...e, statuses: e.statuses.map((s) => ({ ...s })) })),
    projectiles: state.projectiles.map((p) => ({ ...p })),
    events: state.events.slice(),
  };
}

// ---- internal ----

function applyCommands(state) {
  for (const command of state.pendingCommands) {
    applyCommand(state, command);
  }
  state.pendingCommands = [];
}

function applyCommand(state, command) {
  switch (command.type) {
    case 'placeTower': {
      const def = STUB_TOWER;
      if (state.cash < def.baseCost) return;
      state.cash -= def.baseCost;
      state.towers.push({
        id: `tower-${state.nextTowerId++}`,
        defId: def.id,
        x: toFixed(command.x),
        y: toFixed(command.y),
        level: 0,
        targetingMode: 'first',
        abilityCooldownRemainingSeconds: 0,
        fireCooldownTicks: 0,
      });
      state.events.push({ type: 'towerPlaced', x: toFixed(command.x), y: toFixed(command.y), towerDefId: def.id });
      break;
    }
    case 'sellTower': {
      const idx = state.towers.findIndex((t) => t.id === command.towerId);
      if (idx === -1) return;
      const tower = state.towers[idx];
      const spent = STUB_TOWER.levels.slice(0, tower.level + 1).reduce((sum, l) => sum + l.cost, 0);
      state.cash += Math.floor(spent * (STUB_TOWER.sellRefundFraction / 100));
      state.events.push({ type: 'towerSold', x: tower.x, y: tower.y, towerDefId: tower.defId });
      state.towers.splice(idx, 1);
      break;
    }
    case 'upgradeTower': {
      const tower = state.towers.find((t) => t.id === command.towerId);
      if (!tower) return;
      const nextLevel = STUB_TOWER.levels.find((l) => l.level === tower.level + 1);
      if (!nextLevel || state.cash < nextLevel.cost) return;
      state.cash -= nextLevel.cost;
      tower.level += 1;
      break;
    }
    case 'setTargetingMode': {
      const tower = state.towers.find((t) => t.id === command.towerId);
      if (tower) tower.targetingMode = command.mode;
      break;
    }
    case 'castAbility': {
      const tower = state.towers.find((t) => t.id === command.towerId);
      if (!tower) return;
      const levelDef = STUB_TOWER.levels[tower.level];
      if (!levelDef.ability || tower.abilityCooldownRemainingSeconds > 0) return;
      tower.abilityCooldownRemainingSeconds = levelDef.ability.cooldownSeconds;
      state.events.push({ type: 'abilityCast', x: tower.x, y: tower.y, towerDefId: tower.defId });
      for (const enemy of state.enemies) {
        if (distanceSquared(tower.x, tower.y, enemy.x, enemy.y) <= toFixed(levelDef.ability.radius) ** 2) {
          damageEnemy(state, enemy, levelDef.ability.magnitude);
        }
      }
      break;
    }
    case 'skipIntermission': {
      if (state.phase === 'intermission') state.intermissionTicksRemaining = 0;
      break;
    }
    default:
      break;
  }
}

function advancePhase(state) {
  for (const tower of state.towers) {
    if (tower.abilityCooldownRemainingSeconds > 0) {
      tower.abilityCooldownRemainingSeconds = Math.max(0, tower.abilityCooldownRemainingSeconds - 1 / SIM_TICK_HZ);
    }
  }

  if (state.phase === 'victory' || state.phase === 'defeat') return;

  if (state.phase === 'intermission') {
    state.intermissionTicksRemaining -= 1;
    if (state.intermissionTicksRemaining <= 0) {
      state.phase = 'active';
      state.waveIndex += 1;
      queueWave(state, state.waveIndex);
    }
    return;
  }

  if (state.phase === 'active' && state.spawnQueue.length === 0 && state.enemies.length === 0) {
    if (state.waveIndex >= TOTAL_WAVES) {
      state.phase = 'victory';
    } else {
      state.phase = 'intermission';
      state.intermissionTicksRemaining = INTERMISSION_TICKS;
    }
  }
}

function queueWave(state, waveIndex) {
  const count = WAVE_SIZE + waveIndex * 2;
  state.spawnQueue = Array.from({ length: count }, (_, i) => i * SPAWN_INTERVAL_TICKS);
  state.waveSpawnTick = state.tick;
}

function spawnFromQueue(state) {
  if (state.phase !== 'active' || state.spawnQueue.length === 0) return;
  const elapsed = state.tick - state.waveSpawnTick;
  while (state.spawnQueue.length > 0 && state.spawnQueue[0] <= elapsed) {
    state.spawnQueue.shift();
    const wp = state.waypoints[0];
    state.enemies.push({
      id: `enemy-${state.nextEnemyId++}`,
      defId: STUB_ENEMY.id,
      x: toFixed(wp.x),
      y: toFixed(wp.y),
      hpCurrent: STUB_ENEMY.maxHp,
      hpMax: STUB_ENEMY.maxHp,
      shieldCurrent: STUB_ENEMY.shieldHp,
      waypointIndex: 0,
      statuses: [],
    });
  }
}

function moveEnemies(state) {
  const speedFixed = toFixed(STUB_ENEMY.speed / SIM_TICK_HZ);
  const survivors = [];
  for (const enemy of state.enemies) {
    let remaining = speedFixed;
    while (remaining > 0 && enemy.waypointIndex < state.waypoints.length - 1) {
      const target = state.waypoints[enemy.waypointIndex + 1];
      const tx = toFixed(target.x);
      const ty = toFixed(target.y);
      const dx = tx - enemy.x;
      const dy = ty - enemy.y;
      const distSq = dx * dx + dy * dy;
      const dist = isqrt(distSq);
      if (dist <= remaining) {
        enemy.x = tx;
        enemy.y = ty;
        enemy.waypointIndex += 1;
        remaining -= dist;
      } else if (dist > 0) {
        enemy.x += Math.trunc((dx * remaining) / dist);
        enemy.y += Math.trunc((dy * remaining) / dist);
        remaining = 0;
      } else {
        remaining = 0;
      }
    }
    if (enemy.waypointIndex >= state.waypoints.length - 1) {
      state.lives = Math.max(0, state.lives - STUB_ENEMY.leakDamage);
      state.events.push({ type: 'leak', x: enemy.x, y: enemy.y, amount: STUB_ENEMY.leakDamage, enemyDefId: enemy.defId });
      if (state.lives === 0) state.phase = 'defeat';
    } else {
      survivors.push(enemy);
    }
  }
  state.enemies = survivors;
}

function fireTowers(state) {
  for (const tower of state.towers) {
    const levelDef = STUB_TOWER.levels[tower.level];
    tower.fireCooldownTicks = Math.max(0, (tower.fireCooldownTicks ?? 0) - 1);
    if (tower.fireCooldownTicks > 0) continue;

    const target = pickTarget(state, tower, levelDef);
    if (!target) continue;

    tower.fireCooldownTicks = Math.round(SIM_TICK_HZ / levelDef.fireRate);
    state.projectiles.push({
      id: `proj-${state.nextProjectileId++}`,
      x: tower.x,
      y: tower.y,
      fromTowerDefId: tower.defId,
      targetEnemyId: target.id,
      damage: levelDef.damage,
    });
  }
}

function pickTarget(state, tower, levelDef) {
  const rangeSq = toFixed(levelDef.range) ** 2;
  const inRange = state.enemies.filter((e) => distanceSquared(tower.x, tower.y, e.x, e.y) <= rangeSq);
  if (inRange.length === 0) return null;

  switch (tower.targetingMode) {
    case 'last':
      return inRange.reduce((a, b) => (a.waypointIndex <= b.waypointIndex ? a : b));
    case 'strongest':
      return inRange.reduce((a, b) => (a.hpCurrent >= b.hpCurrent ? a : b));
    case 'weakest':
      return inRange.reduce((a, b) => (a.hpCurrent <= b.hpCurrent ? a : b));
    case 'closest':
      return inRange.reduce((a, b) =>
        distanceSquared(tower.x, tower.y, a.x, a.y) <= distanceSquared(tower.x, tower.y, b.x, b.y) ? a : b,
      );
    case 'first':
    default:
      return inRange.reduce((a, b) => (a.waypointIndex >= b.waypointIndex ? a : b));
  }
}

function moveProjectiles(state) {
  const speedFixed = toFixed(30 / SIM_TICK_HZ); // hitscan-ish: fast, still animated for a frame or two
  const survivors = [];
  for (const proj of state.projectiles) {
    const target = state.enemies.find((e) => e.id === proj.targetEnemyId);
    if (!target) continue; // target died or leaked since the shot was fired
    const dx = target.x - proj.x;
    const dy = target.y - proj.y;
    const distSq = dx * dx + dy * dy;
    const dist = isqrt(distSq);
    if (dist <= speedFixed) {
      damageEnemy(state, target, proj.damage);
      state.events.push({ type: 'damageDealt', x: target.x, y: target.y, amount: proj.damage, enemyDefId: target.defId });
    } else {
      proj.x += Math.trunc((dx * speedFixed) / dist);
      proj.y += Math.trunc((dy * speedFixed) / dist);
      survivors.push(proj);
    }
  }
  state.projectiles = survivors;
}

function damageEnemy(state, enemy, amount) {
  enemy.hpCurrent -= amount;
  if (enemy.hpCurrent <= 0) {
    state.cash += STUB_ENEMY.killReward;
    state.events.push({ type: 'kill', x: enemy.x, y: enemy.y, enemyDefId: enemy.defId });
    state.enemies = state.enemies.filter((e) => e.id !== enemy.id);
  }
}

// nextInt is part of the shared RNG contract every sim module is expected to draw
// from rather than Math.random; kept referenced here so the stub exercises the
// same seam the real sim will, even though this stub does not yet need randomness.
void nextInt;
