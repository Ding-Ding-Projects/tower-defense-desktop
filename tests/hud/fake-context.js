/**
 * A fake CanvasRenderingContext2D for tests/hud/**: records every call it
 * receives and returns a plausible, deterministic `measureText` width (7px
 * per character, ignoring the current font) rather than throwing, so the
 * pure layout/hit-test/text-wrapping logic in src/render/hud can be
 * exercised by `node --test` without a browser or a real canvas.
 *
 * Not itself a *.test.js file, so `npm test`'s glob never tries to run it.
 */
export function createFakeContext() {
  const calls = [];
  const record = (name) => (...args) => {
    calls.push([name, ...args]);
  };
  return {
    calls,
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arcTo: record('arcTo'),
    arc: record('arc'),
    rect: record('rect'),
    clip: record('clip'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    fillText: record('fillText'),
    scale: record('scale'),
    translate: record('translate'),
    measureText(text) {
      return { width: String(text ?? '').length * 7 };
    },
  };
}
