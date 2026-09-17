/**
 * Every drawing routine the renderer imports is actually reached by a real match.
 *
 * `drawMuzzleFlash` was written, finished and imported, and had never once been called.
 * The branch that calls it needed a `towerFired` event, the simulation emitted none,
 * and the type declaring what an event may be did not list that type at all -- so the
 * branch was unreachable, and it read on the page as a working feature.
 *
 * Nothing static could find that. The function was imported and it was called; the call
 * simply sat behind a condition that could never be true. So this drives the real
 * renderer with a real match and records which routines actually execute, which is the
 * only way to tell a feature from a drawing of one.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CanvasRenderer } from '../../src/render/renderer.js';
import { setCanvasFactory, useDefaultCanvasFactory, clearArtCache } from '../../src/render/art/cache.js';
import { fakeCanvasFactory, createFakeContext } from '../art/support/fake-context.js';
import { loadGameData } from '../../src/data/loader.js';
import { createMatch, submitCommand, runTicks } from '../../src/sim/core/match.js';
import { snapshot } from '../../src/sim/state/snapshot.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

before(() => {
  clearArtCache();
  setCanvasFactory(fakeCanvasFactory());
});
after(() => {
  useDefaultCanvasFactory();
  clearArtCache();
});

/** The effect kinds the renderer's own effect list can hold, read from its pushes. */
function effectKindsPushed() {
  const source = readFileSync(ROOT + 'src/render/renderer.js', 'utf8');
  const start = source.indexOf('_handleEvent(event, particles, now) {');
  assert.ok(start > 0, 'could not find the event handler definition');
  const handler = source.slice(start, source.indexOf('_drawEffects(camera, w, h, now) {', start));
  assert.match(handler, /this\._effects\.push/, 'the slice is not the event handler');
  return new Set([...handler.matchAll(/kind: '(\w+)'/g)].map((m) => m[1]));
}

/** The effect kinds `_drawEffects` knows how to draw. */
function effectKindsDrawn() {
  const source = readFileSync(ROOT + 'src/render/renderer.js', 'utf8');
  const start = source.indexOf('_drawEffects(camera, w, h, now) {');
  assert.ok(start > 0, 'could not find the effect drawing loop');
  const loop = source.slice(start, start + 1800);
  assert.match(loop, /this\._effects = surviving/, 'the slice is not the whole drawing loop');
  return new Set([...loop.matchAll(/effect\.kind === '(\w+)'/g)].map((m) => m[1]));
}

test('the reading works, so the comparison below means something', () => {
  // Both would report an empty set if their anchors stopped matching, and two empty
  // sets compare equal. That exact mistake is what made the first version of the sibling
  // check pass while reading six lines of the wrong function.
  assert.ok(effectKindsPushed().size >= 3, 'read ' + effectKindsPushed().size + ' pushed kinds');
  assert.ok(effectKindsDrawn().size >= 3, 'read ' + effectKindsDrawn().size + ' drawn kinds');
});

test('every effect the renderer creates, it also knows how to draw', () => {
  const pushed = [...effectKindsPushed()].sort();
  const drawn = effectKindsDrawn();
  const invisible = pushed.filter((kind) => !drawn.has(kind));
  assert.deepEqual(
    invisible, [],
    'these effects are created and never drawn, so they expire unseen: ' + invisible.join(', '),
  );
});

test('every effect the renderer can draw, something actually creates', () => {
  // The direction that left a finished muzzle flash dead: a drawing routine wired to a
  // kind nothing produces.
  const pushed = effectKindsPushed();
  const drawn = [...effectKindsDrawn()].sort();
  const unreachable = drawn.filter((kind) => !pushed.has(kind));
  assert.deepEqual(
    unreachable, [],
    'the renderer draws these and nothing creates them: ' + unreachable.join(', '),
  );
});

test('a real match drives the renderer through every effect it has', () => {
  // The whole point. The two checks above compare source text and would be satisfied by
  // an effect pushed from a branch nothing reaches, which is precisely the state the
  // muzzle flash was in.
  const gameData = loadGameData();
  const map = gameData.maps.get('crossroads');
  const match = createMatch({ gameData, seed: 11, mapId: 'crossroads', difficultyId: 'easy' });
  match.state.cash = 1000000;

  const recorder = createFakeContext();
  const canvas = { width: 1280, height: 800, style: {}, getContext: () => recorder.ctx };
  const renderer = new CanvasRenderer(canvas, gameData, map);
  renderer.reducedMotion = false;

  /** @type {Set<string>} */
  const created = new Set();
  const realPush = renderer._effects.push.bind(renderer._effects);
  renderer._effects.push = (...effects) => {
    for (const effect of effects) created.add(effect.kind);
    return realPush(...effects);
  };

  const waypoints = map.lanes[0].waypoints;
  const toLane = (x, y) => Math.min(...waypoints.map((p) => Math.hypot(p.x - x, p.y - y)));
  const spots = [];
  for (let x = 1; x < 100; x += 1) {
    for (let y = 1; y < 100; y += 1) {
      const d = toLane(x, y);
      if (d > 1.5 && d < 4) spots.push({ x, y, d });
    }
  }
  spots.sort((a, b) => (a.d === b.d ? a.x - b.x || a.y - b.y : a.d - b.d));

  let now = 0;
  const step = () => {
    runTicks(match, 1);
    now += 34;
    // Driven one tick at a time because events are cleared at the start of each tick,
    // so a renderer fed every third snapshot sees a third of what happened.
    const shot = snapshot(match.state);
    for (const event of shot.events) {
      renderer._handleEvent(event, { emitDamageNumber() {} }, now);
    }
  };
  const steps = (n) => { for (let i = 0; i < n; i += 1) step(); };

  let tower = null;
  for (const spot of spots) {
    submitCommand(match, 'PlaceTower', { towerId: 'freezer', x: spot.x, y: spot.y });
    steps(3);
    tower = match.state.towers[0] ?? null;
    if (tower) break;
  }
  assert.ok(tower, 'could not place a Freezer beside the lane');

  for (let i = 0; i < 4; i += 1) {
    submitCommand(match, 'UpgradeTower', { seq: tower.seq });
    steps(3);
  }
  assert.equal(tower.level, 4, 'the tower never reached the level with the ability');

  const wanted = effectKindsPushed();
  for (let k = 0; k < 4000; k += 1) {
    step();
    if (tower.abilityCooldownTicks === 0 && match.state.enemies.length > 0) {
      submitCommand(match, 'UseAbility', { seq: tower.seq });
      steps(3);
    }
    if ([...wanted].every((kind) => created.has(kind))) break;
  }

  const never = [...wanted].filter((kind) => !created.has(kind)).sort();
  assert.deepEqual(
    never, [],
    'a full match never produced these effects, so whatever draws them is dead code: ' +
      never.join(', ') + '. Produced: ' + [...created].sort().join(', '),
  );
});
