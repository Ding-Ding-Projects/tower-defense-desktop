/**
 * An enemy has to be visible against the ground it walks on.
 *
 * Two of them were not. A walker was #8a6a52 against a path base of #7a6142, a distance
 * of 24; a runner was #7a5a48, a distance of 9. On the road they spend their whole
 * lives on, both read as a smudge in the dirt rather than as a figure, and nothing
 * anywhere said so, because every individual colour is perfectly reasonable on its own.
 * Camouflage is a property of a PAIR of colours, so it needs a check that looks at
 * pairs.
 *
 * The threshold is deliberately low. This is not an art critic; it catches the specific
 * failure of a figure painted nearly the colour of its background, and leaves every
 * genuine art-direction choice above it alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY, PATH, TERRAIN, colorDistance } from '../../src/render/art/palette.js';

/** Below this, a figure and its background are the same colour to the eye. */
const MINIMUM_SEPARATION = 30;

/** Every colour an enemy's body is actually painted with. */
const BODY_COLOURS = ['normal', 'fast', 'quick', 'flying', 'hidden', 'boss', 'metal', 'machineHull'];

test('no enemy is painted the colour of the path it walks on', () => {
  for (const key of BODY_COLOURS) {
    const colour = ENEMY[key];
    if (!colour) continue;
    const distance = colorDistance(colour, PATH.earthBase);
    assert.ok(
      distance >= MINIMUM_SEPARATION,
      key + ' (' + colour + ') is only ' + distance.toFixed(1) + ' from the path base ' +
        PATH.earthBase + '; it needs at least ' + MINIMUM_SEPARATION,
    );
  }
});

test('the check is looking at colours that really exist', () => {
  // A list of keys that have quietly been renamed would pass the check above by
  // checking nothing at all, which is the failure mode of every rule-shaped guard.
  const present = BODY_COLOURS.filter((key) => typeof ENEMY[key] === 'string');
  assert.equal(
    present.length, BODY_COLOURS.length,
    'these enemy colours no longer exist and are being checked for nothing: ' +
      BODY_COLOURS.filter((key) => !ENEMY[key]).join(', '),
  );
  assert.ok(typeof PATH.earthBase === 'string', 'the path base colour moved');
});

test('the outline is opaque enough to separate a figure from anything', () => {
  // The universal fallback: whatever the background turns out to be, a dark rim keeps
  // the silhouette readable. At 0.55 it was only doing that against light grass.
  const match = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(ENEMY.outline);
  assert.ok(match, 'the enemy outline is no longer an rgba colour: ' + ENEMY.outline);
  assert.ok(
    Number(match[1]) >= 0.75,
    'the outline is only ' + match[1] + ' opaque, which does not separate a figure from dirt',
  );
});
