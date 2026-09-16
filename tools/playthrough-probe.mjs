#!/usr/bin/env node
/**
 * Play the real shipped game headlessly and report whether it can be won.
 *
 * Every other check in this repository runs against the synthetic fixture, which is
 * the right way to test a mechanic and tells you nothing about whether the numbers
 * actually on disk add up to a game somebody can finish. This plays crossroads and
 * riverbend with the real towers, the real waves and the real difficulty multipliers.
 *
 * The strategy is deliberately ordinary rather than optimal: build near the lane,
 * spread out, and spend spare money upgrading what is already standing before adding
 * anything new. A probe that plays perfectly proves the game is winnable by a machine;
 * a probe that plays badly proves nothing at all. This one plays like somebody who has
 * read the tooltips.
 *
 * Usage:  node tools/playthrough-probe.mjs
 *         node tools/playthrough-probe.mjs crossroads easy scout
 */

import { loadGameData } from '../src/data/loader.js';
import { createMatch, submitCommand, runTicks } from '../src/sim/core/match.js';
import { TICK_RATE } from '../src/sim/core/constants.js';
import { canPlace } from '../src/sim/systems/placement.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameData = loadGameData();

/**
 * Shortest distance from a point to a lane, measured to the SEGMENTS rather than to
 * the waypoints. Measuring to waypoints calls the middle of a long straight "far from
 * the lane", which is exactly where a tower most wants to stand.
 * @param {{ lanes: any[] }} mapDef
 * @param {number} px
 * @param {number} py
 */
function distanceToLane(mapDef, px, py) {
  let best = Infinity;
  for (const lane of mapDef.lanes) {
    for (let i = 0; i + 1 < lane.waypoints.length; i += 1) {
      const a = lane.waypoints[i];
      const b = lane.waypoints[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lengthSquared));
      const cx = a.x + dx * t;
      const cy = a.y + dy * t;
      best = Math.min(best, Math.hypot(px - cx, py - cy));
    }
  }
  return best;
}

/**
 * Legal spots for this tower, nearest the lane first, so the probe builds where a
 * tower can actually reach something.
 */
function buildableSpots(match, mapDef, towerId) {
  const spots = [];
  for (const zone of mapDef.placementZones) {
    const xs = zone.polygon.map((p) => p[0]);
    const ys = zone.polygon.map((p) => p[1]);
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1.5) {
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += 1.5) {
        if (canPlace(match.state, gameData, towerId, x, y).ok) {
          spots.push({ x, y, d: distanceToLane(mapDef, x, y) });
        }
      }
    }
  }
  return spots.sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y);
}

/**
 * @param {string} mapId
 * @param {string} difficultyId
 * @param {string} towerId
 * @param {{ maxSeconds?: number, upgradeFirst?: boolean }} [options]
 */
