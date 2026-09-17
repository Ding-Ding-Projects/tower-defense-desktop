/**
 * A brand new match does not open by announcing the one that just ended.
 *
 * It did. Starting a match from the setup screen opened with a card reading "Wave 0
 * cleared. No leaks got through." Three things remember the previous match, and this
 * drives the real renderer, the real interface layer and the real render loop through
 * the exact sequence the program performs -- including the animation frame that lands
 * between the transition and the next simulation tick, which is the window a
 * layer-only check skipped, and the reason that check stayed green while the program
 * showed the card.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { CanvasRenderer } from '../../src/render/renderer.js';
import { RenderLoop } from '../../src/render/loop.js';
import { InterfaceLayer } from '../../src/render/hud/interface-layer.js';
import { presentNewMatch } from '../../src/ui/match-transition.js';
import { setCanvasFactory, useDefaultCanvasFactory, clearArtCache } from '../../src/render/art/cache.js';
import { fakeCanvasFactory, createFakeContext } from '../art/support/fake-context.js';
import { createFakeHost } from '../hud/fake-dom.js';
import { makeGameData } from '../fixtures/game-data.js';

before(() => { clearArtCache(); setCanvasFactory(fakeCanvasFactory()); });
after(() => { useDefaultCanvasFactory(); clearArtCache(); });

const VIEW = { x: 0, y: 0, width: 1280, height: 800 };
const CAMERA = { x: 50, y: 50, zoom: 6 };

function stage() {
  const gameData = makeGameData();
  const recorder = createFakeContext();
  const canvas = { width: 1280, height: 800, style: {}, getContext: () => recorder.ctx };
  const renderer = new CanvasRenderer(canvas, gameData, gameData.maps.get('proving-ground'));
  const { doc, host } = createFakeHost();
  const layer = new InterfaceLayer({ doc });
  layer.mountAccessibilityMirror(host);
  renderer.interfaceLayer = layer;
  const loop = new RenderLoop(renderer);

  const snapshot = (phase, waveIndex) => ({
    tick: 0, simTimeSeconds: 0, cash: 1000, lives: 100, waveIndex, phase,
    intermissionSecondsRemaining: 0, mapId: 'proving-ground', difficultyId: 'standard',
    towers: [], enemies: [], projectiles: [], killCount: 0, leakCount: 0,
    waveCompletionBonus: 0, events: [],
  });
  const stateFor = (snap) => ({
    snapshot: snap, gameData, totalWaves: 40, selectedTowerId: null,
    placingTowerDefId: null, disallowedTowerIds: [], paused: false, uiScale: 1,
  });
  // What one animation frame does: draw whatever state the renderer is holding.
  const frame = () => renderer.draw(
    { towers: [], enemies: [], projectiles: [], events: [], phase: 'intermission' },
    CAMERA, loop.particles,
  );
  // What one simulation tick does: build a fresh state and hand it over.
  const tick = (snap) => { loop.pushSnapshot(snap); renderer.interfaceState = stateFor(snap); };
  const mirrored = () => host.children.flatMap((c) => c.children).map((el) => el.getAttribute('aria-label'));

  return { renderer, layer, loop, snapshot, stateFor, frame, tick, mirrored };
}

test('the stage reproduces the defect when nothing is reset, so the fix below means something', () => {
  const s = stage();
  s.tick(s.snapshot('intermission', 3)); s.frame();
  s.tick(s.snapshot('active', 3)); s.frame();
  s.layer.dismissOverlay();

  // A new match with no transition at all: the renderer still holds the old state.
  s.frame();
  s.tick(s.snapshot('intermission', 0)); s.frame();
  assert.ok(s.mirrored().includes('Next wave'), 'the stage cannot even reproduce the stale card');
});

test('a match started through the real transition opens clean', () => {
  const s = stage();
  s.tick(s.snapshot('intermission', 3)); s.frame();
  s.tick(s.snapshot('active', 3)); s.frame();
  s.layer.dismissOverlay();

  // The program's sequence: transition, then an animation frame BEFORE the next tick,
  // then the tick.
  presentNewMatch({
    interfaceLayer: s.layer, loop: s.loop, renderer: s.renderer,
    state: s.stateFor(s.snapshot('intermission', 0)),
  });
  s.frame();
  s.tick(s.snapshot('intermission', 0)); s.frame();

  const names = s.mirrored();
  assert.ok(!names.includes('Next wave'), 'a fresh match opened with a wave-cleared card: ' + names.join(', '));
  assert.ok(!names.includes('Continue'), 'a fresh match opened with a wave-start card: ' + names.join(', '));
});
