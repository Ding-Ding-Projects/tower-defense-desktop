/**
 * The read-only contract src/render expects from src/sim.
 *
 * The simulation lane is building `src/sim/core/match.js` (createMatch,
 * submitCommand, tick) and `src/sim/state/snapshot.js` (snapshot) in parallel with
 * this one. Neither exists on disk yet, so this file is the render lane's proposal
 * for that shape: everything the renderer, the HUD and the shop panel read comes
 * from the plain object `snapshot(state)` returns, and everything the UI writes
 * goes through `submitCommand(state, command)`. Nothing under src/render or
 * src/ui ever reaches into simulation state directly — that boundary is what
 * keeps a replay honest, and it is also what lets this whole lane be built and
 * tested against a local stub (./stub-sim.js) before src/sim lands.
 *
 * When src/sim/core/match.js and src/sim/state/snapshot.js exist, the only file
 * that needs to change is sim-source.js: swap its re-export target from
 * ./stub-sim.js to the real modules, and the rest of the renderer is untouched
 * as long as the shapes below hold.
 *
 * @typedef {import('../data/schema/types.js').TowerDef} TowerDef
 * @typedef {import('../data/schema/types.js').EnemyDef} EnemyDef
 * @typedef {import('../data/schema/types.js').MapDef} MapDef
 * @typedef {import('../data/schema/types.js').TargetingMode} TargetingMode
 * @typedef {import('../data/schema/types.js').GameData} GameData
 */

/** Simulation tick rate. Fixed, never variable. */
export const SIM_TICK_HZ = 30;
export const SIM_TICK_INTERVAL_MS = 1000 / SIM_TICK_HZ;

/**
 * One placed tower as the simulation reports it. Positions are fixed-point
 * integers (see src/sim/core/fixed.js); the renderer converts with fromFixed and
 * never earlier.
 * @typedef {object} SnapshotTower
 * @property {string} id                 stable identity across ticks, for interpolation
 * @property {string} defId              key into GameData.towers
 * @property {number} x                  fixed-point
 * @property {number} y                  fixed-point
 * @property {number} level              index into TowerDef.levels
 * @property {TargetingMode} targetingMode
 * @property {number} abilityCooldownRemainingSeconds  0 when ready or no ability
 */

/**
 * @typedef {object} SnapshotStatusInstance
 * @property {string} id           key into GameData.statuses
 * @property {number} stacks
 * @property {number} remainingSeconds
 */

/**
 * @typedef {object} SnapshotEnemy
 * @property {string} id
 * @property {string} defId        key into GameData.enemies
 * @property {number} x            fixed-point
 * @property {number} y            fixed-point
 * @property {number} hpCurrent
 * @property {number} hpMax
 * @property {number} shieldCurrent
 * @property {SnapshotStatusInstance[]} statuses
 */

/**
 * @typedef {object} SnapshotProjectile
 * @property {string} id
 * @property {number} x            fixed-point
 * @property {number} y            fixed-point
 * @property {string} fromTowerDefId  drives which procedural sprite to draw
 * @property {string|null} targetEnemyId
 */

/**
 * One-shot occurrences since the previous snapshot: the renderer turns these into
 * floating damage numbers, hit particles and the leak flash. They are not present
 * in every tick, and a renderer that misses one loses a visual, never a sim fact —
 * the sim's own cash/lives/hp fields are always the source of truth.
 * @typedef {object} SnapshotEvent
 * @property {'damageDealt'|'kill'|'leak'|'abilityCast'|'towerPlaced'|'towerSold'} type
 * @property {number} x  fixed-point
 * @property {number} y  fixed-point
 * @property {number} [amount]      damageDealt: the number to float; leak: lives lost
 * @property {string} [enemyDefId]  kill, leak
 * @property {string} [towerDefId]  abilityCast, towerPlaced, towerSold
 */

/**
 * @typedef {object} Snapshot
 * @property {number} tick
 * @property {number} simTimeSeconds
 * @property {number} cash
 * @property {number} lives
 * @property {number} waveIndex
 * @property {'intermission'|'active'|'victory'|'defeat'} phase
 * @property {number} intermissionSecondsRemaining  0 outside the intermission phase
 * @property {string} mapId
 * @property {string} difficultyId
 * @property {SnapshotTower[]} towers
 * @property {SnapshotEnemy[]} enemies
 * @property {SnapshotProjectile[]} projectiles
 * @property {SnapshotEvent[]} events  since the previous snapshot only
 */

/**
 * Every mutation the UI is allowed to request. submitCommand only enqueues; it
 * never applies a command synchronously, so every mutation still happens at a
 * tick boundary and stays replayable.
 * @typedef {
 *   { type: 'placeTower', defId: string, x: number, y: number } |
 *   { type: 'sellTower', towerId: string } |
 *   { type: 'upgradeTower', towerId: string } |
 *   { type: 'setTargetingMode', towerId: string, mode: TargetingMode } |
 *   { type: 'castAbility', towerId: string } |
 *   { type: 'skipIntermission' }
 * } Command
 */

/**
 * @typedef {object} SimSource
 * @property {(options: { seed: number, mapId: string, difficultyId: string, gameData: GameData }) => object} createMatch
 * @property {(state: object, command: Command) => void} submitCommand
 * @property {(state: object) => void} tick
 * @property {(state: object) => Snapshot} snapshot
 */

export {};
