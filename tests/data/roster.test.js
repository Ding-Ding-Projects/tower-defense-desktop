import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadGameData, RAW } from '../../src/data/loader.js';
import { createMatch, submitCommand, runTicks, TICK_RATE } from '../../src/sim/core/match.js';
import { snapshot } from '../../src/sim/state/snapshot.js';
import { proveDeterministic } from '../../src/sim/state/replay.js';
import { canPlace } from '../../src/sim/systems/placement.js';

const data = loadGameData();

test('every row says where it came from, and does not pretend', () => {
  const groups = [
    ['tower', RAW.towers], ['enemy', RAW.enemies], ['status', RAW.statuses],
    ['map', RAW.maps], ['difficulty', RAW.difficulties], ['wave table', RAW.waveTables],
  ];
  for (const [kind, rows] of groups) {
    for (const row of rows) {
      const where = kind + ' ' + (row.id ?? row.mapId + ':' + row.difficultyId);
      const source = row.source;
      assert.ok(source, where + ' has no source block');
      if (source.origin === 'engine-default') {
        assert.ok(source.reason && source.reason.length > 20, where + ' must say why it is a default');
        assert.equal(source.wikiUrl, undefined, where + ' must not carry a citation it did not come from');
      } else {
        assert.match(source.wikiUrl ?? '', /^https:\/\//, where + ' needs a real source URL');
        assert.match(source.retrievedAt ?? '', /^\d{4}-\d{2}-\d{2}$/, where + ' needs a retrieval date');
      }
    }
  }
});

test('the scraped tower statistics survived the conversion intact', () => {
  // Scout is the one whose numbers were read by eye off the page during the scrape, so
  // it is the one worth pinning. If this changes, either the source moved or the
  // conversion broke, and either way somebody should look.
  const scout = data.towers.get('scout');
  assert.ok(scout);
  assert.equal(scout.baseCost, 125);
  assert.equal(scout.levels.length, 5);
  assert.equal(scout.levels[0].damage, 1);
  assert.equal(scout.levels[4].damage, 8);
  // The page lists a 0.325 second cooldown at the top level. Read as a rate that
  // would be 0.325 shots per second; read correctly it is about 3.08.
  assert.ok(Math.abs(scout.levels[4].fireRate - 1 / 0.325) < 0.01, 'cooldown was converted to a rate');
  const topDps = scout.levels[4].damage * scout.levels[4].fireRate;
  assert.ok(Math.abs(topDps - 24.62) < 0.1, 'the page states 24.62 damage per second at the top level');
});

test('a boss is genuinely a boss', () => {
  const king = data.enemies.get('fallen-king');
  assert.ok(king);
  assert.equal(king.maxHp, 250000);
  assert.equal(king.boss, true);
  assert.ok(king.immunities.includes('stun'), 'a boss a single stun could hold is not a boss');
  assert.ok(king.abilities.length > 0);
});

test('every enemy a wave spawns and every enemy a boss summons actually exists', () => {
  for (const table of RAW.waveTables) {
    for (const wave of table.waves) {
      for (const group of wave.groups) {
        assert.ok(data.enemies.has(group.enemyId),
          table.mapId + ':' + table.difficultyId + ' wave ' + wave.index + ' spawns ' + group.enemyId);
      }
    }
  }
  for (const enemy of RAW.enemies) {
    for (const ability of enemy.abilities) {
      if (ability.kind !== 'summon') continue;
      assert.ok(data.enemies.has(ability.summonEnemyId), enemy.id + ' summons ' + ability.summonEnemyId);
      assert.notEqual(ability.summonEnemyId, enemy.id, enemy.id + ' summons itself, which never ends');
    }
  }
});

test('every status a tower applies exists, and every immunity names a real status', () => {
  for (const tower of RAW.towers) {
    for (const level of tower.levels) {
      for (const statusId of level.appliesStatuses ?? []) {
        assert.ok(data.statuses.has(statusId), tower.id + ' applies unknown status ' + statusId);
      }
    }
  }
  for (const enemy of RAW.enemies) {
    for (const statusId of enemy.immunities) {
      assert.ok(data.statuses.has(statusId), enemy.id + ' is immune to unknown status ' + statusId);
    }
  }
});

test('every map has somewhere the cheapest tower can actually shoot the lane from', () => {
  // The zones were originally authored thirty units from the path while the cheapest
  // tower had a range of twelve, so every tower placed in them shot at nothing and the
  // match reported zero kills with no error anywhere. A map whose buildable ground
  // cannot reach its own lane is a broken map, and nothing else catches it.
  const cheapest = [...data.towers.values()].sort((a, b) => a.baseCost - b.baseCost)[0];
  const range = cheapest.levels[0].range;

  // Distance to the nearest point on a SEGMENT, not to a waypoint. The first version
  // of this check measured to waypoints and failed a perfectly good map, because a
  // zone hugging the middle of a long straight is close to the lane and far from both
  // of its corners.
  const distanceToSegment = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };

  for (const map of RAW.maps) {
    const reachableZones = map.placementZones.filter((zone) => {
      const cx = zone.polygon.reduce((s, p) => s + p[0], 0) / zone.polygon.length;
      const cy = zone.polygon.reduce((s, p) => s + p[1], 0) / zone.polygon.length;
      return map.lanes.some((lane) =>
        lane.waypoints.slice(1).some((wp, i) =>
          distanceToSegment(cx, cy, lane.waypoints[i].x, lane.waypoints[i].y, wp.x, wp.y) <= range,
        ),
      );
    });
    assert.ok(reachableZones.length >= 2,
      map.id + ': only ' + reachableZones.length + ' zone(s) sit within ' + range +
        ' units of the lane, so the cheapest tower has almost nowhere useful to stand');
  }
});

