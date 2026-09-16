/**
 * Critical hits land on a cadence, not on a die roll.
 *
 * That is not a concession to determinism. The simulation has a seeded stream and could
 * roll perfectly reproducibly; the cadence is what the source's own numbers describe.
 * Warden's page lists 6 damage, a critical hit of 9 and 10.77 damage per second at a
 * 0.65 second swing. Six over 0.65 is 9.23, and the published figure is reached exactly
 * when every third swing deals the 9 instead. Solving for the interval across its five
 * levels gives 2.9985, 2.9985, 3.0030, 3.0004 and 2.9996, which a probability would not
 * do.
 *
 * The tower this was built for does not ship: its upgrade table says it costs $1,000
 * with 6 base damage and its own infobox says $1,850 with 12, and a row built from two
 * readings that disagree is a row nobody can trust. The mechanic is here and checked
 * regardless, because it is correct and because the moment the source is consistent the
 * tower is a data row.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMatchState } from '../../src/sim/state/match-state.js';
import { fireTowers } from '../../src/sim/systems/firing.js';
import { makeGameData, placeEnemy } from '../fixtures/game-data.js';

/**
 * Fire a tower for a while and report the damage each shot dealt, in order.
 * @param {{critDamage?: number, critEveryNthHit?: number, damage?: number}} overrides
 * @param {number} ticks
 */
function damagePerShot(overrides, ticks) {
  const gameData = makeGameData();
  const def = gameData.towers.get('gunner');
  const level = def.levels[0];
  Object.assign(level, { fireRate: 10, range: 1000, damage: 10 }, overrides);

  const state = createMatchState(gameData, { seed: 3, mapId: 'proving-ground', difficultyId: 'standard' });
  state.towers.push(/** @type {any} */ ({
    seq: 1, defId: 'gunner', level: 0, xFixed: 100 * 1024, yFixed: 80 * 1024,
    targeting: 'first', cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0,
    reloadTicks: 0, abilityCooldownTicks: 0, totalSpent: 100, hitsLanded: 0,
  }));
  const enemy = placeEnemy(state, 'grunt', 100 * 1024, { hp: 1e9, maxHp: 1e9 });

  const hits = [];
  let last = enemy.hp;
  for (let tick = 0; tick < ticks; tick += 1) {
    fireTowers(state, gameData);
    if (enemy.hp < last) {
      hits.push(last - enemy.hp);
      last = enemy.hp;
    }
  }
  return hits;
}

test('every third hit crits, and the rest do not', () => {
  const hits = damagePerShot({ damage: 10, critDamage: 25, critEveryNthHit: 3 }, 120);
  assert.ok(hits.length >= 9, 'expected at least nine shots, got ' + hits.length);
  hits.slice(0, 9).forEach((damage, i) => {
    const expected = (i + 1) % 3 === 0 ? 25 : 10;
    assert.equal(damage, expected, 'shot ' + (i + 1) + ' dealt ' + damage + ', expected ' + expected);
  });
});

test('a tower with no critical hit deals its plain damage every time', () => {
  const hits = damagePerShot({ damage: 10 }, 90);
  assert.ok(hits.length >= 6);
  for (const damage of hits) assert.equal(damage, 10);
});

test('a critical damage with no cadence is ignored rather than applied every shot', () => {
  // Half a specification is the dangerous shape: a row carrying a crit figure and no
  // interval must not quietly become a tower that crits on every swing.
  const hits = damagePerShot({ damage: 10, critDamage: 25 }, 90);
  assert.ok(hits.length >= 6);
  for (const damage of hits) assert.equal(damage, 10);
});

test('the cadence reproduces the published damage per second', () => {
  // The whole reason the model is a cadence: the average over a cycle has to match the
  // figure the source printed, not merely look plausible.
  const hits = damagePerShot({ damage: 6, critDamage: 9, critEveryNthHit: 3 }, 300);
  const cycles = Math.floor(hits.length / 3);
  assert.ok(cycles >= 5, 'not enough shots to average over');
  const total = hits.slice(0, cycles * 3).reduce((sum, d) => sum + d, 0);
  const averagePerHit = total / (cycles * 3);
  // 0.65 seconds a swing, the interval Warden's page lists.
  const dps = averagePerHit / 0.65;
  assert.ok(Math.abs(dps - 10.77) < 0.01, 'modelled ' + dps.toFixed(2) + ' against a published 10.77');
});

test('a damage aura lifts the critical hit too, not just the ordinary swings', () => {
  // Otherwise a support tower quietly stops helping on every third swing, which is the
  // kind of thing nobody notices and everybody feels.
  //
  // An earlier version of this check raised the level's own base damage and asserted
  // the crit was unchanged, which proves nothing at all: raising the base moves the
  // scale's numerator and denominator together. A real aura is the only way to ask the
  // question.
  const gameData = makeGameData();
  const def = gameData.towers.get('gunner');
  const level = def.levels[0];
  Object.assign(level, { fireRate: 10, range: 1000, damage: 10, critDamage: 25, critEveryNthHit: 3 });

  const state = createMatchState(gameData, { seed: 3, mapId: 'proving-ground', difficultyId: 'standard' });
  state.towers.push(/** @type {any} */ ({
    seq: 1, defId: 'gunner', level: 0, xFixed: 100 * 1024, yFixed: 80 * 1024,
    targeting: 'first', cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0,
    reloadTicks: 0, abilityCooldownTicks: 0, totalSpent: 100, hitsLanded: 0,
  }));
  // The fixture's captain carries a +5 additive damage aura with a radius of 25, and it
  // is placed within that radius of the gunner above.
  state.towers.push(/** @type {any} */ ({
    seq: 2, defId: 'captain', level: 0, xFixed: 105 * 1024, yFixed: 80 * 1024,
    targeting: 'first', cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0,
    reloadTicks: 0, abilityCooldownTicks: 0, totalSpent: 300, hitsLanded: 0,
  }));
  const enemy = placeEnemy(state, 'grunt', 100 * 1024, { hp: 1e9, maxHp: 1e9 });

  const hits = [];
  let last = enemy.hp;
  for (let tick = 0; tick < 120; tick += 1) {
    fireTowers(state, gameData);
    if (enemy.hp < last) {
      hits.push(last - enemy.hp);
      last = enemy.hp;
    }
  }

  assert.ok(hits.length >= 3, 'expected at least three shots, got ' + hits.length);
  // +5 on a base of 10 is 15, which is one and a half times the printed base, so the
  // printed crit of 25 should arrive as 38 rather than staying at 25.
  assert.equal(hits[0], 15, 'the aura did not reach the ordinary swings');
  assert.equal(
    hits[2], Math.round(25 * (15 / 10)),
    'the crit came through at ' + hits[2] + ', so the aura stopped at every third swing',
  );
});
