import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMatchState } from '../../src/sim/state/match-state.js';
import {
  applyStatus, speedMultiplier, isStunned, damageOverTime, expireStatuses, hasTag,
} from '../../src/sim/systems/statuses.js';
import { applyDamage, applyTrueDamage, orderHits } from '../../src/sim/systems/damage.js';
import { applyAuras, effectiveStats } from '../../src/sim/systems/buffs.js';
import { canPlace } from '../../src/sim/systems/placement.js';
import { makeGameData, placeEnemy } from '../fixtures/game-data.js';

const setup = (difficultyId = 'standard') => {
  const gameData = makeGameData();
  const state = createMatchState(gameData, { seed: 7, mapId: 'proving-ground', difficultyId });
  return { gameData, state };
};

// --- statuses ---------------------------------------------------------------

test('refresh extends the clock without adding a second instance', () => {
  const { gameData } = setup();
  const enemy = /** @type {any} */ ({ statuses: [] });
  const def = gameData.enemies.get('grunt');
  applyStatus(enemy, def, gameData.statuses.get('slow'), 10);
  applyStatus(enemy, def, gameData.statuses.get('slow'), 30);
  assert.equal(enemy.statuses.length, 1);
  assert.equal(enemy.statuses[0].ticksLeft, 30);
  assert.equal(enemy.statuses[0].stacks, 1);
});

test('refresh never shortens an existing longer application', () => {
  const { gameData } = setup();
  const enemy = /** @type {any} */ ({ statuses: [] });
  const def = gameData.enemies.get('grunt');
  applyStatus(enemy, def, gameData.statuses.get('slow'), 30);
  applyStatus(enemy, def, gameData.statuses.get('slow'), 5);
  assert.equal(enemy.statuses[0].ticksLeft, 30);
});

test('stack accumulates up to its cap and then stops', () => {
  const { gameData } = setup();
  const enemy = /** @type {any} */ ({ statuses: [] });
  const def = gameData.enemies.get('grunt');
  const burn = gameData.statuses.get('burn');
  for (let i = 0; i < 10; i += 1) applyStatus(enemy, def, burn, 30);
  assert.equal(enemy.statuses[0].stacks, 3, 'maxStacks is 3 and must be honoured');
});

test('an immune enemy refuses the status outright', () => {
  const { gameData } = setup();
  const enemy = /** @type {any} */ ({ statuses: [] });
  const armoured = gameData.enemies.get('armoured');
  const applied = applyStatus(enemy, armoured, gameData.statuses.get('slow'), 30);
  assert.equal(applied, false);
  assert.equal(enemy.statuses.length, 0);
});

test('two different slows compound rather than the stronger swallowing the weaker', () => {
  const { gameData } = setup();
  const enemy = /** @type {any} */ ({
    statuses: [{ id: 'slow', ticksLeft: 10, stacks: 1 }, { id: 'haste', ticksLeft: 10, stacks: 1 }],
  });
  // slow halves, haste doubles: together they cancel exactly.
  assert.equal(speedMultiplier(enemy, gameData.statuses), 1);
});

test('stun prevents action and burn damage scales with stacks', () => {
  const { gameData } = setup();
  const stunned = /** @type {any} */ ({ statuses: [{ id: 'stun', ticksLeft: 5, stacks: 1 }], maxHp: 100 });
  assert.equal(isStunned(stunned, gameData.statuses), true);

  const burning = /** @type {any} */ ({ statuses: [{ id: 'burn', ticksLeft: 5, stacks: 3 }], maxHp: 100 });
  assert.equal(damageOverTime(burning, gameData.statuses), 6, '2 per tick times 3 stacks');
});

test('a status deals damage on its final tick, then expires', () => {
  const { gameData } = setup();
  const enemy = /** @type {any} */ ({ statuses: [{ id: 'burn', ticksLeft: 1, stacks: 1 }], maxHp: 100 });
  assert.equal(damageOverTime(enemy, gameData.statuses), 2, 'still burning on its last tick');
  expireStatuses(enemy);
  assert.equal(enemy.statuses.length, 0, 'and gone immediately after');
});

test('a tagged status is what makes mark and consume work at all', () => {
  const { gameData } = setup();
  const enemy = /** @type {any} */ ({ statuses: [{ id: 'exposed', ticksLeft: 5, stacks: 1 }] });
  assert.equal(hasTag(enemy, gameData.statuses, 'marked'), true);
  assert.equal(hasTag(enemy, gameData.statuses, 'nonexistent'), false);
});

// --- damage -----------------------------------------------------------------

