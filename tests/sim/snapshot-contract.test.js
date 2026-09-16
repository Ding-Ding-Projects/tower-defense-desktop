import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMatch, submitCommand, runTicks, TICK_RATE } from '../../src/sim/core/match.js';
import { snapshot } from '../../src/sim/state/snapshot.js';
import { buildViewModel } from '../../src/render/view-model.js';
import { loadGameData } from '../../src/data/loader.js';

/**
 * The seam between the simulation and the interface, pinned.
 *
 * This exists because of a defect that produced no error of any kind. The two halves
 * were built in parallel and agreed on every function name and disagreed on two
 * field names and one unit. The interface converts coordinates out of fixed point
 * itself; the simulation was converting them too. Dividing by 1024 twice put every
 * tower, enemy and projectile within a fraction of a unit of the map's top-left
 * corner, where they piled into one smudge that read as a stray decoration.
 *
 * Nothing threw. No check failed. The lane simply looked empty, and the obvious
 * conclusion, that the simulation was frozen, was wrong. It was running perfectly and
 * drawing itself into a corner.
 *
 * So the contract is asserted rather than assumed, and the last check here is the one
 * that matters: run a real snapshot through the real view model and require the
 * coordinates to land on the map.
 */

const data = loadGameData();

function playingMatch(ticks = TICK_RATE * 14) {
  const match = createMatch({ gameData: data, seed: 5, mapId: 'crossroads', difficultyId: 'easy' });
  submitCommand(match, 'PlaceTower', { towerId: 'scout', x: 20, y: 70 });
  runTicks(match, ticks);
  return match;
}

test('the snapshot uses the field names the interface actually reads', () => {
  const match = playingMatch();
  const view = snapshot(match.state);

  assert.ok(view.enemies.length > 0, 'need at least one enemy for this to mean anything');
  const enemy = view.enemies[0];
  for (const field of ['id', 'defId', 'x', 'y', 'hpCurrent', 'hpMax', 'shieldCurrent', 'statuses']) {
    assert.ok(field in enemy, 'an enemy must carry ' + field + ', which the interface reads');
  }
  assert.ok(!('hp' in enemy), 'hp was renamed to hpCurrent; leaving both invites the old bug back');
  assert.ok(!('maxHp' in enemy), 'maxHp was renamed to hpMax');

  assert.ok(view.towers.length > 0, 'need a tower for this to mean anything');
  const tower = view.towers[0];
  for (const field of ['id', 'defId', 'x', 'y', 'level', 'targetingMode', 'abilityCooldownRemainingSeconds']) {
    assert.ok(field in tower, 'a tower must carry ' + field);
  }
  assert.ok(!('targeting' in tower), 'targeting was renamed to targetingMode');
});

test('snapshot coordinates are fixed point, because the interface converts them itself', () => {
  const match = playingMatch();
  const view = snapshot(match.state);

  for (const entity of [...view.enemies, ...view.towers]) {
    assert.ok(Number.isInteger(entity.x), 'x must be a fixed-point integer, got ' + entity.x);
    assert.ok(Number.isInteger(entity.y), 'y must be a fixed-point integer, got ' + entity.y);
  }

  // A map coordinate in fixed point is roughly a thousand times its map-unit value, so
  // anything small enough to pass for a map unit is the double-conversion bug.
  const map = data.maps.get('crossroads');
  const tower = view.towers[0];
  assert.ok(
    tower.x > map.width,
    'a fixed-point x of ' + tower.x + ' on a ' + map.width +
      ' unit map has already been converted once too often',
  );
});

test('a real snapshot through the real view model lands on the map, not in its corner', () => {
  const match = playingMatch();
  const before = snapshot(match.state);
  runTicks(match, 4);
  const after = snapshot(match.state);

  const view = buildViewModel(before, after, 0.5);
  const map = data.maps.get('crossroads');

  assert.ok(view.enemies.length > 0, 'the view model dropped every enemy');
  assert.ok(view.towers.length > 0, 'the view model dropped every tower');

  for (const entity of [...view.enemies, ...view.towers]) {
    assert.ok(
      entity.x >= -1 && entity.x <= map.width + 1,
      entity.defId + ' drew at x=' + entity.x + ', outside a map ' + map.width + ' units wide',
    );
    assert.ok(
      entity.y >= -1 && entity.y <= map.height + 1,
      entity.defId + ' drew at y=' + entity.y + ', outside a map ' + map.height + ' units tall',
    );
  }

  // The specific failure: everything within a whisker of the origin. One entity there
  // is possible; every entity there means the coordinates were divided twice.
  const nearOrigin = [...view.enemies, ...view.towers].filter((e) => Math.abs(e.x) < 1 && Math.abs(e.y) < 1);
  assert.notEqual(
    nearOrigin.length,
    view.enemies.length + view.towers.length,
    'every entity landed on the origin, which is what a double fixed-point conversion looks like',
  );
});

test('a tower placed at a known spot appears there, and not somewhere else', () => {
  const match = createMatch({ gameData: data, seed: 9, mapId: 'crossroads', difficultyId: 'easy' });
  submitCommand(match, 'PlaceTower', { towerId: 'scout', x: 20, y: 70 });
  runTicks(match, 4);

  const a = snapshot(match.state);
  runTicks(match, 2);
  const b = snapshot(match.state);
  const view = buildViewModel(a, b, 1);

  assert.equal(view.towers.length, 1);
  const tower = view.towers[0];
  assert.ok(Math.abs(tower.x - 20) < 0.5, 'placed at x=20, drew at x=' + tower.x);
  assert.ok(Math.abs(tower.y - 70) < 0.5, 'placed at y=70, drew at y=' + tower.y);
});

test('enemies move between snapshots, so the interface has something to interpolate', () => {
  const match = playingMatch();
  const a = snapshot(match.state);
  runTicks(match, TICK_RATE);
  const b = snapshot(match.state);

  const shared = a.enemies.filter((e) => b.enemies.some((o) => o.id === e.id));
  assert.ok(shared.length > 0, 'no enemy survived a second, so movement cannot be checked');

  const moved = shared.some((e) => {
    const later = b.enemies.find((o) => o.id === e.id);
    return later.x !== e.x || later.y !== e.y;
  });
  assert.ok(moved, 'no enemy moved in a whole second; the interface would draw a still frame');
});
