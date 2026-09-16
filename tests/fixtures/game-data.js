/**
 * A small synthetic world for the checks.
 *
 * Deliberately NOT real statistics from anywhere. These numbers are chosen to make
 * mechanics easy to reason about (a tower that does exactly 10 damage, an enemy with
 * exactly 100 hit points) so a failing check points at the mechanic rather than at
 * arithmetic. Real cited data lives in src/data and is validated separately.
 */

/** @returns {import('../../src/data/schema/types.js').Source} */
const fixtureSource = () => ({
  wikiUrl: 'https://example.invalid/fixture',
  retrievedAt: '2026-01-01',
  notes: 'synthetic fixture, not a real statistic',
});

/**
 * @returns {import('../../src/data/schema/types.js').GameData}
 */
export function makeGameData() {
  /** @type {any} */
  const statuses = new Map([
    ['stun', {
      id: 'stun', displayName: 'Stunned', category: 'stun', stackingRule: 'refresh',
      preventsAction: true, source: fixtureSource(),
    }],
    ['slow', {
      id: 'slow', displayName: 'Slowed', category: 'slow', stackingRule: 'refresh',
      speedMultiplier: 0.5, source: fixtureSource(),
    }],
    ['burn', {
      id: 'burn', displayName: 'Burning', category: 'dot', stackingRule: 'stack',
      maxStacks: 3, damagePerTick: 2, source: fixtureSource(),
    }],
    ['exposed', {
      id: 'exposed', displayName: 'Exposed', category: 'debuff', stackingRule: 'refresh',
      revealsHidden: true, tag: 'marked', source: fixtureSource(),
    }],
    ['haste', {
      id: 'haste', displayName: 'Hastened', category: 'buff', stackingRule: 'highest',
      speedMultiplier: 2, source: fixtureSource(),
    }],
  ]);

  /** @type {any} */
  const towers = new Map([
    ['gunner', {
      id: 'gunner', displayName: 'Gunner', baseCost: 100, allowedTerrain: ['ground'],
      placementPool: 'default', maxCount: null, sellRefundFraction: 0.7, footprintRadius: 1,
      targetingModes: ['first', 'last', 'closest', 'strongest', 'weakest'],
      levels: [
        { level: 0, cost: 0, damage: 10, fireRate: 1, range: 20, detectsHidden: false, hitsAir: false, source: fixtureSource() },
        { level: 1, cost: 150, damage: 25, fireRate: 1, range: 25, detectsHidden: false, hitsAir: false, source: fixtureSource() },
      ],
      source: fixtureSource(),
    }],
    ['spotter', {
      id: 'spotter', displayName: 'Spotter', baseCost: 200, allowedTerrain: ['ground', 'cliff'],
      placementPool: 'default', maxCount: null, sellRefundFraction: 0.5, footprintRadius: 1,
      targetingModes: ['first', 'closest'],
      levels: [
        {
          level: 0, cost: 0, damage: 5, fireRate: 2, range: 30,
          detectsHidden: true, hitsAir: true,
          appliesStatuses: ['exposed'], statusDurationSeconds: 3, source: fixtureSource(),
        },
      ],
      source: fixtureSource(),
    }],
    ['bank', {
      id: 'bank', displayName: 'Bank', baseCost: 250, allowedTerrain: ['ground'],
      placementPool: 'economy', maxCount: 2, sellRefundFraction: 0.6, footprintRadius: 2,
      targetingModes: ['first'],
      levels: [
        { level: 0, cost: 0, damage: 0, fireRate: 0.1, range: 0, detectsHidden: false, hitsAir: false, incomePerWave: 50, source: fixtureSource() },
      ],
      source: fixtureSource(),
    }],
    ['captain', {
      id: 'captain', displayName: 'Captain', baseCost: 300, allowedTerrain: ['ground'],
      placementPool: 'default', maxCount: null, sellRefundFraction: 0.7, footprintRadius: 1,
      targetingModes: ['first'],
      levels: [
        {
          level: 0, cost: 0, damage: 0, fireRate: 0.5, range: 10,
          detectsHidden: false, hitsAir: false,
          aura: { stat: 'damage', mode: 'additive', radius: 25, value: 5 },
          ability: { id: 'rally', displayName: 'Rally', cooldownSeconds: 10, effect: 'damageBurst', magnitude: 40, radius: 30 },
          source: fixtureSource(),
        },
      ],
      source: fixtureSource(),
    }],
  ]);

  /** @type {any} */
  const enemies = new Map([
    ['grunt', {
      id: 'grunt', displayName: 'Grunt', maxHp: 100, shieldHp: 0, defense: 0, speed: 10,
      leakDamage: 1, killReward: 5, hidden: false, flying: false, boss: false,
      immunities: [], abilities: [], source: fixtureSource(),
    }],
    ['armoured', {
      id: 'armoured', displayName: 'Armoured', maxHp: 100, shieldHp: 50, defense: 3, speed: 5,
      leakDamage: 2, killReward: 12, hidden: false, flying: false, boss: false,
      immunities: ['slow'], abilities: [], source: fixtureSource(),
    }],
    ['ghost', {
      id: 'ghost', displayName: 'Ghost', maxHp: 60, shieldHp: 0, defense: 0, speed: 14,
      leakDamage: 1, killReward: 9, hidden: true, flying: false, boss: false,
      immunities: [], abilities: [], source: fixtureSource(),
    }],
    ['flier', {
      id: 'flier', displayName: 'Flier', maxHp: 80, shieldHp: 0, defense: 0, speed: 16,
      leakDamage: 1, killReward: 10, hidden: false, flying: true, boss: false,
      immunities: [], abilities: [], source: fixtureSource(),
    }],
    ['warlord', {
      id: 'warlord', displayName: 'Warlord', maxHp: 2000, shieldHp: 0, defense: 5, speed: 4,
      leakDamage: 10, killReward: 200, hidden: false, flying: false, boss: true,
      immunities: ['stun'],
      abilities: [
        { kind: 'summon', cooldownSeconds: 5, summonEnemyId: 'grunt', count: 2 },
        { kind: 'shieldPhase', cooldownSeconds: 999, magnitude: 500, hpThreshold: 0.5 },
      ],
      source: fixtureSource(),
    }],
  ]);

  /** @type {any} */
  const maps = new Map([
    ['proving-ground', {
      id: 'proving-ground', displayName: 'Proving Ground', baseLives: 20,
      width: 200, height: 100,
      lanes: [{ id: 'main', waypoints: [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 200, y: 50 }] }],
      placementZones: [
        { id: 'south', terrain: 'ground', polygon: [[0, 60], [200, 60], [200, 100], [0, 100]] },
        { id: 'ridge', terrain: 'cliff', polygon: [[0, 0], [200, 0], [200, 40], [0, 40]] },
      ],
      source: fixtureSource(),
    }],
  ]);

  /** @type {any} */
  const difficulties = new Map([
    ['standard', {
      id: 'standard', displayName: 'Standard', selectable: true, startingCash: 500,
      cashMultiplier: 1, enemyHpMultiplier: 1, enemySpeedMultiplier: 1,
      livesOverride: null, disallowedTowers: [], source: fixtureSource(),
    }],
    ['brutal', {
      id: 'brutal', displayName: 'Brutal', selectable: true, startingCash: 300,
      cashMultiplier: 0.8, enemyHpMultiplier: 2, enemySpeedMultiplier: 1.25,
      livesOverride: 5, disallowedTowers: ['bank'], source: fixtureSource(),
    }],
  ]);

  /** @type {any} */
  const waveTables = new Map([
    ['proving-ground:standard', {
      mapId: 'proving-ground', difficultyId: 'standard', source: fixtureSource(),
      waves: [
        {
          index: 1, intermissionSeconds: 5, completionBonus: 100,
          groups: [{ enemyId: 'grunt', count: 3, spawnIntervalSeconds: 1, startDelaySeconds: 0, lane: 'main' }],
        },
        {
          index: 2, intermissionSeconds: 5, completionBonus: 150,
          groups: [{ enemyId: 'grunt', count: 2, spawnIntervalSeconds: 1, startDelaySeconds: 0, lane: 'main' }],
        },
      ],
    }],
    ['proving-ground:brutal', {
      mapId: 'proving-ground', difficultyId: 'brutal', source: fixtureSource(),
      waves: [
        {
          index: 1, intermissionSeconds: 5, completionBonus: 100,
          groups: [{ enemyId: 'armoured', count: 2, spawnIntervalSeconds: 1, startDelaySeconds: 0, lane: 'main' }],
        },
      ],
    }],
  ]);

  return { towers, enemies, maps, difficulties, statuses, waveTables };
}

/**
 * Put one enemy on the map directly, bypassing the wave director, so a check can test
 * one mechanic without also depending on wave timing.
 * @param {import('../../src/sim/state/match-state.js').MatchState} state
 * @param {string} defId
 * @param {number} distFixed
 * @param {Partial<import('../../src/sim/state/match-state.js').Enemy>} [overrides]
 */
export function placeEnemy(state, defId, distFixed, overrides = {}) {
  const seq = state.nextSeq;
  state.nextSeq += 1;
  const enemy = {
    seq, defId, laneId: 'main', segment: 0, distFixed,
    xFixed: distFixed, yFixed: 50 * 1024, offsetFixed: 0,
    hp: 100, maxHp: 100, shield: 0, statuses: [],
    abilityCooldowns: {}, firedThresholds: [],
    ...overrides,
  };
  state.enemies.push(/** @type {any} */ (enemy));
  return enemy;
}
