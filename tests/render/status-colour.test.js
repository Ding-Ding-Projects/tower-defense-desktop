/**
 * Every shipped status has a colour, and there is one place that decides it.
 *
 * There were two. `STATUS_TINT` lives in the palette, which is the module that exists so
 * colour is decided once, and it was exported and read by nothing whatsoever -- one
 * definition, no consumers, in the whole tree. The renderer's status icons carried their
 * own copy of the table instead, and the two had drifted: haste was `#ff6b9d` in the
 * renderer and `#ffe08a` in the palette, so the palette's value described nothing that
 * was ever drawn.
 *
 * The copy was also rebuilt on every call -- once per status, per enemy, per frame. A
 * wave of forty-five enemies under a Freezer allocates that object thousands of times a
 * second, inside a renderer that pools its projectiles and its particles precisely so it
 * never does this.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { STATUS_TINT } from '../../src/render/art/palette.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** The ids of every status the game ships. */
function shippedStatusIds() {
  const dir = ROOT + 'src/data/statuses/';
  return readdirSync(dir).map((file) => JSON.parse(readFileSync(dir + file, 'utf8')).id).sort();
}

test('every shipped status has a colour, and the palette has no spares', () => {
  // Both directions. A status with no colour is drawn in the unknown grey, which is a
  // deliberate fallback rather than a place to put real statuses; a colour for a status
  // that does not exist is a value nobody can ever see being wrong.
  assert.deepEqual(
    Object.keys(STATUS_TINT).sort(), shippedStatusIds(),
    'the palette knows [' + Object.keys(STATUS_TINT).sort().join(', ') +
      '] and the game ships [' + shippedStatusIds().join(', ') + ']',
  );
});

test('every colour is a real hex colour', () => {
  for (const [id, colour] of Object.entries(STATUS_TINT)) {
    assert.match(colour, /^#[0-9a-f]{6}$/i, id + ' has a colour of ' + JSON.stringify(colour));
  }
});

test('no two statuses share a colour', () => {
  // They are drawn as small dots in a row under an enemy, so two statuses the same
  // colour are two marks a player cannot tell apart at any zoom.
  const seen = new Map();
  for (const [id, colour] of Object.entries(STATUS_TINT)) {
    const other = seen.get(colour.toLowerCase());
    assert.equal(other, undefined, id + ' and ' + other + ' are both ' + colour);
    seen.set(colour.toLowerCase(), id);
  }
});

test('the renderer takes its status colours from the palette', () => {
  // The defect this file exists for: a second table in the renderer, drifted from the
  // first, with the palette copy read by nothing.
  const source = readFileSync(ROOT + 'src/render/renderer.js', 'utf8');
  const start = source.indexOf('_drawStatusIcon(x, y, status, zoom) {');
  assert.ok(start > 0, 'could not find the status icon drawing');
  const fn = source.slice(start, source.indexOf('\n  }', start));
  assert.match(fn, /STATUS_TINT\[/, 'the status icons no longer read the palette');
  assert.doesNotMatch(
    fn, /\b(?:stun|slow|freeze|burn|poison|exposed|haste)\s*:\s*'#/,
    'the renderer has grown its own copy of the status colour table again',
  );
});

test('the colour table is not rebuilt on every call', () => {
  // A literal inside the function is allocated once per status, per enemy, per frame.
  const source = readFileSync(ROOT + 'src/render/renderer.js', 'utf8');
  const start = source.indexOf('_drawStatusIcon(x, y, status, zoom) {');
  const fn = source.slice(start, source.indexOf('\n  }', start));
  assert.doesNotMatch(
    fn, /const \w+ = \{[\s\S]*?:\s*'#[0-9a-f]{6}'/i,
    'the status icon function builds a colour object every time it is called, which is ' +
      'once per status per enemy per frame',
  );
});

test('an unrecognised status is still drawn, not skipped', () => {
  // Grey rather than invisible. A status the palette has no colour for is still
  // something the enemy is carrying, and a player who sees an unfamiliar mark will ask
  // about it, where one who sees nothing will not.
  const source = readFileSync(ROOT + 'src/render/renderer.js', 'utf8');
  const start = source.indexOf('_drawStatusIcon(x, y, status, zoom) {');
  const fn = source.slice(start, source.indexOf('\n  }', start));
  assert.match(
    fn, /\?\?\s*UNKNOWN_STATUS_TINT/,
    'an unrecognised status has no fallback colour, so it draws with whatever fillStyle ' +
      'the previous call happened to leave behind',
  );
});
