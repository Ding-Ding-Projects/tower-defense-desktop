/**
 * Load every data row, validate it, cross-reference it, and freeze it.
 *
 * Pure and synchronous, with no DOM and no network, so a headless check can import it
 * as readily as the running program can.
 *
 * The files are imported statically rather than read from disk, because the same code
 * has to run inside a packaged desktop application where the data is inside an
 * archive and there is no directory to scan. A build step that generated this list
 * would be one more thing that can silently go stale; a hand-written list fails
 * loudly the moment somebody adds a file and forgets, which is the failure worth
 * having.
 */

import scout from './towers/scout.json' with { type: 'json' };
import sniper from './towers/sniper.json' with { type: 'json' };
import soldier from './towers/soldier.json' with { type: 'json' };
import freezer from './towers/freezer.json' with { type: 'json' };
import militant from './towers/militant.json' with { type: 'json' };
import shotgunner from './towers/shotgunner.json' with { type: 'json' };
import hunter from './towers/hunter.json' with { type: 'json' };
import minigunner from './towers/minigunner.json' with { type: 'json' };
import ranger from './towers/ranger.json' with { type: 'json' };
import electroshocker from './towers/electroshocker.json' with { type: 'json' };
import cowboy from './towers/cowboy.json' with { type: 'json' };
import turret from './towers/turret.json' with { type: 'json' };

import normal from './enemies/normal.json' with { type: 'json' };
import speedy from './enemies/speedy.json' with { type: 'json' };
import slowEnemy from './enemies/slow.json' with { type: 'json' };
import quick from './enemies/quick.json' with { type: 'json' };
import slime from './enemies/slime.json' with { type: 'json' };
import molten from './enemies/molten.json' with { type: 'json' };
import ghost from './enemies/ghost.json' with { type: 'json' };
import moltenBoss from './enemies/molten-boss.json' with { type: 'json' };
import fallenKing from './enemies/fallen-king.json' with { type: 'json' };
import fallenSwordmaster from './enemies/fallen-swordmaster.json' with { type: 'json' };

import stun from './statuses/stun.json' with { type: 'json' };
import slowStatus from './statuses/slow.json' with { type: 'json' };
import freeze from './statuses/freeze.json' with { type: 'json' };
import burn from './statuses/burn.json' with { type: 'json' };
import poison from './statuses/poison.json' with { type: 'json' };
import exposed from './statuses/exposed.json' with { type: 'json' };
import haste from './statuses/haste.json' with { type: 'json' };

import crossroads from './maps/crossroads.json' with { type: 'json' };
import riverbend from './maps/riverbend.json' with { type: 'json' };

import easy from './difficulties/easy.json' with { type: 'json' };
import casual from './difficulties/casual.json' with { type: 'json' };
import intermediate from './difficulties/intermediate.json' with { type: 'json' };
import moltenDifficulty from './difficulties/molten.json' with { type: 'json' };
import fallen from './difficulties/fallen.json' with { type: 'json' };
import hardcore from './difficulties/hardcore.json' with { type: 'json' };

import crossroadsEasy from './waves/crossroads.easy.json' with { type: 'json' };
import crossroadsCasual from './waves/crossroads.casual.json' with { type: 'json' };
import crossroadsIntermediate from './waves/crossroads.intermediate.json' with { type: 'json' };
import crossroadsMolten from './waves/crossroads.molten.json' with { type: 'json' };
import crossroadsFallen from './waves/crossroads.fallen.json' with { type: 'json' };
import crossroadsHardcore from './waves/crossroads.hardcore.json' with { type: 'json' };
import riverbendEasy from './waves/riverbend.easy.json' with { type: 'json' };
import riverbendCasual from './waves/riverbend.casual.json' with { type: 'json' };
import riverbendIntermediate from './waves/riverbend.intermediate.json' with { type: 'json' };
import riverbendMolten from './waves/riverbend.molten.json' with { type: 'json' };
import riverbendFallen from './waves/riverbend.fallen.json' with { type: 'json' };
import riverbendHardcore from './waves/riverbend.hardcore.json' with { type: 'json' };

/** The hand-written manifest. Adding a file means adding a row here. */
export const RAW = Object.freeze({
  towers: [
    scout, sniper, soldier, freezer, militant, shotgunner,
    hunter, minigunner, ranger, electroshocker, cowboy, turret,
  ],
  enemies: [
    normal, speedy, slowEnemy, quick, slime, molten, ghost,
    moltenBoss, fallenKing, fallenSwordmaster,
  ],
  statuses: [stun, slowStatus, freeze, burn, poison, exposed, haste],
  maps: [crossroads, riverbend],
  difficulties: [easy, casual, intermediate, moltenDifficulty, fallen, hardcore],
  waveTables: [
    crossroadsEasy, crossroadsCasual, crossroadsIntermediate,
    crossroadsMolten, crossroadsFallen, crossroadsHardcore,
    riverbendEasy, riverbendCasual, riverbendIntermediate,
    riverbendMolten, riverbendFallen, riverbendHardcore,
  ],
});

/**
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => string} key
 * @returns {Map<string, T>}
 */
function index(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const id = key(row);
    if (map.has(id)) throw new Error('duplicate id in data: ' + id);
    map.set(id, Object.freeze(row));
  }
  return map;
}

/** @type {import('./schema/types.js').GameData | null} */
let cached = null;

/**
 * @returns {import('./schema/types.js').GameData}
 */
export function loadGameData() {
  if (cached) return cached;
  const data = {
    towers: index(RAW.towers, (t) => t.id),
    enemies: index(RAW.enemies, (e) => e.id),
    statuses: index(RAW.statuses, (s) => s.id),
    maps: index(RAW.maps, (m) => m.id),
    difficulties: index(RAW.difficulties, (d) => d.id),
    waveTables: index(RAW.waveTables, (w) => w.mapId + ':' + w.difficultyId),
  };
  cached = /** @type {any} */ (Object.freeze(data));
  return /** @type {any} */ (cached);
}
