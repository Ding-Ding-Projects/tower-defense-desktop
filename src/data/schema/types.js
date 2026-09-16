/**
 * The shapes every data row is validated against.
 *
 * These are JSDoc typedefs rather than a schema library on purpose: the validator in
 * tools/validate-data.mjs does the real checking at load time, and the types here let
 * TypeScript catch a system reading a field that no row actually has.
 *
 * A new tower is meant to be a row in src/data/towers. If adding one needs a change in
 * src/sim, the shape below is wrong and the shape is what should change.
 */

/**
 * Where a number came from. Required on every top-level row, because a statistic
 * with no provenance is a rumour, and this project claims parity with a live game
 * that gets balance patches.
 * @typedef {object} Source
 * @property {string} wikiUrl
 * @property {string} retrievedAt  ISO yyyy-mm-dd
 * @property {string} [wikiRevision]
 * @property {string} [notes]
 */

/** @typedef {'first'|'last'|'closest'|'strongest'|'weakest'} TargetingMode */
/** @typedef {'ground'|'water'|'cliff'} Terrain */
/** @typedef {'stun'|'slow'|'dot'|'debuff'|'buff'} StatusCategory */
/** @typedef {'refresh'|'stack'|'highest'} StackingRule */

/**
 * @typedef {object} StatusDef
 * @property {string} id
 * @property {string} displayName
 * @property {StatusCategory} category
 * @property {StackingRule} stackingRule
 * @property {number} [maxStacks]
 * @property {number} [speedMultiplier]   slow and freeze: enemy speed is multiplied by this
 * @property {number} [damagePerTick]     dot: flat damage applied each tick
 * @property {number} [percentMaxHpPerTick] dot: fraction of max hp applied each tick
 * @property {boolean} [preventsAction]   stun: the target cannot act
 * @property {boolean} [revealsHidden]    exposed: hidden no longer blocks targeting
 * @property {string} [tag]               generic synergy handle, see bonusVsTag
 * @property {Source} source
 */

/**
 * One level of one tower. Level 0 is the placed, unupgraded tower.
 * @typedef {object} TowerLevel
 * @property {number} level
 * @property {number} cost              cost to reach this level from the previous one
 * @property {number} damage
 * @property {number} fireRate          shots per second
 * @property {number} range             map units
 * @property {boolean} detectsHidden
 * @property {boolean} hitsAir
 * @property {number} [spinUpSeconds]   time to reach full fire rate after acquiring
 * @property {number} [burstCount]      shots per burst
 * @property {number} [reloadSeconds]   pause after a burst
 * @property {number} [projectileSpeed] map units per second; omitted means hitscan
 * @property {number} [aoeRadius]
 * @property {number} [pierceCount]     how many enemies one shot passes through
 * @property {number} [chainCount]
 * @property {number} [chainRadius]
 * @property {string[]} [appliesStatuses]
 * @property {number} [statusDurationSeconds]
 * @property {{ tag: string, damageMultiplier: number }} [bonusVsTag]
 * @property {number} [incomePerWave]   economy towers
 * @property {AuraDef} [aura]
 * @property {AbilityDef} [ability]
 * @property {Source} source
 */

/**
 * A tower that multiplies nearby towers' stats. Effective stats are recomputed every
 * tick from the live set of auras rather than mutated in place, so stacking is a pure
 * function and a replay can re-derive it.
 * @typedef {object} AuraDef
 * @property {'damage'|'fireRate'|'range'|'income'} stat
 * @property {'additive'|'multiplicative'|'highest'} mode
 * @property {number} radius
 * @property {number} value
 */

/**
 * @typedef {object} AbilityDef
 * @property {string} id
 * @property {string} displayName
 * @property {number} cooldownSeconds
 * @property {'damageBurst'|'healBase'|'buffPulse'|'stunPulse'} effect
 * @property {number} magnitude
 * @property {number} [radius]
 * @property {number} [durationSeconds]
 */

/**
 * @typedef {object} TowerDef
 * @property {string} id
 * @property {string} displayName
 * @property {number} baseCost
 * @property {Terrain[]} allowedTerrain
 * @property {string} placementPool   towers sharing a pool share its cap
 * @property {number|null} maxCount
 * @property {number} sellRefundPercent
 * @property {number} footprintRadius
 * @property {TargetingMode[]} targetingModes
 * @property {TowerLevel[]} levels
 * @property {Source} source
 */

/**
 * @typedef {object} EnemyAbilityDef
 * @property {'summon'|'stun'|'shieldPhase'|'heal'|'speedPhase'} kind
 * @property {number} cooldownSeconds
 * @property {string} [summonEnemyId]
 * @property {number} [count]
 * @property {number} [radius]
 * @property {number} [durationSeconds]
 * @property {number} [magnitude]
 * @property {number} [hpThreshold]   0..1; fires once when hp drops below this
 */

/**
 * @typedef {object} EnemyDef
 * @property {string} id
 * @property {string} displayName
 * @property {number} maxHp
 * @property {number} shieldHp
 * @property {number} defense        flat reduction applied per hit, after shield
 * @property {number} speed          map units per second
 * @property {number} leakDamage
 * @property {number} killReward
 * @property {boolean} hidden
 * @property {boolean} flying
 * @property {boolean} boss
 * @property {string[]} immunities   status ids this enemy ignores
 * @property {EnemyAbilityDef[]} abilities
 * @property {Source} source
 */

/**
 * @typedef {object} Waypoint
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {object} Lane
 * @property {string} id
 * @property {Waypoint[]} waypoints
 */

/**
 * @typedef {object} PlacementZone
 * @property {string} id
 * @property {Terrain} terrain
 * @property {Array<[number, number]>} polygon
 */

/**
 * @typedef {object} MapDef
 * @property {string} id
 * @property {string} displayName
 * @property {number} baseLives
 * @property {number} width
 * @property {number} height
 * @property {Lane[]} lanes
 * @property {PlacementZone[]} placementZones
 * @property {Source} source
 */

/**
 * @typedef {object} WaveGroup
 * @property {string} enemyId
 * @property {number} count
 * @property {number} spawnIntervalSeconds
 * @property {number} startDelaySeconds
 * @property {string} lane
 */

/**
 * @typedef {object} WaveDef
 * @property {number} index
 * @property {number} intermissionSeconds
 * @property {number} completionBonus
 * @property {WaveGroup[]} groups
 */

/**
 * @typedef {object} WaveTable
 * @property {string} mapId
 * @property {string} difficultyId
 * @property {WaveDef[]} waves
 * @property {Source} source
 */

/**
 * @typedef {object} DifficultyDef
 * @property {string} id
 * @property {string} displayName
 * @property {boolean} selectable
 * @property {number} startingCash
 * @property {number} cashMultiplier
 * @property {number} enemyHpMultiplier
 * @property {number} enemySpeedMultiplier
 * @property {number|null} livesOverride
 * @property {string[]} disallowedTowers
 * @property {Source} source
 */

/**
 * The frozen registries the simulation reads. Built once by the loader.
 * @typedef {object} GameData
 * @property {Map<string, TowerDef>} towers
 * @property {Map<string, EnemyDef>} enemies
 * @property {Map<string, MapDef>} maps
 * @property {Map<string, DifficultyDef>} difficulties
 * @property {Map<string, StatusDef>} statuses
 * @property {Map<string, WaveTable>} waveTables   keyed `${mapId}:${difficultyId}`
 */

export {};
