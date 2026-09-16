/**
 * The interface fits inside the window, at every size the product supports.
 *
 * The application declares a minimum of 960 by 600 and nothing had ever drawn it at
 * that size. Clipping is the one class of layout defect that is completely invisible
 * from the source: every panel computes a sensible rectangle, and the one that no
 * longer fits simply draws past the edge, which throws nothing and fails no check.
 *
 * Checked here rather than only from a capture because a capture proves one size on
 * one day. This runs the real interface layer, with a tower selected so the shop and
 * the upgrade panel are stacked in the sidebar together, which is the tightest the
 * layout ever gets.
 */
import { test } from 'node:test';
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setCanvasFactory, useDefaultCanvasFactory, clearArtCache } from '../../src/render/art/cache.js';
import { fakeCanvasFactory } from '../art/support/fake-context.js';
import { createFakeContext } from './fake-context.js';
import { InterfaceLayer } from '../../src/render/hud/interface-layer.js';
import { TowerPanelHud } from '../../src/render/hud/tower-panel.js';
import { makeGameData } from '../fixtures/game-data.js';

before(() => {
  clearArtCache();
  setCanvasFactory(fakeCanvasFactory());
});
after(() => {
  useDefaultCanvasFactory();
  clearArtCache();
});

/** The declared minimum from electron/main.cjs, plus sizes on either side of it. */
const VIEWPORTS = [
  { width: 960, height: 600, name: 'the declared minimum' },
  { width: 1280, height: 800, name: 'the default window' },
  { width: 1920, height: 1080, name: 'a full screen' },
  { width: 2560, height: 1440, name: 'a large screen' },
];

/**
 * Draw the whole interface with a tower selected, and report every rectangle it
 * filled or stroked.
 * @param {{width: number, height: number}} viewport
 * @param {number} uiScale
 */
function drawEverything(viewport, uiScale = 1) {
  const gameData = makeGameData();
  const ctx = createFakeContext();
  const layer = new InterfaceLayer({ doc: null });

  const snapshot = {
    cash: 100000,
    lives: 100,
    waveIndex: 3,
    phase: 'active',
    intermissionSecondsRemaining: 0,
    leakCount: 4,
    towers: [{
      id: 1, defId: 'gunner', level: 0, x: 0, y: 0,
      targetingMode: 'first', abilityCooldownRemainingSeconds: 0, totalSpent: 100,
    }],
    enemies: [],
    projectiles: [],
    events: [],
  };

  layer.draw(ctx, { x: 0, y: 0, width: viewport.width, height: viewport.height }, {
    snapshot,
    gameData,
    totalWaves: 40,
    // Selected, so the upgrade panel is drawn under the shop rather than hidden.
    selectedTowerId: 1,
    placingTowerDefId: null,
    paused: false,
    uiScale,
  });
  return ctx;
}

/**
 * Where each drawing call puts ink, as {x, y} points.
 *
 * Reading fillRect alone found six rectangles in the entire interface, because almost
 * all of it is drawn as paths: a rounded rectangle is arcTo and lineTo, not rect. A
 * check measuring the wrong calls reports a tidy layout about an interface it never
 * looked at, which is why the count assertion below exists.
 *
 * @param {{calls: any[][]}} ctx
 * @returns {{x: number, y: number}[]}
 */
function inkPoints(ctx) {
  const points = [];
  const push = (x, y) => {
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  };

  for (const call of ctx.calls) {
    const [name, ...args] = call;
    switch (name) {
      case 'fillRect':
      case 'strokeRect':
      case 'rect':
        push(args[0], args[1]);
        push(args[0] + args[2], args[1] + args[3]);
        break;
      case 'moveTo':
      case 'lineTo':
      case 'fillText':
        push(args[0], args[1]);
        break;
      case 'arcTo':
        push(args[0], args[1]);
        push(args[2], args[3]);
        break;
      case 'arc':
        // Centre plus radius on each side, so a circle poking out is caught.
        push(args[0] - args[2], args[1] - args[2]);
        push(args[0] + args[2], args[1] + args[2]);
        break;
      case 'ellipse':
        push(args[0] - args[2], args[1] - args[3]);
        push(args[0] + args[2], args[1] + args[3]);
        break;
      case 'drawImage':
        push(args[1], args[2]);
        push(args[1] + (args[3] ?? 0), args[2] + (args[4] ?? 0));
        break;
      default:
        break;
    }
  }
  return points;
}

for (const viewport of VIEWPORTS) {
  test('nothing is drawn outside ' + viewport.name + ' (' + viewport.width + 'x' + viewport.height + ')', () => {
    const ctx = drawEverything(viewport);
    const points = inkPoints(ctx);
    assert.ok(
      points.length > 200,
      'the interface barely drew anything: ' + points.length + ' points, so this is measuring the wrong calls',
    );

    // Two pixels of slack: a stroke sits ON the boundary and is half a line width
    // either side of it, and a rounded corner's control point can sit a hair outside
    // the curve it produces.
    const slack = 2;
    const escaped = points.filter((p) =>
      p.x < -slack ||
      p.y < -slack ||
      p.x > viewport.width + slack ||
      p.y > viewport.height + slack,
    );
    assert.deepEqual(
      escaped.slice(0, 3),
      [],
      escaped.length + ' point(s) landed outside the ' + viewport.width + 'x' + viewport.height +
        ' window, first at ' + JSON.stringify(escaped[0]),
    );
  });
}

