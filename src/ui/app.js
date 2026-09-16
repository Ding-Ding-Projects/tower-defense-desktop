/**
 * Top-level bootstrap. Wires the canvas renderer, the render loop, the 30 Hz
 * simulation tick, the title bar, the HUD, the shop, the selected-tower panel,
 * the wave-state overlays and the pause/settings surfaces into index.html.
 *
 * This file is DOM/runtime integration glue and is not covered by node --test
 * (it needs a real window, canvas and requestAnimationFrame); the logic it
 * calls into (view-model, camera, affordability, targeting, interpolation) is
 * covered in tests/ui. Verification for this file is a real built app driven
 * headlessly and screenshotted — see docs/features/interface.md.
 */
import './components/register.js';
import * as sim from '../render/sim-source.js';
import { SIM_TICK_INTERVAL_MS } from '../render/sim-interface.js';
import { CanvasRenderer } from '../render/renderer.js';
import { RenderLoop } from '../render/loop.js';
import { createCamera, clampCamera, panCamera, zoomCamera, screenToWorld } from '../render/camera.js';
import { fromFixed } from '../sim/core/fixed.js';
import { createTitleBar } from './titlebar.js';
import { Hud } from './hud.js';
import { ShopPanel } from './shop.js';
import { SelectedTowerPanel } from './selected-tower-panel.js';
import { GameStateOverlays } from './game-states.js';
import { PauseAndSettings } from './pause-settings.js';
import { ALL_TARGETING_MODES, cycleTargetingMode } from './targeting.js';

// Zoom is pixels per map unit. A map is a couple of hundred units across and a
// canvas is a couple of thousand pixels, so the useful range sits well above one.
// The original ceiling of 3 clamped the fit to a quarter of the available screen.
const MIN_ZOOM = 2;
const MAX_ZOOM = 24;