test('damage goes through the shield first, then flat reduction, then health', () => {
  const { gameData } = setup();
  const def = gameData.enemies.get('armoured');
  const enemy = /** @type {any} */ ({ hp: 100, maxHp: 100, shield: 50, statuses: [] });

  // 3 flat reduction applies before anything: 20 incoming becomes 17, all absorbed.
  const first = applyDamage(enemy, def, 20, gameData, null);
  assert.equal(enemy.shield, 33);
  assert.equal(enemy.hp, 100, 'health is untouched while a shield remains');
  assert.equal(first.dealt, 17);

  // 50 incoming becomes 47: 33 eats the shield, 14 reaches health.
  applyDamage(enemy, def, 50, gameData, null);
  assert.equal(enemy.shield, 0);
  assert.equal(enemy.hp, 86);
});

test('flat reduction can make a weak hit do literally nothing', () => {
  const { gameData } = setup();
  const def = gameData.enemies.get('armoured');
  const enemy = /** @type {any} */ ({ hp: 100, maxHp: 100, shield: 0, statuses: [] });
  const result = applyDamage(enemy, def, 3, gameData, null);
  assert.equal(result.dealt, 0);
  assert.equal(enemy.hp, 100);
});

test('a synergy tag multiplies damage, and only against a tagged target', () => {
  const { gameData } = setup();
  const def = gameData.enemies.get('grunt');
  const bonus = { tag: 'marked', damageMultiplier: 3 };

  const plain = /** @type {any} */ ({ hp: 100, maxHp: 100, shield: 0, statuses: [] });
  applyDamage(plain, def, 10, gameData, bonus);
  assert.equal(plain.hp, 90, 'no tag, no bonus');

  const marked = /** @type {any} */ ({
    hp: 100, maxHp: 100, shield: 0, statuses: [{ id: 'exposed', ticksLeft: 5, stacks: 1 }],
  });
  applyDamage(marked, def, 10, gameData, bonus);
  assert.equal(marked.hp, 70, 'tagged, so triple');
});

test('overkill is discarded and the reward is paid exactly once', () => {
  const { gameData } = setup();
  const def = gameData.enemies.get('grunt');
  const enemy = /** @type {any} */ ({ hp: 5, maxHp: 100, shield: 0, statuses: [] });
  const result = applyDamage(enemy, def, 9999, gameData, null);
  assert.equal(result.dealt, 5, 'only what was actually there');
  assert.equal(result.killed, true);
  assert.equal(result.reward, def.killReward);

  const again = applyDamage(enemy, def, 9999, gameData, null);
  assert.equal(again.reward, 0, 'a corpse pays nothing');
});

test('status damage bypasses flat reduction, which is the point of it', () => {
  const { gameData } = setup();
  const def = gameData.enemies.get('armoured');
  const enemy = /** @type {any} */ ({ hp: 100, maxHp: 100, shield: 0, statuses: [] });
  const result = applyTrueDamage(enemy, def, 2);
  assert.equal(result.dealt, 2, 'a 2 point burn on a 3 reduction enemy still burns');
  assert.equal(enemy.hp, 98);
});

test('simultaneous hits resolve in one fixed order', () => {
  const hits = [
    { sourceSeq: 3, targetSeq: 1 }, { sourceSeq: 1, targetSeq: 9 },
    { sourceSeq: 1, targetSeq: 2 }, { sourceSeq: 2, targetSeq: 5 },
  ];
  const ordered = orderHits(hits).map((h) => h.sourceSeq + ':' + h.targetSeq);
  assert.deepEqual(ordered, ['1:2', '1:9', '2:5', '3:1']);
  assert.deepEqual(orderHits([...hits].reverse()).map((h) => h.sourceSeq + ':' + h.targetSeq), ordered);
});

// --- auras ------------------------------------------------------------------

test('additive auras sum, multiplicative ones scale the sum, highest can win outright', () => {
  const auras = /** @type {any} */ ([
    { stat: 'damage', mode: 'additive', radius: 10, value: 5 },
    { stat: 'damage', mode: 'additive', radius: 10, value: 5 },
  ]);
  assert.equal(applyAuras(10, auras, 'damage'), 20);

  const mixed = /** @type {any} */ ([
    { stat: 'damage', mode: 'additive', radius: 10, value: 10 },
    { stat: 'damage', mode: 'multiplicative', radius: 10, value: 2 },
  ]);
  assert.equal(applyAuras(10, mixed, 'damage'), 40, '(10 + 10) doubled');

  const highest = /** @type {any} */ ([{ stat: 'damage', mode: 'highest', radius: 10, value: 10 }]);
  assert.equal(applyAuras(10, highest, 'damage'), 100);
});