test('the battlefield keeps most of the window even at the minimum size', () => {
  // The sidebar is capped at a share of the width AND an absolute maximum. Without
  // both, a narrow window ends up almost entirely shop, and the thing the player is
  // actually playing becomes a strip down the side.
  const viewport = VIEWPORTS[0];
  const ctx = drawEverything(viewport);

  // Ink BELOW the top bar only, and with no filter on x.
  //
  // A first version narrowed to points right of 40% of the width before taking the
  // minimum, which made it structurally incapable of noticing a sidebar that had grown
  // past 40%: the very thing it claimed to check. Widening the sidebar cap to 1400 left
  // it perfectly green. The top bar genuinely spans the full width, so excluding it by
  // height is the only restriction that is honest here.
  const belowTopBar = inkPoints(ctx).filter((p) => p.y > 140);
  assert.ok(belowTopBar.length > 100, 'nothing was drawn below the top bar, so this proves nothing');
  const leftmostSidebarEdge = Math.min(...belowTopBar.map((p) => p.x));
  assert.ok(
    leftmostSidebarEdge > viewport.width * 0.55,
    'the interface starts at x=' + leftmostSidebarEdge + ' of ' + viewport.width +
      ', leaving the battlefield less than half the window',
  );
});

/**
 * The interface-scale steps a user is most likely to run at.
 *
 * `uiScale` is threaded all the way through interface-layer and is currently pinned to
 * 1 in app.js, so these guard a preference that is not exposed yet rather than a
 * shipping defect. They are here because the moment it IS exposed is the moment this
 * breaks, and the person who needs a larger interface is not the person who built it.
 */
const SCALES = [1, 1.25, 1.5, 2];

const MIN_LOGICAL = { width: 960, height: 600 };

for (const scale of SCALES) {
  test('the interface fits at ' + (scale * 100) + ' percent scale in a window sized for it', () => {
    // The contract is about LOGICAL area, not pixels: the interface needs 960 by 600 of
    // space to lay itself out in, and at 200 percent scale that means a 1920 by 1200
    // window. Asking it to fit both a shop and a full upgrade panel into the 480 by 300
    // that 200 percent leaves in the smallest window is asking for something the layout
    // does not claim and should not pretend to.
    const viewport = { width: MIN_LOGICAL.width * scale, height: MIN_LOGICAL.height * scale };
    const points = inkPoints(drawEverything(viewport, scale));
    assert.ok(points.length > 200, 'nothing much was drawn, so this proves nothing');

    // Bounded against the local space, because interface-layer applies ctx.scale and
    // then lays out inside viewport / uiScale, so the coordinates reaching the context
    // are the pre-scale ones. Comparing them against the window made every scale above
    // 1 pass trivially.
    const escaped = points.filter((p) =>
      p.x < -2 || p.y < -2 || p.x > MIN_LOGICAL.width + 2 || p.y > MIN_LOGICAL.height + 2,
    );
    assert.deepEqual(
      escaped.slice(0, 3),
      [],
      'at ' + (scale * 100) + ' percent scale, ' + escaped.length +
        ' point(s) landed outside the layout area, first at ' + JSON.stringify(escaped[0]),
    );
  });
}

test('the smallest window still fits at 125 percent scale, which it did not', () => {
  // The specific case the even sidebar split broke, kept as its own check because the
  // scale checks above size the window to suit and so cannot see it. A user on a small
  // screen who turns the interface up one notch is a real person, and this is exactly
  // where their buttons used to run off the bottom.
  const viewport = { width: 960, height: 600 };
  const scale = 1.25;
  const points = inkPoints(drawEverything(viewport, scale));
  const bound = { width: viewport.width / scale, height: viewport.height / scale };
  const escaped = points.filter((p) => p.x > bound.width + 2 || p.y > bound.height + 2);
  assert.deepEqual(
    escaped.slice(0, 3),
    [],
    escaped.length + ' point(s) ran outside a 960x600 window at 125 percent scale, first at ' +
      JSON.stringify(escaped[0]),
  );
});

test('the upgrade panel is given the height it measures, not half the sidebar', () => {
  // An even split gave the scrolling shop more room than it needs and the panel, which
  // does not scroll, less than it needs. At 125 percent scale in the smallest supported
  // window the panel's own buttons ran off the bottom of the screen.
  const ctx = createFakeContext();
  const gameData = makeGameData();
  const panel = new TowerPanelHud();
  const needed = panel.measureHeight(ctx, 320, {
    towerDef: gameData.towers.get('gunner'),
    tower: {
      id: 1, defId: 'gunner', level: 0, x: 0, y: 0,
      targetingMode: 'first', abilityCooldownRemainingSeconds: 0, totalSpent: 100,
    },
    cash: 100000,
  });
  assert.ok(needed > 150, 'the panel measured ' + needed + ', which is not a real panel');
  assert.ok(needed < 600, 'the panel measured ' + needed + ', which would squeeze the shop out');
});

test('a panel with nothing selected measures nothing', () => {
  const ctx = createFakeContext();
  const panel = new TowerPanelHud();
  assert.equal(panel.measureHeight(ctx, 320, { towerDef: null, tower: null, cash: 0 }), 0);
});
