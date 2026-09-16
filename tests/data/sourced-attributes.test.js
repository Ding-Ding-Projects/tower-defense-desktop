/**
 * Ties the shipped tower rows back to the infobox evidence they were generated from.
 *
 * This exists because changing every tower's refund from 70 percent to a third moved
 * no test at all. The suite covers the mechanics with a synthetic fixture, which is
 * the right way to check a mechanic, and the consequence is that the real numbers had
 * nothing watching them: they could be corrected, or quietly un-corrected, and every
 * check would stay green either way.
 *
 * So these read the generated rows and the scrape cache and check they still agree.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RAW } from '../../src/data/loader.js';

const attributes = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../tools/wiki-cache/attributes.json', import.meta.url)), 'utf8'),
);
const byId = new Map(attributes.results.map((r) => [r.id, r]));

test('every tower refunds a third of what was spent, and the pages say so', () => {
  // The rule was not assumed: all thirteen pages list a base selling cost exactly
  // equal to a third of the base cost, truncated, with no exceptions. Before this was
  // read, every row shipped at 70 percent, which more than doubled every refund.
  for (const tower of RAW.towers) {
    const listed = byId.get(tower.id);
    assert.ok(listed, tower.id + ' has no infobox record to check against');
    assert.ok(
      Math.abs(tower.sellRefundFraction - 1 / 3) < 1e-12,
      tower.id + ' refunds ' + tower.sellRefundFraction + ', and the sourced rule is a third',
    );
    assert.equal(
      Math.trunc(tower.baseCost * tower.sellRefundFraction),
      listed.baseSell,
      tower.id + ' at $' + tower.baseCost + ' should sell for the listed $' + listed.baseSell,
    );
  }
});

test('the refund fraction survives being multiplied, not just divided', () => {
  // 0.3333 looks like the same number and is not: six of the thirteen towers cost a
  // multiple of three, and for those the tidied decimal truncates a dollar short.
  const tidy = 0.3333;
  const divisibleByThree = RAW.towers.filter((t) => t.baseCost % 3 === 0);
  assert.ok(divisibleByThree.length > 0, 'no tower exercises the case this guards');
  for (const tower of divisibleByThree) {
    assert.equal(
      Math.trunc(tower.baseCost * tower.sellRefundFraction),
      tower.baseCost / 3,
      tower.id + ' must refund exactly a third of $' + tower.baseCost,
    );
    assert.notEqual(
      Math.trunc(tower.baseCost * tidy),
      tower.baseCost / 3,
      tower.id + ' no longer demonstrates the rounding trap, so this check has stopped guarding it',
    );
  }
});

test('detection is per level, and matches the level the page names', () => {
  for (const tower of RAW.towers) {
    const listed = byId.get(tower.id);
    for (const level of tower.levels) {
      const expectedHidden = !listed.hidden.never && listed.hidden.fromLevel != null
        ? level.level >= listed.hidden.fromLevel
        : false;
      const expectedAir = !listed.flying.never && listed.flying.fromLevel != null
        ? level.level >= listed.flying.fromLevel
        : false;
      assert.equal(
        level.detectsHidden, expectedHidden,
        tower.id + ' level ' + level.level + ' hidden detection disagrees with "' + listed.hidden.raw + '"',
      );
      assert.equal(
        level.hitsAir, expectedAir,
        tower.id + ' level ' + level.level + ' flying detection disagrees with "' + listed.flying.raw + '"',
      );
    }
  }
});

test('the towers the old hand-written overlay got backwards stay corrected', () => {
  // Named individually on purpose. A rule-shaped check passes happily when a whole
  // tower disappears; these four were each wrong in a specific direction, and each is
  // pinned in that direction.
  const get = (id) => RAW.towers.find((t) => t.id === id);

  // Was marked as a hidden detector. It is not one at any level.
  assert.ok(get('ranger').levels.every((l) => !l.detectsHidden), 'ranger sees no hidden enemies');
  // Was marked as hitting flying enemies. It does not, at any level.
  assert.ok(get('turret').levels.every((l) => !l.hitsAir), 'turret cannot shoot flying enemies');
  // Was marked as not hitting flying enemies. It does, from the moment it is placed.
  assert.ok(get('sniper').levels.every((l) => l.hitsAir), 'sniper hits flying enemies from level 0');
  // Was marked as blind. It sees, but only from level 2.
  const scout = get('scout');
  assert.equal(scout.levels.find((l) => l.level === 1).detectsHidden, false);
  assert.equal(scout.levels.find((l) => l.level === 2).detectsHidden, true);
});

test('footprints come off the page, not from a default', () => {
  // Three towers are not the 1.5 the overlay gave everything, and a tower's footprint
  // decides what can be placed beside it.
  const sizes = new Map(RAW.towers.map((t) => [t.id, t.footprintRadius]));
  assert.equal(sizes.get('shotgunner'), 1);
  assert.equal(sizes.get('sniper'), 1.25);
  assert.equal(sizes.get('cowboy'), 1.25);
  assert.equal(sizes.get('turret'), 2);
  for (const tower of RAW.towers) {
    assert.equal(
      tower.footprintRadius, byId.get(tower.id).footprint,
      tower.id + ' footprint disagrees with its page',
    );
  }
});
