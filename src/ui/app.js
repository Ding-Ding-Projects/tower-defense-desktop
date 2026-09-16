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
import { InterfaceLayer } from '../render/hud/interface-layer.js';
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

  // The shop, the heads-up display, the tower panel and the wave overlays used to be
  // HTML alongside the canvas, which made the whole thing read as a web page with a
  // sidebar rather than as a game. They are now drawn inside the canvas, in the game's
  // own style, by the interface layer below. The canvas gets the whole window.
  main.append(canvas);
  root.appendChild(main);

  const interfaceLayer = new InterfaceLayer({ doc });
  interfaceLayer.mountAccessibilityMirror(root);

  const pauseSettings = new PauseAndSettings(doc);
  pauseSettings.mount(root);

  const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  pauseSettings.setSystemReducedMotionHint(reducedMotionQuery?.matches ?? false);

  const renderer = new CanvasRenderer(canvas, gameData, mapDef);
  const loop = new RenderLoop(renderer);
  renderer.reducedMotion = reducedMotionQuery?.matches ?? false;
  renderer.interfaceLayer = interfaceLayer;

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


  /**
   * Every action the interface can produce, from a pointer or from the hidden
   * accessibility mirror. Both routes land here so a keyboard user and a mouse user
   * cannot drift apart.
   * @param {{ kind: string } & Record<string, any>} action
   */
  function handleInterfaceAction(action) {
    switch (action.kind) {
      case 'buyTower':
        placingTowerDefId = action.towerId;
        renderer.placingTowerDefId = placingTowerDefId;
        selectedTowerId = null;
        renderer.selectedTowerId = null;
        break;
      case 'upgradeTower':
        if (selectedTowerId !== null) sim.submitCommand(matchState, { kind: 'upgradeTower', towerId: selectedTowerId });
        break;
      case 'sellTower':
        if (selectedTowerId !== null) {
          sim.submitCommand(matchState, { kind: 'sellTower', towerId: selectedTowerId });
          selectedTowerId = null;
          renderer.selectedTowerId = null;
        }
        break;
      case 'useAbility':
        if (selectedTowerId !== null) sim.submitCommand(matchState, { kind: 'castAbility', towerId: selectedTowerId });
        break;
      case 'cycleTargeting': {
        if (selectedTowerId === null) break;
        const snap = sim.snapshot(matchState);
        const tower = snap.towers.find((t) => t.id === selectedTowerId);
        if (!tower) break;
        const def = gameData.towers.get(tower.defId);
        const next = cycleTargetingMode(tower.targetingMode, def.targetingModes ?? ALL_TARGETING_MODES, 1);
        sim.submitCommand(matchState, { kind: 'setTargetingMode', towerId: selectedTowerId, mode: next });
        break;
      }
      case 'skipIntermission':
        sim.submitCommand(matchState, { kind: 'skipIntermission' });
        break;
      case 'togglePause':
        paused = !paused;
        if (paused) pauseSettings.openPause();
        break;
      case 'dismissOverlay':
        interfaceLayer.dismissOverlay?.();
        break;
      case 'overlayBlocked':
        // A click inside a modal overlay that missed its button. Swallowed on
        // purpose so it never falls through to the battlefield underneath.
        break;
      default:
        break;
    }
  }

  root.addEventListener('interface-action', (e) => handleInterfaceAction(e.detail));
  // --- input: pan, zoom, select/place ---
  let isDragging = false;
  let dragLast = null;

  /** Canvas-local coordinates, the same space the interface layer lays itself out in. */
  function localPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    const local = localPoint(e);
    // The interface is drawn inside the canvas, so a click has to be offered to it
    // before the battlefield. Dragging the map from underneath a panel would be a
    // surprising way to lose a placement.
    if (interfaceLayer.hitTest(local.x, local.y)) return;
    isDragging = true;
    dragLast = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', (e) => {
    const moved = dragLast && Math.hypot(e.clientX - dragLast.x, e.clientY - dragLast.y) > 4;
    isDragging = false;
    const local = localPoint(e);
    const action = interfaceLayer.hitTest(local.x, local.y);
    if (action) { handleInterfaceAction(action); return; }
    if (!moved) handleCanvasClick(e);
  });
  canvas.addEventListener('pointerleave', () => { isDragging = false; });
  canvas.addEventListener('pointermove', (e) => {
    const local = localPoint(e);
    interfaceLayer.setHover(local.x, local.y);
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
      else { selectedTowerId = null; renderer.selectedTowerId = null;  }
    } else return;
    loop.setCamera(camera);
  });

  // The shop, tower panel and heads-up display no longer post DOM events: every one
  // of their actions now arrives through handleInterfaceAction above, from either a
  // pointer or the hidden accessibility mirror.

  // --- pause / settings ---
  // Pause is a control inside the canvas now; it arrives as a togglePause action.
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
    
    lastPhase = null;
  });

  // --- fixed-rate simulation tick, decoupled from the render loop ---
  const tickTimer = window.setInterval(() => {
    if (paused) return;
    sim.tick(matchState);
    const snap = sim.snapshot(matchState);
    loop.pushSnapshot(snap);

    if (snap.phase !== lastPhase) {
      // Wave, victory and defeat states are drawn by the interface layer inside the
      // canvas now, from the phase in the snapshot it is handed every tick. There is
      // nothing to push at an HTML dialog.
      interfaceLayer.onPhaseChange?.(snap.phase, snap.waveIndex, totalWaves);
      lastPhase = snap.phase;
    }

    const placementPoolCounts = new Map();
    for (const t of snap.towers) {
      placementPoolCounts.set(t.defId, (placementPoolCounts.get(t.defId) ?? 0) + 1);
    }
    // One object, handed to the layer, drawn inside the canvas next frame.
    renderer.interfaceState = {
      snapshot: snap,
      gameData,
      totalWaves,
      selectedTowerId,
      placingTowerDefId,
      disallowedTowerIds: difficultyDef.disallowedTowers ?? [],
      paused,
      uiScale: 1,
    };

    if (selectedTowerId) {
      const tower = snap.towers.find((t) => t.id === selectedTowerId);
      if (tower) {
        const def = gameData.towers.get(tower.defId);
      } else {
        selectedTowerId = null;
        renderer.selectedTowerId = null;
        
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
