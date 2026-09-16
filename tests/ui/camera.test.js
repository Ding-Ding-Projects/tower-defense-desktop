import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCamera,
  clampZoom,
  clampCamera,
  panCamera,
  zoomCamera,
  worldToScreen,
  screenToWorld,
  DEFAULT_MIN_ZOOM,
  DEFAULT_MAX_ZOOM,
} from '../../src/render/camera.js';

test('createCamera defaults to origin and zoom 1', () => {
  assert.deepEqual(createCamera(), { x: 0, y: 0, zoom: 1 });
  assert.deepEqual(createCamera({ x: 5 }), { x: 5, y: 0, zoom: 1 });
});

test('clampZoom bounds to the given min and max', () => {
  assert.equal(clampZoom(0.01, 0.5, 3), 0.5);
  assert.equal(clampZoom(50, 0.5, 3), 3);
  assert.equal(clampZoom(1.5, 0.5, 3), 1.5);
  assert.equal(clampZoom(10), DEFAULT_MAX_ZOOM);
  assert.equal(clampZoom(0.0001), DEFAULT_MIN_ZOOM);
});

test('clampCamera centers an axis when the viewport is bigger than the map', () => {
  const camera = createCamera({ x: 999, y: -999, zoom: 1 });
  const clamped = clampCamera(camera, {
    viewportWidth: 2000,
    viewportHeight: 2000,
    mapWidth: 40,
    mapHeight: 24,
  });
  assert.equal(clamped.x, 20, 'centers on mapWidth / 2');
  assert.equal(clamped.y, 12, 'centers on mapHeight / 2');
});

test('clampCamera keeps the viewport within map bounds when the map is bigger', () => {
  // Choose a viewport/zoom pair where the visible world extent (viewport / zoom)
  // is smaller than the map on *both* axes, so both x and y land in the real
  // clamp branch rather than the "viewport bigger than map, just center" branch.
  const bounds = { viewportWidth: 60, viewportHeight: 40, mapWidth: 40, mapHeight: 24, minZoom: 0.5, maxZoom: 3 };
  const camera = createCamera({ x: -100, y: 100, zoom: 3 });
  const clamped = clampCamera(camera, bounds);
  const halfViewW = bounds.viewportWidth / clamped.zoom / 2;
  const halfViewH = bounds.viewportHeight / clamped.zoom / 2;
  assert.ok(halfViewW * 2 < bounds.mapWidth, 'sanity: viewport narrower than the map on x');
  assert.ok(halfViewH * 2 < bounds.mapHeight, 'sanity: viewport narrower than the map on y');
  assert.ok(clamped.x >= halfViewW - 1e-9 && clamped.x <= bounds.mapWidth - halfViewW + 1e-9);
  assert.ok(clamped.y >= halfViewH - 1e-9 && clamped.y <= bounds.mapHeight - halfViewH + 1e-9);
});

test('clampCamera clamps zoom itself', () => {
  const camera = createCamera({ zoom: 99 });
  const clamped = clampCamera(camera, { viewportWidth: 10, viewportHeight: 10, mapWidth: 40, mapHeight: 24, minZoom: 0.5, maxZoom: 3 });
  assert.equal(clamped.zoom, 3);
});

test('panCamera adds a world-space delta', () => {
  const camera = createCamera({ x: 10, y: 10, zoom: 2 });
  const panned = panCamera(camera, 5, -3);
  assert.deepEqual(panned, { x: 15, y: 7, zoom: 2 });
});

test('zoomCamera multiplies and clamps', () => {
  const camera = createCamera({ zoom: 1 });
  const zoomedIn = zoomCamera(camera, 2, 0.5, 3);
  assert.equal(zoomedIn.zoom, 2);
  const clampedHigh = zoomCamera(camera, 100, 0.5, 3);
  assert.equal(clampedHigh.zoom, 3);
  const clampedLow = zoomCamera(camera, 0.001, 0.5, 3);
  assert.equal(clampedLow.zoom, 0.5);
});

test('worldToScreen and screenToWorld are inverses for a given camera and viewport', () => {
  const camera = createCamera({ x: 12, y: -4, zoom: 1.75 });
  const viewportWidth = 800;
  const viewportHeight = 600;
  const originalWorld = { x: 33.5, y: -12.25 };
  const screen = worldToScreen(camera, viewportWidth, viewportHeight, originalWorld.x, originalWorld.y);
  const roundTripped = screenToWorld(camera, viewportWidth, viewportHeight, screen.x, screen.y);
  assert.ok(Math.abs(roundTripped.x - originalWorld.x) < 1e-9);
  assert.ok(Math.abs(roundTripped.y - originalWorld.y) < 1e-9);
});

test('worldToScreen places the camera center at the viewport center', () => {
  const camera = createCamera({ x: 20, y: 12, zoom: 2 });
  const screen = worldToScreen(camera, 400, 300, 20, 12);
  assert.deepEqual(screen, { x: 200, y: 150 });
});
