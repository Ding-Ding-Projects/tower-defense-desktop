/**
 * Wires requestAnimationFrame to the CanvasRenderer, decoupled from the 30 Hz
 * simulation tick. This is the runtime glue: it reads the SnapshotBuffer,
 * derives the render alpha, builds a ViewModel and draws it, every frame, at
 * whatever refresh rate the monitor is actually running. Not covered by
 * node --test (it needs a real rAF and a real canvas); the maths it calls
 * (computeAlpha, buildViewModel) are.
 */

import { SnapshotBuffer } from './interpolation.js';
import { buildViewModel } from './view-model.js';
import { ParticleSystem } from './particles.js';

export class RenderLoop {
  /**
   * @param {import('./renderer.js').CanvasRenderer} renderer
   */
  constructor(renderer) {
    this.renderer = renderer;
    this.buffer = new SnapshotBuffer();
    this.particles = new ParticleSystem();
    this._running = false;
    this._lastFrameMs = 0;
    this._rafHandle = null;
  }

  /** @param {import('./sim-interface.js').Snapshot} snapshot */
  pushSnapshot(snapshot) {
    this.buffer.push(snapshot, performance.now());
  }

  /**
   * Forget the match that just ended, so the next frame is not interpolated between two
   * different games.
   */
  resetForNewMatch() {
    this.buffer.reset();
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastFrameMs = performance.now();
    /** @param {number} nowMs */
    const frame = (nowMs) => {
      if (!this._running) return;
      const dt = Math.min(0.1, (nowMs - this._lastFrameMs) / 1000);
      this._lastFrameMs = nowMs;
      this.particles.update(dt);

      const { prev, next, alpha } = /** @type {{
        prev: import('./sim-interface.js').Snapshot|null,
        next: import('./sim-interface.js').Snapshot|null,
        alpha: number,
      }} */ (this.buffer.sample(nowMs));
      const viewModel = buildViewModel(prev, next, alpha);
      this.renderer.draw(viewModel, this.camera ?? { x: 0, y: 0, zoom: 1 }, this.particles);

      this._rafHandle = requestAnimationFrame(frame);
    };
    this._rafHandle = requestAnimationFrame(frame);
  }

  stop() {
    this._running = false;
    if (this._rafHandle !== null) cancelAnimationFrame(this._rafHandle);
  }

  /** @param {{ x: number, y: number, zoom: number }} camera */
  setCamera(camera) {
    this.camera = camera;
  }
}