export function play(mapId, difficultyId, towerId, options = {}) {
  const maxSeconds = options.maxSeconds ?? 3600;
  const upgradeFirst = options.upgradeFirst !== false;
  const match = createMatch({ gameData, seed: 11, mapId, difficultyId });
  const mapDef = gameData.maps.get(mapId);
  const def = gameData.towers.get(towerId);

  // A difficulty may ban a tower outright: hardcore forbids Scout. Without this the
  // probe built nothing at all, lost on wave 5, and reported it as a difficulty result,
  // which reads exactly like a brutally hard tier rather than like a probe that never
  // played. A result nobody can distinguish from a broken run is not a result.
  const banned = gameData.difficulties.get(difficultyId).disallowedTowers ?? [];
  if (banned.includes(towerId)) {
    return { phase: 'unplayable', reason: towerId + ' is not allowed on ' + difficultyId };
  }
  let placed = 0;
  let upgrades = 0;

  for (let second = 0; second < maxSeconds; second += 1) {
    if (match.state.phase === 'won' || match.state.phase === 'lost') break;

    // Upgrading beats sprawling. A level 5 tower is worth far more than five level 1
    // ones, and a probe that only ever adds towers never exercises the upgrade path
    // the whole economy is built around.
    let spent = false;
    /** What was asked for this second, so the next tick can confirm it happened. */
    let intended = null;
    if (upgradeFirst) {
      const upgradable = match.state.towers
        .filter((t) => t.defId === towerId && t.level + 1 < def.levels.length)
        .sort((a, b) => a.level - b.level || a.seq - b.seq);
      for (const tower of upgradable) {
        const cost = def.levels[tower.level + 1].cost;
        if (match.state.cash >= cost) {
          // The payload key is `seq`, not `towerId`. Sending the wrong one is refused
          // rather than thrown, and the first version of this probe did exactly that
          // 594 times against a five-level tower while reporting every one as an
          // upgrade and never noticing.
          //
          // It is also not enough to look at what submitCommand returns: it returns
          // the QUEUED command, because commands resolve at a tick boundary rather
          // than on submission. So the only honest confirmation is the effect, checked
          // below once the ticks have run.
          submitCommand(match, 'UpgradeTower', { seq: tower.seq });
          intended = { kind: 'upgrade', seq: tower.seq, fromLevel: tower.level };
          spent = true;
          break;
        }
      }
    }

    if (!spent && match.state.cash >= def.baseCost) {
      const spots = buildableSpots(match, mapDef, towerId);
      if (spots.length > 0) {
        submitCommand(match, 'PlaceTower', { towerId, x: spots[0].x, y: spots[0].y });
        intended = { kind: 'place', towerCount: match.state.towers.length };
      }
    }

    runTicks(match, TICK_RATE);

    // Confirm the intent actually landed. A refused command is silent, and a probe that
    // cannot tell "I upgraded a tower" from "the simulation ignored me" reports a
    // confident playthrough of a game it never touched.
    // A command submitted on the last second of a match is refused, because the
    // simulation stops accepting them once the match is won or lost. That is correct
    // behaviour, not a lost command, so it is the one case these assertions allow.
    const matchOver = match.state.phase === 'won' || match.state.phase === 'lost';
    if (matchOver) {
      intended = null;
    } else if (intended && intended.kind === 'upgrade') {
      const after = match.state.towers.find((t) => t.seq === intended.seq);
      if (!after || after.level <= intended.fromLevel) {
        throw new Error('upgrade of tower ' + intended.seq + ' did not take effect');
      }
      upgrades += 1;
    } else if (intended && intended.kind === 'place') {
      if (match.state.towers.length <= intended.towerCount) {
        throw new Error('placement did not take effect');
      }
      placed += 1;
    }
  }

  return {
    phase: match.state.phase,
    wave: match.state.waveIndex,
    lives: match.state.lives,
    kills: match.state.killCount,
    leaks: match.state.leakCount,
    placed,
    upgrades,
  };
}

function report(mapId, difficultyId, towerId) {
  const r = play(mapId, difficultyId, towerId);
  if (r.phase === 'unplayable') {
    console.log((mapId + '/' + difficultyId + '/' + towerId).padEnd(36) + 'skipped  ' + r.reason);
    return;
  }
  console.log(
    (mapId + '/' + difficultyId + '/' + towerId).padEnd(36) +
      r.phase.padEnd(7) +
      ' wave ' + String(r.wave).padStart(2) +
      '  lives ' + String(r.lives).padStart(4) +
      '  kills ' + String(r.kills).padStart(4) +
      '  leaks ' + String(r.leaks).padStart(4) +
      '  built ' + String(r.placed).padStart(3) +
      '  upgrades ' + String(r.upgrades).padStart(3),
  );
}

const [mapArg, difficultyArg, towerArg] = process.argv.slice(2);

// Only when run as a command. Without this the whole matrix plays itself the moment a
// check imports `play`, which is twenty-four full forty-wave matches nobody asked for,
// on every single test run.
const invokedDirectly =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (!invokedDirectly) {
  // Imported as a library: nothing runs.
} else if (mapArg && difficultyArg && towerArg) {
  report(mapArg, difficultyArg, towerArg);
} else {
  for (const mapId of ['crossroads', 'riverbend']) {
    for (const difficultyId of ['easy', 'casual', 'intermediate', 'molten', 'fallen', 'hardcore']) {
      for (const towerId of ['scout', 'soldier']) report(mapId, difficultyId, towerId);
    }
  }
}
