/**
 * When an enemy's health bar is drawn, and how wide it is.
 *
 * A bar was drawn over every enemy unconditionally, at 2.6 map units wide against a
 * body about 2.27 across, so a wave in good health arrived as a row of green rectangles
 * with something smaller underneath each one. A full bar carries no information; the
 * thing worth seeing at a glance is which enemies are hurt.
 *
 * This is also the first check of any kind against CanvasRenderer, which is worth
 * saying out loud: the renderer is where a double fixed-point conversion once drew
 * every entity on top of the map origin without throwing anything or turning anything
 * red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CanvasRenderer, WORLD } from '../../src/render/renderer.js';
import { setCanvasFactory, useDefaultCanvasFactory, clearArtCache } from '../../src/render/art/cache.js';
import { fakeCanvasFactory, createFakeContext } from '../art/support/fake-context.js';
import { makeGameData } from '../fixtures/game-data.js';

function rendererFor() {
  clearArtCache();
  setCanvasFactory(fakeCanvasFactory());
  const gameData = makeGameData();
  const recorder = createFakeContext();
  const canvas = { width: 800, height: 600, style: {}, getContext: () => recorder.ctx };
  const renderer = new CanvasRenderer(canvas, gameData, gameData.maps.get('proving-ground'));
  return { renderer, recorder };
}

const CAMERA = { x: 100, y: 50, zoom: 12 };

/**
 * Rectangles shaped like a piece of a health bar: short, and wider than they are tall.
 * @param {{ calls: any[][] }} recorder
 */
function barRects(recorder) {
  // The art recorder stores {type, args}, not a positional array. Worth naming: the
  // interface recorder next door stores [name, ...args], and reading one with the
  // other's shape yields an empty list rather than an error, which looks exactly like
  // a renderer that drew nothing.
  return recorder.calls
    .filter((c) => c.type === 'fillRect')
    .map((c) => ({ x: c.args[0], y: c.args[1], w: c.args[2], h: c.args[3] }))
    // Height alone, deliberately. An earlier version also demanded a width above 8,
    // which threw away the coloured fill at low health -- exactly the rectangle these
    // checks are about -- and left the track behind in its place, so "the bar shortens"
    // was silently measuring the wrong rectangle.
    .filter((r) => r.h > 0 && r.h < 12);
}

/**
 * @param {number} hpCurrent
 * @returns {{ id: number, defId: string, x: number, y: number, hpCurrent: number, hpMax: number, shieldCurrent: number, statuses: any[] }}
 */
function grunt(hpCurrent) {
  return {
    id: 1, defId: 'grunt', x: 100, y: 50,
    hpCurrent, hpMax: 100, shieldCurrent: 0, statuses: [],
  };
}

test('a full-health enemy gets no health bar', () => {
  const { renderer, recorder } = rendererFor();
  renderer._drawEnemy(grunt(100), CAMERA, 800, 600);
  useDefaultCanvasFactory();
  assert.deepEqual(barRects(recorder), [], 'nothing bar-shaped belongs over an undamaged enemy');
});

test('a damaged enemy gets one', () => {
  const { renderer, recorder } = rendererFor();
  renderer._drawEnemy(grunt(40), CAMERA, 800, 600);
  useDefaultCanvasFactory();
  assert.ok(barRects(recorder).length >= 2, 'expected a track and a fill, got ' + barRects(recorder).length);
});

test('the bar is narrower than the enemy it belongs to', () => {
  // The specific thing that went wrong: a readout wider than its own subject stops
  // reading as a label on the thing and starts reading as the thing.
  assert.ok(
    WORLD.healthBarWidth < WORLD.enemy,
    'the bar (' + WORLD.healthBarWidth + ') must be narrower than the enemy box (' + WORLD.enemy + ')',
  );
});

test('the bar shortens as health falls', () => {
  const fillWidthAt = (hp) => {
    const { renderer, recorder } = rendererFor();
    renderer._drawEnemy(grunt(hp), CAMERA, 800, 600);
    useDefaultCanvasFactory();
    // The coloured fill is the narrowest of the rectangles the bar draws.
    return Math.min(...barRects(recorder).map((r) => r.w));
  };
  assert.ok(
    fillWidthAt(20) < fillWidthAt(80),
    'a nearly dead enemy must show less bar than a lightly hurt one',
  );
});
