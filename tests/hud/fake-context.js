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
    // Recorded like everything else, so a check can assert that a card drew a
    // portrait rather than merely that it did not throw while trying to.
    drawImage: record('drawImage'),
    // Returns a real stop-recording stub rather than being absent, so the checks
    // exercise the gradient path the app actually takes instead of the flat fallback
    // beside it. A fallback nobody notices being taken is a fallback that becomes the
    // only path.
    createRadialGradient: (...args) => {
      const stops = [];
      calls.push(['createRadialGradient', ...args]);
      return { stops, addColorStop: (offset, color) => stops.push([offset, color]) };
    },
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