export function bootstrap(doc = document) {
  const root = doc.getElementById('app-root');
  const gameData = sim.getGameData();
  const mapDef = [...gameData.maps.values()][0];
  // Chosen from the data rather than named in code. The first version of this line
  // hardcoded the development stub identifiers, so once the real roster landed the
  // match could not be created at all: the window opened, the chrome rendered, and
  // the battlefield and the shop were simply empty with nothing reported anywhere.
  const difficultyDef =
    [...gameData.difficulties.values()].find((d) => d.selectable) ??
    [...gameData.difficulties.values()][0];
  if (!mapDef || !difficultyDef) {
    throw new Error('no map or difficulty in the loaded data; there is nothing to play');
  }

  root.appendChild(createTitleBar(doc));

  const main = doc.createElement('main');
  main.className = 'game-layout';

  const canvas = doc.createElement('canvas');
  canvas.className = 'game-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Tower defence battlefield. Use the shop and tower panel to play; arrow keys pan the camera, +/- zoom.');

  const sidebar = doc.createElement('aside');
  sidebar.className = 'sidebar';
  const shop = new ShopPanel(doc);
  const towerPanel = new SelectedTowerPanel(doc);
  sidebar.append(shop.el, towerPanel.el);

  const hud = new Hud(doc);

  const pauseButton = doc.createElement('md3-icon-button');
  pauseButton.setAttribute('icon', 'pause');
  pauseButton.setAttribute('aria-label', 'Pause');
  pauseButton.className = 'pause-button';

  main.append(canvas, sidebar, hud.el, pauseButton);
  root.appendChild(main);

  const overlays = new GameStateOverlays(doc);
  overlays.mount(root);
  const pauseSettings = new PauseAndSettings(doc);
  pauseSettings.mount(root);

  const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  pauseSettings.setSystemReducedMotionHint(reducedMotionQuery?.matches ?? false);

  const renderer = new CanvasRenderer(canvas, gameData, mapDef);
  const loop = new RenderLoop(renderer);
  renderer.reducedMotion = reducedMotionQuery?.matches ?? false;

  let fittedOnce = false;
  let camera = createCamera({ x: mapDef.width / 2, y: mapDef.height / 2, zoom: 1 });
  let paused = false;
  let placingTowerDefId = null;
  let selectedTowerId = null;
  let matchState = sim.createMatch({ seed: 1, mapId: mapDef.id, difficultyId: difficultyDef.id });
  let lastPhase = null;
  const waveTable = gameData.waveTables.get(mapDef.id + ':' + difficultyDef.id);
  const totalWaves = waveTable ? waveTable.waves.length : 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    // Fit the whole map into the viewport on first paint. Map units are the same
    // units tower ranges are quoted in, so a 200 unit map at zoom 1 occupied 200
    // pixels of a 1920 pixel canvas: a correct picture of the battlefield, drawn
    // the size of a postage stamp in the corner.
    if (!fittedOnce) {
      const fit = Math.min(rect.width / mapDef.width, rect.height / mapDef.height) * 0.92;
      camera = createCamera({
        x: mapDef.width / 2,
        y: mapDef.height / 2,
        zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fit)),
      });
      fittedOnce = true;
    }
    camera = clampCamera(camera, {
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      mapWidth: mapDef.width,
      mapHeight: mapDef.height,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    });
    loop.setCamera(camera);
  }
  window.addEventListener('resize', resize);

  // --- input: pan, zoom, select/place ---
  let isDragging = false;
  let dragLast = null;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    isDragging = true;
    dragLast = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', (e) => {
    const moved = dragLast && Math.hypot(e.clientX - dragLast.x, e.clientY - dragLast.y) > 4;
    isDragging = false;
    if (!moved) handleCanvasClick(e);
  });
  canvas.addEventListener('pointerleave', () => { isDragging = false; });
  canvas.addEventListener('pointermove', (e) => {
    if (!isDragging || !dragLast) return;
    const dx = (e.clientX - dragLast.x) / camera.zoom;
    const dy = (e.clientY - dragLast.y) / camera.zoom;
    dragLast = { x: e.clientX, y: e.clientY };
    camera = clampAfterPan(panCamera(camera, -dx, -dy));
    loop.setCamera(camera);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    camera = clampAfterPan(zoomCamera(camera, factor, MIN_ZOOM, MAX_ZOOM));
    loop.setCamera(camera);
  }, { passive: false });

  function clampAfterPan(cam) {
    const rect = canvas.getBoundingClientRect();
    return clampCamera(cam, {
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      mapWidth: mapDef.width,
      mapHeight: mapDef.height,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    });
  }

  function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const world = screenToWorld(camera, rect.width, rect.height, e.clientX - rect.left, e.clientY - rect.top);
    if (placingTowerDefId) {
      sim.submitCommand(matchState, { type: 'placeTower', defId: placingTowerDefId, x: world.x, y: world.y });
      placingTowerDefId = null;
      renderer.placingTowerDefId = null;
      return;
    }
    const snap = sim.snapshot(matchState);
    const hit = snap.towers.find((t) => Math.hypot(fromFixed(t.x) - world.x, fromFixed(t.y) - world.y) < 1.2);
    selectedTowerId = hit ? hit.id : null;
    renderer.selectedTowerId = selectedTowerId;
    if (!hit) towerPanel.clear();
  }

  canvas.addEventListener('keydown', (e) => {
    const step = 2 / camera.zoom;
    if (e.key === 'ArrowLeft') camera = clampAfterPan(panCamera(camera, -step, 0));
    else if (e.key === 'ArrowRight') camera = clampAfterPan(panCamera(camera, step, 0));
    else if (e.key === 'ArrowUp') camera = clampAfterPan(panCamera(camera, 0, -step));
    else if (e.key === 'ArrowDown') camera = clampAfterPan(panCamera(camera, 0, step));
    else if (e.key === '+' || e.key === '=') camera = clampAfterPan(zoomCamera(camera, 1.1, MIN_ZOOM, MAX_ZOOM));
    else if (e.key === '-') camera = clampAfterPan(zoomCamera(camera, 1 / 1.1, MIN_ZOOM, MAX_ZOOM));
    else if (e.key === 'Escape') {
      if (placingTowerDefId) { placingTowerDefId = null; renderer.placingTowerDefId = null; }
      else { selectedTowerId = null; renderer.selectedTowerId = null; towerPanel.clear(); }
    } else return;
    loop.setCamera(camera);
  });

  // --- shop / tower panel wiring ---
  root.addEventListener('tower-shop-select', (e) => {
    placingTowerDefId = e.detail.defId;
    renderer.placingTowerDefId = placingTowerDefId;
    selectedTowerId = null;
    renderer.selectedTowerId = null;
    towerPanel.clear();
  });
  root.addEventListener('tower-panel-upgrade', () => {
    if (selectedTowerId) sim.submitCommand(matchState, { type: 'upgradeTower', towerId: selectedTowerId });
  });
  root.addEventListener('tower-panel-sell', () => {
    if (selectedTowerId) {
      sim.submitCommand(matchState, { type: 'sellTower', towerId: selectedTowerId });
      selectedTowerId = null;
      renderer.selectedTowerId = null;
      towerPanel.clear();
    }
  });
  root.addEventListener('tower-panel-cast-ability', () => {
    if (selectedTowerId) sim.submitCommand(matchState, { type: 'castAbility', towerId: selectedTowerId });
  });
  root.addEventListener('tower-panel-cycle-targeting', () => {
    if (!selectedTowerId) return;
    const snap = sim.snapshot(matchState);
    const tower = snap.towers.find((t) => t.id === selectedTowerId);
    if (!tower) return;
    const def = gameData.towers.get(tower.defId);
    const nextMode = cycleTargetingMode(tower.targetingMode, def.targetingModes ?? ALL_TARGETING_MODES, 1);
    sim.submitCommand(matchState, { type: 'setTargetingMode', towerId: selectedTowerId, mode: nextMode });
  });
  root.addEventListener('hud-skip-intermission', () => {
    sim.submitCommand(matchState, { type: 'skipIntermission' });
  });

  // --- pause / settings ---
  pauseButton.addEventListener('click', () => { paused = true; pauseSettings.openPause(); });
  root.addEventListener('pause-resume', () => { paused = false; });
  root.addEventListener('settings-reduced-motion-change', (e) => {
    renderer.reducedMotion = e.detail.reducedMotion;
  });

  // --- wave-state overlays ---
  root.addEventListener('game-state-continue', () => {});
  root.addEventListener('game-state-restart', () => {
    matchState = sim.createMatch({ seed: Date.now() >>> 0, mapId: mapDef.id, difficultyId: difficultyDef.id });
    selectedTowerId = null;
    renderer.selectedTowerId = null;
    towerPanel.clear();
    lastPhase = null;
  });

  // --- fixed-rate simulation tick, decoupled from the render loop ---
  const tickTimer = window.setInterval(() => {
    if (paused) return;
    sim.tick(matchState);
    const snap = sim.snapshot(matchState);
    loop.pushSnapshot(snap);

    if (snap.phase !== lastPhase) {
      if (snap.phase === 'active' && lastPhase === 'intermission') overlays.showWaveStart(snap.waveIndex, totalWaves);
      else if (snap.phase === 'intermission' && lastPhase === 'active') overlays.showWaveClear(snap.waveIndex, 0);
      else if (snap.phase === 'victory') overlays.showVictory(totalWaves);
      else if (snap.phase === 'defeat') overlays.showDefeat(snap.waveIndex);
      lastPhase = snap.phase;
    }

    const placementPoolCounts = new Map();
    for (const t of snap.towers) {
      placementPoolCounts.set(t.defId, (placementPoolCounts.get(t.defId) ?? 0) + 1);
    }
    shop.update(gameData.towers, snap.cash, placementPoolCounts, [], placingTowerDefId);
    hud.update({ cash: snap.cash, lives: snap.lives, waveIndex: snap.waveIndex, phase: snap.phase, intermissionSecondsRemaining: snap.intermissionSecondsRemaining }, totalWaves);

    if (selectedTowerId) {
      const tower = snap.towers.find((t) => t.id === selectedTowerId);
      if (tower) {
        const def = gameData.towers.get(tower.defId);
        towerPanel.update(def, { ...tower }, snap.cash);
      } else {
        selectedTowerId = null;
        renderer.selectedTowerId = null;
        towerPanel.clear();
      }
    }
  }, SIM_TICK_INTERVAL_MS);

  resize();
  loop.setCamera(camera);
  loop.start();

  return {
    stop() {
      window.clearInterval(tickTimer);
      loop.stop();
      window.removeEventListener('resize', resize);
    },
  };
}

if (typeof document !== 'undefined' && document.readyState !== 'loading') {
  bootstrap();
} else if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => bootstrap());
}
