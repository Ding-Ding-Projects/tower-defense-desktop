/**
 * The one thing the renderer calls to draw the whole in-canvas interface —
 * the shop, the tower panel, the HUD and the wave-state overlays — and to
 * answer "what did that click land on".
 *
 * It owns three things a single frame's worth of drawing cannot: the UI
 * scale transform every child panel is drawn through, which phase-change
 * should currently be showing an overlay (the one piece of cross-frame
 * memory in this directory, mirroring the `lastPhase` bookkeeping the old
 * HTML overlays used to do in app.js), and the offscreen accessibility
 * mirror that keeps a real, focusable, correctly-labelled control for every
 * drawn one.
 *
 * Call shape, every frame:
 *   layer.draw(ctx, { x: 0, y: 0, width: cssWidth, height: cssHeight }, state)
 * where `ctx` has already had `ctx.scale(dpr, dpr)` applied by the renderer
 * (see renderer.js) — everything in this directory, like everything else
 * the renderer draws, works in CSS pixels, never device pixels directly.
 *
 * `state` shape:
 *   {
 *     snapshot: { cash, lives, waveIndex, phase, intermissionSecondsRemaining, towers },
 *     gameData: { towers: Map<string, TowerDef> },
 *     totalWaves: number,
 *     selectedTowerId: string|null,
 *     placingTowerDefId: string|null,
 *     disallowedTowerIds?: string[],
 *     paused: boolean,
 *     uiScale?: number,             default 1; a user-facing "UI scale" preference
 *   }
 *
 * hitTest(x, y) and setHover(x, y) take the same coordinate space the
 * renderer already computes for battlefield picking: CSS pixels relative to
 * the canvas's top-left corner (`e.clientX - canvasRect.left`, see app.js's
 * existing `handleCanvasClick`). hitTest returns a described action object,
 * or null when the click belongs to the battlefield underneath.
 */
import { inset, row, stack } from './layout.js';
import { GameHud } from './hud.js';
import { ShopHud } from './shop.js';
import { TowerPanelHud } from './tower-panel.js';
import { OverlayHud } from './overlays.js';
import { AccessibilityMirror } from './a11y-mirror.js';

const CONTENT_PADDING = 8;
const SIDEBAR_GAP = 10;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 360;

export class InterfaceLayer {
  /**
   * @param {{doc?: Document|null}} [options]
   */
  constructor(options = {}) {
    this._doc = options.doc !== undefined ? options.doc : (typeof document !== 'undefined' ? document : null);
    this._hud = new GameHud();
    this._shop = new ShopHud();
    this._towerPanel = new TowerPanelHud();
    this._overlaysHud = new OverlayHud();
    this._mirror = new AccessibilityMirror(this._doc);
    this._mountHost = null;

    this._overlay = null;
    this._lastPhase = null;
    this._uiScale = 1;
    this._viewportRect = { x: 0, y: 0, width: 0, height: 0 };
  }

  /** Attaches the hidden, real-control accessibility mirror under `host`. */
  mountAccessibilityMirror(host) {
    this._mountHost = host;
    this._mirror.mount(host);
  }

  /** Detaches and clears the accessibility mirror. */
  unmountAccessibilityMirror() {
    this._mirror.unmount();
    this._mountHost = null;
  }

  destroy() {
    this.unmountAccessibilityMirror();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./layout.js').Rect} viewportRect
   * @param {object} state
   */
  draw(ctx, viewportRect, state) {
    const uiScale = state.uiScale && state.uiScale > 0 ? state.uiScale : 1;
    this._uiScale = uiScale;
    this._viewportRect = viewportRect;

    const snapshot = state.snapshot ?? {};
    const totalWaves = state.totalWaves ?? 0;
    this._updateOverlayState(snapshot, totalWaves);

    ctx.save();
    ctx.translate(viewportRect.x, viewportRect.y);
    ctx.scale(uiScale, uiScale);
    const local = { x: 0, y: 0, width: viewportRect.width / uiScale, height: viewportRect.height / uiScale };

    const hudState = {
      cash: snapshot.cash ?? 0,
      lives: snapshot.lives ?? 0,
      waveIndex: snapshot.waveIndex ?? 0,
      totalWaves,
      phase: snapshot.phase ?? 'intermission',
      intermissionSecondsRemaining: snapshot.intermissionSecondsRemaining ?? 0,
      paused: !!state.paused,
    };
    const hudHeight = local.width > 0 ? this._hud.measureBarHeight(ctx, local.width, hudState) : 0;
    const [hudRect, belowHud] = stack(local, [hudHeight, null], 0);
    if (hudHeight > 0) this._hud.draw(ctx, hudRect, hudState);

    const contentRect = inset(belowHud, CONTENT_PADDING);
    const gameData = state.gameData ?? { towers: new Map() };
    const towers = gameData.towers ?? new Map();

    const towerInstance = state.selectedTowerId
      ? (snapshot.towers ?? []).find((t) => t.id === state.selectedTowerId) ?? null
      : null;
    const towerDef = towerInstance ? towers.get(towerInstance.defId) ?? null : null;
    const showTowerPanel = !!(towerDef && towerInstance);

    const rawSidebarWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, contentRect.width * 0.34));
    const sidebarWidth = Math.min(rawSidebarWidth, Math.max(0, contentRect.width * 0.9));
    const [, sidebarRect] = row(contentRect, [null, sidebarWidth], SIDEBAR_GAP);

