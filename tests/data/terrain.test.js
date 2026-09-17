/**
 * Where a tower may be built, and whether the ground the maps offer is usable.
 *
 * Terrain was hand-written as `ground` for all twenty towers. Four of them are not:
 * Mortar, Ranger and Sniper are filed under Cliff on the wiki, and Gatling Gun under
 * both. The effect was not a wrong label on a data row -- it was that every cliff zone
 * on both shipped maps was permanently unbuildable, a strip of map that looks like a
 * placement zone, is drawn as one, and refuses every tower in the game.
 *
 * Nothing could have caught that from the tower side, because a tower restricted to
 * ground is a perfectly ordinary tower. It only shows up by asking the question from the
 * map's side: is there anything that can be built here at all?
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadGameData } from '../../src/data/loader.js';
import { createMatch, submitCommand, runTicks } from '../../src/sim/core/match.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const gameData = loadGameData();

/**
 * Terrains a map offers that no tower may be built on, and why that is acceptable.
 *
 * Hand-written, and an entry here is an admission rather than a way to silence the
 * check: a terrain listed must genuinely have no tower, so one that gains a tower turns
 * this red and the note has to come out.
 */
const UNBUILDABLE = [
  {
    terrain: 'water',
    reason: 'no tower in this tranche is filed under Water on the wiki. The roster is ' +
      '20 of roughly 40, and the maps are faithful to a game that has water towers, so ' +
      'the zone stays and waits for one rather than being deleted to make a check pass',
  },
];

function towersByTerrain() {
  /** @type {Map<string, string[]>} */
  const byTerrain = new Map();
  const dir = ROOT + 'src/data/towers/';
  for (const file of readdirSync(dir)) {
    const def = JSON.parse(readFileSync(dir + file, 'utf8'));
    for (const terrain of def.allowedTerrain) {
      if (!byTerrain.has(terrain)) byTerrain.set(terrain, []);
      /** @type {string[]} */ (byTerrain.get(terrain)).push(def.id);
    }
  }
  return byTerrain;
}

function terrainsOnMaps() {
  /** @type {Map<string, string[]>} */
  const byTerrain = new Map();
  const dir = ROOT + 'src/data/maps/';
  for (const file of readdirSync(dir)) {
    const map = JSON.parse(readFileSync(dir + file, 'utf8'));
    for (const zone of map.placementZones ?? []) {
      if (!byTerrain.has(zone.terrain)) byTerrain.set(zone.terrain, []);
      /** @type {string[]} */ (byTerrain.get(zone.terrain)).push(map.id + '/' + zone.id);
    }
  }
  return byTerrain;
}

test('the roster is not all one terrain, which is what it used to be', () => {
  // A uniform roster and a correctly-read uniform roster look identical. This is the
  // cheapest way to notice the reader going back to answering `ground` every time.
  const byTerrain = towersByTerrain();
  assert.ok(
    byTerrain.size > 1,
    'every tower allows the same terrain: ' + [...byTerrain.keys()].join(', '),
  );
});

test('the four cliff towers the wiki names are the four on disk', () => {
  const byTerrain = towersByTerrain();
  assert.deepEqual(
    (byTerrain.get('cliff') ?? []).sort(),
    ['gatling-gun', 'mortar', 'ranger', 'sniper'],
    'the wiki files Mortar, Ranger and Sniper under Cliff, and Gatling Gun under both',
  );
  // Gatling Gun is the one that is both, so a reader that only ever kept the last
  // category would drop it from ground and nothing else would notice.
  assert.ok(
    (byTerrain.get('ground') ?? []).includes('gatling-gun'),
    'Gatling Gun is filed under Ground and Cliff, and has lost one of them',
  );
});

test('every terrain a map offers can be built on, or says why not', () => {
  const buildable = towersByTerrain();
  const excused = new Set(UNBUILDABLE.map((u) => u.terrain));
  const dead = [...terrainsOnMaps().entries()]
    .filter(([terrain]) => !buildable.has(terrain) && !excused.has(terrain))
    .map(([terrain, zones]) => terrain + ' (' + zones.join(', ') + ')');
  assert.deepEqual(
    dead, [],
    'these zones are drawn on a map and refuse every tower in the game: ' + dead.join('; '),
  );
});

test('a terrain excused as unbuildable really has no tower', () => {
  const buildable = towersByTerrain();
  const stale = UNBUILDABLE
    .filter((u) => buildable.has(u.terrain))
    .map((u) => u.terrain + ' (now buildable by ' + (buildable.get(u.terrain) ?? []).join(', ') + ')');
  assert.deepEqual(
    stale, [],
    'these carry a note saying nothing can be built on them, and something can: ' +
      stale.join('; ') + '. Remove the note rather than leaving a false explanation.',
  );
});

test('a cliff tower can actually be placed on a cliff, and reach the lane', () => {
  // The part a data row cannot promise. A terrain correction that puts three towers on
  // ground they can stand on but not shoot from is worse than leaving them where they
  // were, because it looks right everywhere except in play.
  for (const mapId of ['crossroads', 'riverbend']) {
    const map = gameData.maps.get(mapId);
    const cliffZones = map.placementZones.filter((z) => z.terrain === 'cliff');
    assert.ok(cliffZones.length > 0, mapId + ' has no cliff zone');

    const match = createMatch({ gameData, seed: 4, mapId, difficultyId: 'easy' });
    match.state.cash = 1000000;

    const zone = cliffZones[0];
    const xs = zone.polygon.map((p) => (Array.isArray(p) ? p[0] : p.x));
    const ys = zone.polygon.map((p) => (Array.isArray(p) ? p[1] : p.y));

    let placed = null;
    for (let x = Math.min(...xs); x <= Math.max(...xs) && !placed; x += 0.5) {
      for (let y = Math.min(...ys); y <= Math.max(...ys) && !placed; y += 0.5) {
        submitCommand(match, 'PlaceTower', { towerId: 'mortar', x, y });
        runTicks(match, 3);
        placed = match.state.towers[0] ?? null;
      }
    }
    assert.ok(placed, 'a Mortar cannot be placed anywhere in ' + mapId + '/' + zone.id);

    // And it can reach something walking the lane.
    const range = gameData.towers.get('mortar').levels[0].range;
    const reach = Math.min(...map.lanes.flatMap((lane) => lane.waypoints.map((w) => {
      const wx = Array.isArray(w) ? w[0] : w.x;
      const wy = Array.isArray(w) ? w[1] : w.y;
      return Math.hypot(wx - placed.xFixed / 1024, wy - placed.yFixed / 1024);
    })));
    assert.ok(
      reach <= range,
      'a Mortar on ' + mapId + '/' + zone.id + ' is ' + reach.toFixed(1) +
        ' from the nearest point of the lane and has a range of ' + range,
    );
  }
});