test('a real match on real data actually kills things', () => {
  const match = createMatch({ gameData: data, seed: 2026, mapId: 'crossroads', difficultyId: 'casual' });
  for (const [towerId, x, y] of [['scout', 20, 70], ['scout', 30, 70], ['scout', 60, 68]]) {
    submitCommand(match, 'PlaceTower', { towerId, x, y });
  }
  runTicks(match, 5);
  assert.ok(match.state.towers.length >= 2, 'the towers should be affordable and placeable');

  runTicks(match, TICK_RATE * 90);
  const view = snapshot(match.state);
  assert.ok(view.killCount > 0, 'towers that never kill anything are towers shooting at nothing');
  assert.ok(view.waveIndex >= 1);
});

test('a real match on real data is still deterministic', () => {
  const result = proveDeterministic(
    { gameData: data, seed: 99, mapId: 'riverbend', difficultyId: 'intermediate' },
    [
      { tick: 4, kind: 'PlaceTower', payload: { towerId: 'scout', x: 20, y: 20 } },
      { tick: 8, kind: 'PlaceTower', payload: { towerId: 'scout', x: 34, y: 20 } },
      { tick: 200, kind: 'SetTargeting', payload: { seq: 1, mode: 'strongest' } },
    ],
    TICK_RATE * 90,
  );
  assert.equal(result.identical, true, 'diverged at tick ' + result.firstDivergenceTick);
});

test('a difficulty that bans a tower really refuses it', () => {
  const match = createMatch({ gameData: data, seed: 1, mapId: 'crossroads', difficultyId: 'hardcore' });
  match.state.cash = 99999;
  const verdict = canPlace(match.state, data, 'scout', 20, 70);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /not allowed on this difficulty/);
});

test('difficulties are ordered so that harder really is harder', () => {
  const order = ['easy', 'casual', 'intermediate', 'molten', 'fallen'];
  let previous = 0;
  for (const id of order) {
    const difficulty = data.difficulties.get(id);
    assert.ok(difficulty, id + ' should exist');
    assert.ok(difficulty.enemyHpMultiplier >= previous,
      id + ' has weaker enemies than the difficulty below it');
    previous = difficulty.enemyHpMultiplier;
  }
});