test('an aura affects a neighbour but never the tower producing it', () => {
  const { gameData, state } = setup();
  state.towers.push(/** @type {any} */ ({
    seq: 1, defId: 'captain', level: 0, xFixed: 0, yFixed: 0, targeting: 'first',
    cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0, reloadTicks: 0,
    abilityCooldownTicks: 0, totalSpent: 300,
  }));
  state.towers.push(/** @type {any} */ ({
    seq: 2, defId: 'gunner', level: 0, xFixed: 5 * 1024, yFixed: 0, targeting: 'first',
    cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0, reloadTicks: 0,
    abilityCooldownTicks: 0, totalSpent: 100,
  }));

  assert.equal(effectiveStats(state, gameData, state.towers[1]).damage, 15, '10 base plus a 5 aura');
  assert.equal(effectiveStats(state, gameData, state.towers[0]).damage, 0, 'and it does not buff itself');
});

test('an aura out of radius does nothing', () => {
  const { gameData, state } = setup();
  state.towers.push(/** @type {any} */ ({
    seq: 1, defId: 'captain', level: 0, xFixed: 0, yFixed: 0, targeting: 'first',
    cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0, reloadTicks: 0, abilityCooldownTicks: 0, totalSpent: 300,
  }));
  state.towers.push(/** @type {any} */ ({
    seq: 2, defId: 'gunner', level: 0, xFixed: 500 * 1024, yFixed: 0, targeting: 'first',
    cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0, reloadTicks: 0, abilityCooldownTicks: 0, totalSpent: 100,
  }));
  assert.equal(effectiveStats(state, gameData, state.towers[1]).damage, 10);
});

// --- placement --------------------------------------------------------------

test('placement refuses with a reason a person could actually read', () => {
  const { gameData, state } = setup();
  const onPath = canPlace(state, gameData, 'gunner', 100, 50);
  assert.equal(onPath.ok, false);
  assert.match(/** @type {any} */ (onPath).reason, /cannot build here/);

  assert.equal(canPlace(state, gameData, 'gunner', 100, 80).ok, true, 'the south zone is ground');
});

test('terrain is checked against what the tower actually allows', () => {
  const { gameData, state } = setup();
  assert.equal(canPlace(state, gameData, 'gunner', 100, 20).ok, false, 'a gunner cannot take the ridge');
  assert.equal(canPlace(state, gameData, 'spotter', 100, 20).ok, true, 'a spotter can');
});

test('two towers cannot overlap', () => {
  const { gameData, state } = setup();
  state.towers.push(/** @type {any} */ ({
    seq: 1, defId: 'gunner', level: 0, xFixed: 100 * 1024, yFixed: 80 * 1024,
    targeting: 'first', cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0,
    reloadTicks: 0, abilityCooldownTicks: 0, totalSpent: 100,
  }));
  const verdict = canPlace(state, gameData, 'gunner', 100.5, 80);
  assert.equal(verdict.ok, false);
  assert.match(/** @type {any} */ (verdict).reason, /too close/);
});

test('a shared pool cap counts every tower in the pool', () => {
  const { gameData, state } = setup();
  state.cash = 10000;
  for (let i = 0; i < 2; i += 1) {
    state.towers.push(/** @type {any} */ ({
      seq: i + 1, defId: 'bank', level: 0, xFixed: (10 + i * 40) * 1024, yFixed: 80 * 1024,
      targeting: 'first', cooldownTicks: 0, spinUpTicks: 0, burstLeft: 0,
      reloadTicks: 0, abilityCooldownTicks: 0, totalSpent: 250,
    }));
  }
  const verdict = canPlace(state, gameData, 'bank', 150, 80);
  assert.equal(verdict.ok, false);
  assert.match(/** @type {any} */ (verdict).reason, /limit of 2/);
});

test('a difficulty can forbid a tower entirely', () => {
  const { gameData, state } = setup('brutal');
  state.cash = 10000;
  const verdict = canPlace(state, gameData, 'bank', 100, 80);
  assert.equal(verdict.ok, false);
  assert.match(/** @type {any} */ (verdict).reason, /not allowed on this difficulty/);
});

test('being unable to afford it is its own stated reason', () => {
  const { gameData, state } = setup();
  state.cash = 10;
  const verdict = canPlace(state, gameData, 'gunner', 100, 80);
  assert.equal(verdict.ok, false);
  assert.match(/** @type {any} */ (verdict).reason, /costs 100, you have 10/);
});
