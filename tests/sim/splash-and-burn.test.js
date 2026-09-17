/**
 * Two things the source's own arithmetic asked for, and the engine did not have.
 *
 * Both surfaced from the same place: the published damage-per-second column. Footnote
 * markers were being read as part of the number, so "19 [ 2 ]" was not a number and the
 * cell was thrown away. Fixing that widened the cross-check from 83 levels to 97, and
 * two of the newly visible rows disagreed immediately.
 *
 * Freezer publishes 19 where its direct damage alone is 16. The missing 3 is its chill,
 * a burn the engine could express only as a property of the status itself, identically
 * at every level. Freezer chills for 3 at one level and 5 at the next.
 *
 * Ranger's top level publishes 156.25 where 875 over its 8 second interval is 109.375.
 * The missing 46.875 is 375 over the same interval: it deals 875 to what it hit and 375
 * to everything else in the blast, and the engine applied one figure to the whole area.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMatchState } from '../../src/sim/state/match-state.js';
import { fireTowers } from '../../src/sim/systems/firing.js';
import { applyStatus, damageOverTime } from '../../src/sim/systems/statuses.js';
import { makeGameData, placeEnemy } from '../fixtures/game-data.js';

test('a tower burns for its own figure, not the status definition\'s', () => {
  const gameData = makeGameData();
  const burn = gameData.statuses.get('burn');
  assert.equal(burn.damagePerTick, 2, 'the fixture burn deals 2, which is what is being overridden');

  const enemyDef = gameData.enemies.get('grunt');
  const scorched = /** @type {any} */ ({ statuses: [] });
  applyStatus(scorched, enemyDef, burn, 30, 7);
  assert.equal(damageOverTime(scorched, gameData.statuses), 7, 'the applier\'s figure should win');

  const plain = /** @type {any} */ ({ statuses: [] });
  applyStatus(plain, enemyDef, burn, 30);
  assert.equal(damageOverTime(plain, gameData.statuses), 2, 'with no override, the status definition stands');
});

test('a second application replaces the burn figure, rather than keeping the first', () => {
  // Two towers applying the same status for different amounts is the ordinary case:
  // one Freezer at level 3 and another at level 4 chill for 3 and 5.
  const gameData = makeGameData();
  const burn = gameData.statuses.get('burn');
  const enemyDef = gameData.enemies.get('grunt');
  const enemy = /** @type {any} */ ({ statuses: [] });

  applyStatus(enemy, enemyDef, burn, 30, 3);
  applyStatus(enemy, enemyDef, burn, 30, 5);
  assert.equal(
    damageOverTime(enemy, gameData.statuses) / enemy.statuses[0].stacks, 5,
    'the more recent applier should set the figure',
  );
});

/**
 * Fire once at a cluster and report what each enemy lost.
 * @param {{splashDamage?: number}} overrides
 */
function blastDamage(overrides) {
  const gameData = makeGameData();
  const def = gameData.towers.get('gunner');
  const level = def.levels[0];
  Object.assign(level, { fireRate: 1, range: 1000, damage: 100, aoeRadius: 30 }, overrides);

  const state = createMatchState(gameData, { seed: 4, mapId: 'proving-ground', difficultyId: 'standard' });
  state.towers.push(/** @type {any} */ ({
    seq: 1, defId: 'gunner', level: 0, xFixed: 100 * 1024, yFixed: 80 * 1024,
    targeting: 'first', cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0,
    reloadTicks: 0, abilityCooldownTicks: 0, totalSpent: 100, hitsLanded: 0,
  }));
  // Two enemies close enough that one shot catches both. The first along the lane is
  // what `first` targeting picks, so the other is the one in the blast.
  const lead = placeEnemy(state, 'grunt', 120 * 1024, { hp: 10000, maxHp: 10000 });
  const trailing = placeEnemy(state, 'grunt', 115 * 1024, { hp: 10000, maxHp: 10000 });

  fireTowers(state, gameData);
  return { lead: 10000 - lead.hp, trailing: 10000 - trailing.hp };
}

test('the direct target takes full damage and the blast takes the splash figure', () => {
  const hit = blastDamage({ splashDamage: 40 });
  assert.equal(hit.lead, 100, 'the thing aimed at should take the full figure');
  assert.equal(hit.trailing, 40, 'everything else in the blast should take the splash figure');
});

test('a tower with no splash figure still hits the whole area for its damage', () => {
  // Demoman, Mortar and Paintballer have one damage column and always have. This is the
  // behaviour every splash tower in the roster had before a separate figure existed, and
  // adding one must not have quietly changed it.
  const hit = blastDamage({});
  assert.equal(hit.lead, 100);
  assert.equal(hit.trailing, 100, 'without a splash figure the blast deals full damage');
});