    let shopRect = sidebarRect;
    let towerPanelRect = null;
    if (showTowerPanel) {
      [shopRect, towerPanelRect] = stack(sidebarRect, [null, null], SIDEBAR_GAP);
    }

    const placementPoolCounts = new Map();
    for (const t of snapshot.towers ?? []) {
      placementPoolCounts.set(t.defId, (placementPoolCounts.get(t.defId) ?? 0) + 1);
    }
    if (shopRect.width > 0 && shopRect.height > 0) {
      this._shop.draw(ctx, shopRect, {
        towers,
        cash: snapshot.cash ?? 0,
        placementPoolCounts,
        disallowedTowerIds: state.disallowedTowerIds ?? [],
        selectedDefId: state.placingTowerDefId ?? null,
      });
    }

    if (showTowerPanel && towerPanelRect) {
      this._towerPanel.draw(ctx, towerPanelRect, { towerDef, tower: towerInstance, cash: snapshot.cash ?? 0 });
    } else {
      this._towerPanel.draw(ctx, { x: 0, y: 0, width: 0, height: 0 }, { towerDef: null, tower: null, cash: 0 });
    }

    this._overlaysHud.draw(ctx, local, { kind: this._overlay?.kind ?? null, payload: this._overlay?.payload ?? {} });

    ctx.restore();

    this._syncAccessibilityMirror(state);
  }

  /**
   * @param {number} x  CSS pixels, relative to the canvas's top-left corner
   * @param {number} y
   * @returns {object|null}
   */
  hitTest(x, y) {
    const { lx, ly } = this._toLocal(x, y);
    if (this._overlay) {
      const action = this._overlaysHud.hitTest(lx, ly);
      if (action && action.kind === 'dismissOverlay') this._overlay = null;
      return action;
    }
    return (
      this._hud.hitTest(lx, ly) ??
      this._shop.hitTest(lx, ly) ??
      this._towerPanel.hitTest(lx, ly) ??
      null
    );
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  setHover(x, y) {
    const { lx, ly } = this._toLocal(x, y);
    if (this._overlay) {
      this._overlaysHud.setHover(lx, ly);
      return;
    }
    this._hud.setHover(lx, ly);
    this._shop.setHover(lx, ly);
    this._towerPanel.setHover(lx, ly);
  }

  /** Scrolls the shop's tower list by `deltaY` pixels (e.g. from a wheel event). */
  scrollShop(deltaY) {
    this._shop.scroll(deltaY);
  }

  _toLocal(x, y) {
    const scale = this._uiScale || 1;
    return {
      lx: (x - this._viewportRect.x) / scale,
      ly: (y - this._viewportRect.y) / scale,
    };
  }

  _updateOverlayState(snapshot, totalWaves) {
    const phase = snapshot.phase ?? 'intermission';
    if (this._lastPhase == null) {
      this._lastPhase = phase;
      return;
    }
    if (phase === this._lastPhase) return;
    if (phase === 'active' && this._lastPhase === 'intermission') {
      // Remember the running leak total as the wave begins, so the cleared message
      // can report what this wave cost rather than what the whole match has cost.
      this._leaksAtWaveStart = snapshot.leakCount ?? 0;
      this._overlay = { kind: 'waveStart', payload: { waveIndex: snapshot.waveIndex ?? 0, totalWaves } };
    } else if (phase === 'intermission' && this._lastPhase === 'active') {
      const leaked = Math.max(0, (snapshot.leakCount ?? 0) - (this._leaksAtWaveStart ?? 0));
      this._overlay = {
        kind: 'waveClear',
        payload: {
          waveIndex: snapshot.waveIndex ?? 0,
          completionBonus: snapshot.waveCompletionBonus ?? 0,
          leaked,
        },
      };
    } else if (phase === 'victory') {
      this._overlay = { kind: 'victory', payload: { totalWaves } };
    } else if (phase === 'defeat') {
      this._overlay = { kind: 'defeat', payload: { waveIndex: snapshot.waveIndex ?? 0 } };
    }
    this._lastPhase = phase;
  }

  _syncAccessibilityMirror(state) {
    if (!this._mirror.isAvailable) return;
    const controls = [];
    if (this._overlay) {
      controls.push(...this._overlaysHud.accessibilityControls());
    } else {
      controls.push(...this._hud.accessibilityControls(!!state.paused));
      controls.push(...this._shop.accessibilityControls());
      controls.push(...this._towerPanel.accessibilityControls());
    }
    this._mirror.sync(controls, (action) => this._dispatchMirrorAction(action));
  }

  _dispatchMirrorAction(action) {
    if (!action) return;
    if (action.kind === 'dismissOverlay') this._overlay = null;
    if (this._mountHost && typeof this._mountHost.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      this._mountHost.dispatchEvent(new CustomEvent('interface-action', { bubbles: true, detail: action }));
    }
  }
}
